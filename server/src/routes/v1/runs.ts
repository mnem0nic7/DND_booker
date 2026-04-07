import { Router } from 'express';
import {
  AgentActionSchema,
  AgentCheckpointSchema,
  AgentRunCreateSchema,
  AgentRunDetailSchema,
  AgentRunSchema,
  AgentRunSummarySchema,
  GenerationRunCreateSchema,
  GenerationRunDetailSchema,
  GenerationRunSchema,
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
import { subscribeToRun } from '../../services/generation/pubsub.service.js';
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

const v1RunRoutes = Router({ mergeParams: true });

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
    res.status(201).json(GenerationRunSchema.parse(run));
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

    res.json(GenerationRunSchema.array().parse(runs));
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

    const [taskCount, artifactCount] = await Promise.all([
      prisma.generationTask.count({ where: { runId } }),
      prisma.generatedArtifact.count({ where: { runId } }),
    ]);

    res.json(GenerationRunDetailSchema.parse({
      ...run,
      taskCount,
      artifactCount,
      latestExportReview: null,
    }));
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

      if (action === 'resume') {
        const run = await getRun(runId, authReq.userId!);
        if (!run || run.status !== 'paused') {
          res.status(409).json({ error: 'Run is not paused' });
          return;
        }

        const resumeStage = (run.currentStage ?? 'planning') as Parameters<typeof transitionRunStatus>[2];
        const result = await transitionRunStatus(runId, authReq.userId!, resumeStage);
        if (!result) {
          res.status(409).json({ error: 'Cannot resume this run' });
          return;
        }

        res.json(GenerationRunSchema.parse(result));
        return;
      }

      const status = action === 'pause' ? 'paused' : 'cancelled';
      const result = await transitionRunStatus(runId, authReq.userId!, status);
      if (!result) {
        res.status(409).json({ error: `Cannot ${action} this run` });
        return;
      }

      res.json(GenerationRunSchema.parse(result));
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
    res.status(201).json(AgentRunSchema.parse(run));
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

    res.json(AgentRunSummarySchema.array().parse(runs));
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

    res.json(AgentRunDetailSchema.parse({ ...run, checkpointCount, actionCount }));
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

        res.json(AgentRunSchema.parse(result));
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

      res.json(AgentRunSchema.parse(result));
    }),
  );
}

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

    res.json(AgentCheckpointSchema.array().parse(checkpoints));
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

    res.json(AgentCheckpointSchema.parse(restored));
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

    res.json(AgentActionSchema.array().parse(actions));
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
