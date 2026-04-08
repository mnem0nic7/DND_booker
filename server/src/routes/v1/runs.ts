import { Router } from 'express';
import {
  AgentActionSchema,
  AgentCheckpointSchema,
  AgentRunCreateSchema,
  AgentRunDetailSchema,
  AgentRunSchema,
  AgentRunSummarySchema,
  ArtifactEvaluationSchema,
  AssemblyManifestSchema,
  CanonEntitySchema,
  GenerationRunCreateSchema,
  GenerationRunDetailSchema,
  GenerationRunSchema,
  GraphInterruptResolutionRequestSchema,
  GraphInterruptSchema,
  V1GeneratedArtifactDetailSchema,
  V1GeneratedArtifactSchema,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import {
  createRun,
  getRun,
  listRuns,
  transitionRunStatus,
} from '../../services/generation/run.service.js';
import { enqueueGenerationRun } from '../../services/generation/queue.service.js';
import { publishGenerationEvent, subscribeToRun } from '../../services/generation/pubsub.service.js';
import {
  getExportReviewArtifactForRun,
  isExportReviewArtifactId,
} from '../../services/generation/export-review-artifact.service.js';
import {
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  transitionAgentRunStatus,
  updateAgentRunState,
} from '../../services/agent/run.service.js';
import { enqueueAgentRun } from '../../services/agent/queue.service.js';
import { publishAgentEvent, subscribeToAgentRun } from '../../services/agent/pubsub.service.js';
import { listAgentCheckpoints, restoreAgentCheckpoint } from '../../services/agent/checkpoint.service.js';
import { listAgentActions } from '../../services/agent/log.service.js';
import {
  listAgentRunInterrupts,
  listGenerationRunInterrupts,
  listProjectPendingInterrupts,
  resolveAgentRunInterrupt,
  resolveGenerationRunInterrupt,
} from '../../services/graph/interrupt.service.js';

const v1RunRoutes = Router({ mergeParams: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toTransportJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

function hasAcknowledgedGenerationPause(graphStateJson: unknown) {
  if (!isRecord(graphStateJson)) return false;
  const runtime = isRecord(graphStateJson.runtime) ? graphStateJson.runtime : graphStateJson;
  const interrupted = isRecord(runtime.interrupted) ? runtime.interrupted : null;
  return interrupted?.kind === 'paused';
}

v1RunRoutes.get(
  '/interrupts',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const interrupts = await listProjectPendingInterrupts(projectId, authReq.userId!);
    if (!interrupts) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(GraphInterruptSchema.array().parse(interrupts));
  }),
);

v1RunRoutes.post(
  '/generation-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const parsed = GenerationRunCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const run = await createRun({
      projectId,
      userId: authReq.userId!,
      prompt: parsed.data.prompt,
      mode: parsed.data.mode,
      quality: parsed.data.quality,
      pageTarget: parsed.data.pageTarget,
      constraints: parsed.data.constraints,
    });

    if (!run) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await enqueueGenerationRun(run.id, authReq.userId!, projectId);
    res.status(201).json(GenerationRunSchema.parse(toTransportJson(run)));
  }),
);

v1RunRoutes.get(
  '/generation-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const runs = await listRuns(projectId, authReq.userId!);
    if (!runs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(GenerationRunSchema.array().parse(toTransportJson(runs)));
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const [taskCount, artifactCount, exportReviewArtifact] = await Promise.all([
      prisma.generationTask.count({ where: { runId } }),
      prisma.generatedArtifact.count({ where: { runId } }),
      getExportReviewArtifactForRun(run, authReq.userId!),
    ]);

    res.json(GenerationRunDetailSchema.parse(toTransportJson({
      ...run,
      taskCount,
      artifactCount: artifactCount + (exportReviewArtifact ? 1 : 0),
      latestExportReview: exportReviewArtifact?.jsonContent ?? null,
    })));
  }),
);

for (const action of ['pause', 'resume', 'cancel'] as const) {
  v1RunRoutes.post(
    `/generation-runs/:runId/${action}`,
    requireAuth,
    validateUuid('projectId', 'runId'),
    asyncHandler(async (req, res) => {
      const authReq = req as AuthRequest;
      const runId = req.params.runId as string;
      const projectId = req.params.projectId as string;

      if (action === 'resume') {
        const run = await getRun(runId, authReq.userId!);
        if (!run || run.status !== 'paused') {
          res.status(409).json({ error: 'Run is not paused' });
          return;
        }

        if (!hasAcknowledgedGenerationPause(run.graphStateJson)) {
          res.status(409).json({ error: 'Run has not yet reached a resumable checkpoint' });
          return;
        }

        const resumeStage = (run.currentStage ?? 'planning') as Parameters<typeof transitionRunStatus>[2];
        const result = await transitionRunStatus(runId, authReq.userId!, resumeStage);
        if (!result) {
          res.status(409).json({ error: 'Cannot resume this run' });
          return;
        }

        await enqueueGenerationRun(runId, authReq.userId!, projectId, { priority: 10 });

        res.json(GenerationRunSchema.parse(toTransportJson(result)));
        return;
      }

      const status = action === 'pause' ? 'paused' : 'cancelled';
      const result = await transitionRunStatus(runId, authReq.userId!, status);
      if (!result) {
        res.status(409).json({ error: `Cannot ${action} this run` });
        return;
      }

      res.json(GenerationRunSchema.parse(toTransportJson(result)));
    }),
  );
}

