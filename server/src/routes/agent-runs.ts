import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import {
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  transitionAgentRunStatus,
  updateAgentRunState,
} from '../services/agent/run.service.js';
import { enqueueAgentRun } from '../services/agent/queue.service.js';
import { subscribeToAgentRun, publishAgentEvent } from '../services/agent/pubsub.service.js';
import {
  listAgentCheckpoints,
  restoreAgentCheckpoint,
} from '../services/agent/checkpoint.service.js';
import { listAgentActions } from '../services/agent/log.service.js';
import { prisma } from '../config/database.js';

const agentRoutes = Router({ mergeParams: true });

const createAgentRunSchema = z.object({
  mode: z.enum(['background_producer', 'persistent_editor']).optional(),
  objective: z.string().min(1).max(5000).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  generationMode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']).optional(),
  generationQuality: z.enum(['quick', 'polished']).optional(),
  pageTarget: z.number().int().min(1).max(500).optional(),
  budget: z.object({
    maxCycles: z.number().int().min(1).max(20).optional(),
    maxExports: z.number().int().min(1).max(30).optional(),
    maxImagePassesPerDocument: z.number().int().min(0).max(10).optional(),
    maxNoImprovementStreak: z.number().int().min(1).max(10).optional(),
    maxDurationMs: z.number().int().min(30_000).max(4 * 60 * 60 * 1000).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === 'background_producer' && !value.prompt?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prompt'],
      message: 'A prompt is required for background producer mode.',
    });
  }
});

agentRoutes.post(
  '/ai/agent-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const parsed = createAgentRunSchema.safeParse(req.body);
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

    res.status(201).json(run);
  }),
);

agentRoutes.get(
  '/ai/agent-runs',
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
    res.json(runs);
  }),
);

agentRoutes.get(
  '/ai/agent-runs/:runId',
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

    res.json({
      ...run,
      checkpointCount,
      actionCount,
    });
  }),
);

agentRoutes.post(
  '/ai/agent-runs/:runId/pause',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const result = await transitionAgentRunStatus(runId, authReq.userId!, 'paused');
    if (!result) {
      res.status(409).json({ error: 'Cannot pause this run' });
      return;
    }

    await publishAgentEvent(runId, {
      type: 'run_status',
      runId,
      status: result.status,
      stage: result.currentStage,
      progressPercent: result.progressPercent,
    });

    res.json(result);
  }),
);

agentRoutes.post(
  '/ai/agent-runs/:runId/resume',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
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

    res.json(result);
  }),
);

agentRoutes.post(
  '/ai/agent-runs/:runId/cancel',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const result = await transitionAgentRunStatus(runId, authReq.userId!, 'cancelled');
    if (!result) {
      res.status(409).json({ error: 'Cannot cancel this run' });
      return;
    }

    await publishAgentEvent(runId, {
      type: 'run_status',
      runId,
      status: result.status,
      stage: result.currentStage,
      progressPercent: result.progressPercent,
    });

    res.json(result);
  }),
);

agentRoutes.get(
  '/ai/agent-runs/:runId/checkpoints',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const checkpoints = await listAgentCheckpoints(req.params.runId as string, authReq.userId!);
    if (!checkpoints) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json(checkpoints);
  }),
);

agentRoutes.post(
  '/ai/agent-runs/:runId/checkpoints/:checkpointId/restore',
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

    res.json(restored);
  }),
);

agentRoutes.get(
  '/ai/agent-runs/:runId/actions',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const actions = await listAgentActions(req.params.runId as string, authReq.userId!);
    if (!actions) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json(actions);
  }),
);

agentRoutes.get(
  '/ai/agent-runs/:runId/stream',
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
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({
      type: 'run_status',
      runId,
      status: run.status,
      stage: run.currentStage,
      progressPercent: run.progressPercent,
    })}\n\n`);

    const { unsubscribe } = await subscribeToAgentRun(runId, (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Ignore disconnect write failures.
      }
    });

    req.on('close', async () => {
      await unsubscribe();
      res.end();
    });
  }),
);

export default agentRoutes;
