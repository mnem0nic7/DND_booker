import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import {
  createRun,
  getRun,
  listRuns,
  transitionRunStatus,
} from '../services/generation/run.service.js';
import { listTasksForRun } from '../services/generation/task.service.js';
import { prisma } from '../config/database.js';
import { subscribeToRun } from '../services/generation/pubsub.service.js';
import { enqueueGenerationRun } from '../services/generation/queue.service.js';
import {
  getExportReviewArtifactForRun,
  isExportReviewArtifactId,
} from '../services/generation/export-review-artifact.service.js';

const generationRoutes = Router({ mergeParams: true });

const createRunSchema = z.object({
  prompt: z.string().min(1).max(5000),
  mode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']).optional(),
  quality: z.enum(['quick', 'polished']).optional(),
  pageTarget: z.number().int().min(1).max(500).optional(),
  constraints: z.object({
    tone: z.string().optional(),
    levelRange: z.string().optional(),
    settingPreference: z.string().optional(),
    includeHandouts: z.boolean().optional(),
    includeMaps: z.boolean().optional(),
    strict5e: z.boolean().optional(),
  }).optional(),
});

// POST /ai/generation-runs — Create a run
generationRoutes.post(
  '/ai/generation-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const parsed = createRunSchema.safeParse(req.body);
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

    res.status(201).json(run);
  }),
);

// GET /ai/generation-runs — List runs
generationRoutes.get(
  '/ai/generation-runs',
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

    res.json(runs);
  }),
);

// GET /ai/generation-runs/:runId — Run detail
generationRoutes.get(
  '/ai/generation-runs/:runId',
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

    res.json({
      ...run,
      taskCount,
      artifactCount: artifactCount + (exportReviewArtifact ? 1 : 0),
      latestExportReview: exportReviewArtifact?.jsonContent ?? null,
    });
  }),
);

// POST /ai/generation-runs/:runId/pause
generationRoutes.post(
  '/ai/generation-runs/:runId/pause',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;

    const result = await transitionRunStatus(runId, authReq.userId!, 'paused');
    if (!result) {
      res.status(409).json({ error: 'Cannot pause this run' });
      return;
    }

    res.json(result);
  }),
);

// POST /ai/generation-runs/:runId/resume
generationRoutes.post(
  '/ai/generation-runs/:runId/resume',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;

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

    res.json(result);
  }),
);

// POST /ai/generation-runs/:runId/cancel
generationRoutes.post(
  '/ai/generation-runs/:runId/cancel',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;

    const result = await transitionRunStatus(runId, authReq.userId!, 'cancelled');
    if (!result) {
      res.status(409).json({ error: 'Cannot cancel this run' });
      return;
    }

    res.json(result);
  }),
);

// GET /ai/generation-runs/:runId/tasks
generationRoutes.get(
  '/ai/generation-runs/:runId/tasks',
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

    const tasks = await listTasksForRun(runId);
    res.json(tasks);
  }),
);

// GET /ai/generation-runs/:runId/artifacts
generationRoutes.get(
  '/ai/generation-runs/:runId/artifacts',
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

    res.json(exportReviewArtifact ? [...artifacts, exportReviewArtifact] : artifacts);
  }),
);

// GET /ai/generation-runs/:runId/artifacts/:artifactId — Artifact detail with evaluations
generationRoutes.get(
  '/ai/generation-runs/:runId/artifacts/:artifactId',
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

      res.json({ ...exportReviewArtifact, evaluations: [] });
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

    res.json(artifact);
  }),
);

// GET /ai/generation-runs/:runId/canon — Canon entity list
generationRoutes.get(
  '/ai/generation-runs/:runId/canon',
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

    res.json(entities);
  }),
);

// GET /ai/generation-runs/:runId/evaluations — All evaluations for this run
generationRoutes.get(
  '/ai/generation-runs/:runId/evaluations',
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

    res.json(evaluations);
  }),
);

// GET /ai/generation-runs/:runId/assembly — Latest assembly manifest
generationRoutes.get(
  '/ai/generation-runs/:runId/assembly',
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

    res.json(manifest);
  }),
);

// GET /ai/generation-runs/:runId/stream — SSE progress
generationRoutes.get(
  '/ai/generation-runs/:runId/stream',
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
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial state
    res.write(`data: ${JSON.stringify({ type: 'run_status', runId, status: run.status, stage: run.currentStage, progressPercent: run.progressPercent })}\n\n`);

    const { unsubscribe } = await subscribeToRun(runId, (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    });

    req.on('close', async () => {
      await unsubscribe();
      res.end();
    });
  }),
);

export default generationRoutes;