v1RunRoutes.get(
  '/generation-runs/:runId/events',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const subscription = await subscribeToRun(runId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      void subscription.unsubscribe();
      res.end();
    });
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId/interrupts',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const interrupts = await listGenerationRunInterrupts(runId, authReq.userId!);
    if (!interrupts) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(GraphInterruptSchema.array().parse(toTransportJson(interrupts)));
  }),
);

v1RunRoutes.post(
  '/generation-runs/:runId/interrupts/:interruptId/resolve',
  requireAuth,
  validateUuid('projectId', 'runId', 'interruptId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const interruptId = req.params.interruptId as string;
    const parsed = GraphInterruptResolutionRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const result = await resolveGenerationRunInterrupt(
      runId,
      authReq.userId!,
      interruptId,
      parsed.data.action,
      parsed.data.payload,
    );

    if (result.status === 'run_not_found') {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    if (result.status === 'interrupt_not_found') {
      res.status(404).json({ error: 'Interrupt not found' });
      return;
    }

    if (result.status === 'interrupt_not_pending') {
      res.status(409).json({ error: 'Interrupt has already been resolved' });
      return;
    }

    if (parsed.data.action === 'reject') {
      const cancelled = await transitionRunStatus(runId, authReq.userId!, 'cancelled');
      if (cancelled) {
        await publishGenerationEvent(runId, {
          type: 'run_status',
          runId,
          status: cancelled.status,
          stage: cancelled.currentStage,
          progressPercent: cancelled.progressPercent,
        });
      }
    }

    res.json(GraphInterruptSchema.parse(toTransportJson(result.interrupt)));
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId/artifacts',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const [artifacts, exportReviewArtifact] = await Promise.all([
      prisma.generatedArtifact.findMany({
        where: { runId },
        orderBy: { createdAt: 'asc' },
      }),
      getExportReviewArtifactForRun(run, authReq.userId!),
    ]);

    res.json(V1GeneratedArtifactSchema.array().parse(toTransportJson(
      exportReviewArtifact ? [...artifacts, exportReviewArtifact] : artifacts,
    )));
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId/artifacts/:artifactId',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const artifactId = req.params.artifactId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    if (isExportReviewArtifactId(artifactId)) {
      const exportReviewArtifact = await getExportReviewArtifactForRun(run, authReq.userId!);
      if (!exportReviewArtifact || exportReviewArtifact.id !== artifactId) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }

      res.json(V1GeneratedArtifactDetailSchema.parse(toTransportJson({
        ...exportReviewArtifact,
        evaluations: [],
      })));
      return;
    }

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { id: artifactId, runId },
      include: { evaluations: { orderBy: { createdAt: 'desc' } } },
    });

    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    res.json(V1GeneratedArtifactDetailSchema.parse(toTransportJson(artifact)));
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId/canon',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const entities = await prisma.canonEntity.findMany({
      where: { runId },
      orderBy: [{ entityType: 'asc' }, { canonicalName: 'asc' }],
    });

    res.json(CanonEntitySchema.array().parse(toTransportJson(entities)));
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId/evaluations',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const evaluations = await prisma.artifactEvaluation.findMany({
      where: { artifact: { runId } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(ArtifactEvaluationSchema.array().parse(toTransportJson(evaluations)));
  }),
);

v1RunRoutes.get(
  '/generation-runs/:runId/assembly',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const manifest = await prisma.assemblyManifest.findFirst({
      where: { runId },
      orderBy: { version: 'desc' },
    });

    if (!manifest) {
      res.status(404).json({ error: 'No assembly manifest found' });
      return;
    }

    res.json(AssemblyManifestSchema.parse(toTransportJson(manifest)));
  }),
);

v1RunRoutes.post(
  '/agent-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const parsed = AgentRunCreateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const run = await createAgentRun({
      projectId,
      userId: authReq.userId!,
      mode: parsed.data.mode,
      objective: parsed.data.objective,
      prompt: parsed.data.prompt,
      generationMode: parsed.data.generationMode,
      generationQuality: parsed.data.generationQuality,
      pageTarget: parsed.data.pageTarget,
      budget: parsed.data.budget,
    });

    if (!run) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await enqueueAgentRun(run.id, authReq.userId!, projectId);
    res.status(201).json(AgentRunSchema.parse(toTransportJson(run)));
  }),
);

v1RunRoutes.get(
  '/agent-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const runs = await listAgentRuns(projectId, authReq.userId!);
    if (!runs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(AgentRunSummarySchema.array().parse(toTransportJson(runs)));
  }),
);

v1RunRoutes.get(
  '/agent-runs/:runId',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getAgentRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const [checkpointCount, actionCount] = await Promise.all([
      prisma.agentCheckpoint.count({ where: { runId } }),
      prisma.agentAction.count({ where: { runId } }),
    ]);

    res.json(AgentRunDetailSchema.parse(toTransportJson({ ...run, checkpointCount, actionCount })));
  }),
);

for (const action of ['pause', 'resume', 'cancel'] as const) {
  v1RunRoutes.post(
    `/agent-runs/:runId/${action}`,
    requireAuth,
    validateUuid('projectId', 'runId'),
    asyncHandler(async (req, res) => {
      const authReq = req as AuthRequest;
      const runId = req.params.runId as string;

      if (action === 'resume') {
        const run = await getAgentRun(runId, authReq.userId!);
        if (!run || run.status !== 'paused') {
          res.status(409).json({ error: 'Run is not paused' });
          return;
        }

        const resumeStage = (run.currentStage ?? 'observing') as Parameters<typeof transitionAgentRunStatus>[2];
        const result = await transitionAgentRunStatus(runId, authReq.userId!, resumeStage);
        if (!result) {
          res.status(409).json({ error: 'Cannot resume this run' });
          return;
        }

        await publishAgentEvent(runId, {
          type: 'run_status',
          runId,
          status: result.status,
          stage: result.currentStage,
          progressPercent: result.progressPercent,
        });

        res.json(AgentRunSchema.parse(toTransportJson(result)));
        return;
      }

      const status = action === 'pause' ? 'paused' : 'cancelled';
      const result = await transitionAgentRunStatus(runId, authReq.userId!, status);
      if (!result) {
        res.status(409).json({ error: `Cannot ${action} this run` });
        return;
      }

      await publishAgentEvent(runId, {
        type: 'run_status',
        runId,
        status: result.status,
        stage: result.currentStage,
        progressPercent: result.progressPercent,
      });

      res.json(AgentRunSchema.parse(toTransportJson(result)));
    }),
  );
}

v1RunRoutes.get(
  '/agent-runs/:runId/interrupts',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const interrupts = await listAgentRunInterrupts(runId, authReq.userId!);
    if (!interrupts) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(GraphInterruptSchema.array().parse(toTransportJson(interrupts)));
  }),
);

v1RunRoutes.post(
  '/agent-runs/:runId/interrupts/:interruptId/resolve',
  requireAuth,
  validateUuid('projectId', 'runId', 'interruptId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const interruptId = req.params.interruptId as string;
    const parsed = GraphInterruptResolutionRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const result = await resolveAgentRunInterrupt(
      runId,
      authReq.userId!,
      interruptId,
      parsed.data.action,
      parsed.data.payload,
    );

    if (result.status === 'run_not_found') {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    if (result.status === 'interrupt_not_found') {
      res.status(404).json({ error: 'Interrupt not found' });
      return;
    }

    if (result.status === 'interrupt_not_pending') {
      res.status(409).json({ error: 'Interrupt has already been resolved' });
      return;
    }

    if (parsed.data.action === 'reject') {
      const cancelled = await transitionAgentRunStatus(runId, authReq.userId!, 'cancelled');
      if (cancelled) {
        await publishAgentEvent(runId, {
          type: 'run_status',
          runId,
          status: cancelled.status,
          stage: cancelled.currentStage,
          progressPercent: cancelled.progressPercent,
        });
      }
    }

    res.json(GraphInterruptSchema.parse(toTransportJson(result.interrupt)));
  }),
);

v1RunRoutes.get(
  '/agent-runs/:runId/checkpoints',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const checkpoints = await listAgentCheckpoints(runId, authReq.userId!);
    if (!checkpoints) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(AgentCheckpointSchema.array().parse(toTransportJson(checkpoints)));
  }),
);

v1RunRoutes.post(
  '/agent-runs/:runId/checkpoints/:checkpointId/restore',
  requireAuth,
  validateUuid('projectId', 'runId', 'checkpointId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const checkpointId = req.params.checkpointId as string;
    const restored = await restoreAgentCheckpoint(runId, checkpointId, authReq.userId!);
    if (!restored) {
      res.status(404).json({ error: 'Checkpoint not found' });
      return;
    }

    await updateAgentRunState({
      runId,
      latestCheckpointId: restored.id,
    });

    await publishAgentEvent(runId, {
      type: 'checkpoint_restored',
      runId,
      checkpointId: restored.id,
      label: restored.label,
    });

    res.json(AgentCheckpointSchema.parse(toTransportJson(restored)));
  }),
);

v1RunRoutes.get(
  '/agent-runs/:runId/actions',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const actions = await listAgentActions(runId, authReq.userId!);
    if (!actions) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(AgentActionSchema.array().parse(toTransportJson(actions)));
  }),
);

v1RunRoutes.get(
  '/agent-runs/:runId/events',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getAgentRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const subscription = await subscribeToAgentRun(runId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      void subscription.unsubscribe();
      res.end();
    });
  }),
);

export default v1RunRoutes;
