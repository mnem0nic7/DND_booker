import { Router } from 'express';
import {
  CreateImprovementLoopAndProjectRequestSchema,
  CreateImprovementLoopRequestSchema,
  ImprovementLoopDefaultEngineeringTargetSchema,
  ImprovementLoopArtifactSchema,
  ImprovementLoopRunDetailSchema,
  ImprovementLoopRunSchema,
  ImprovementLoopRunSummarySchema,
  ImprovementLoopWorkspaceRunSummarySchema,
  ProjectGitHubRepoBindingInputSchema,
  ProjectGitHubRepoBindingSchema,
  ProjectGitHubRepoBindingValidationSchema,
} from '@dnd-booker/shared';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import * as projectService from '../../services/project.service.js';
import {
  getProjectGitHubRepoBinding,
  upsertProjectGitHubRepoBinding,
  validateProjectGitHubRepoBinding,
} from '../../services/project-github-repo-binding.service.js';
import {
  getGitHubRepoInfo,
  getPublicGitHubRepoInfo,
  isGitHubAppConfigured,
} from '../../services/github-app.service.js';
import {
  createImprovementLoopRun,
  getImprovementLoopRun,
  listImprovementLoopRuns,
  listRecentImprovementLoopRuns,
  transitionImprovementLoopStatus,
} from '../../services/improvement-loop/run.service.js';
import {
  getImprovementLoopArtifact,
  listImprovementLoopArtifacts,
} from '../../services/improvement-loop/artifact.service.js';
import { enqueueImprovementLoopRun } from '../../services/improvement-loop/queue.service.js';
import { subscribeToImprovementLoopRun } from '../../services/improvement-loop/pubsub.service.js';
import { getDefaultImprovementLoopEngineeringTarget } from '../../services/improvement-loop/default-engineering-target.service.js';
import { prisma } from '../../config/database.js';

const v1ImprovementLoopRoutes = Router();

function toTransportJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

v1ImprovementLoopRoutes.get(
  '/improvement-loops/default-engineering-target',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const target = getDefaultImprovementLoopEngineeringTarget();
    res.json(ImprovementLoopDefaultEngineeringTargetSchema.parse(toTransportJson(target)));
  }),
);

v1ImprovementLoopRoutes.get(
  '/improvement-loops/recent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runs = await listRecentImprovementLoopRuns(authReq.userId!);
    res.json(ImprovementLoopWorkspaceRunSummarySchema.array().parse(toTransportJson(runs)));
  }),
);

v1ImprovementLoopRoutes.get(
  '/projects/:projectId/github-repo-binding',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const binding = await getProjectGitHubRepoBinding(req.params.projectId as string, authReq.userId!);
    if (!binding) {
      res.status(404).json({ error: 'GitHub repo binding not found' });
      return;
    }
    res.json(ProjectGitHubRepoBindingSchema.parse(toTransportJson(binding)));
  }),
);

v1ImprovementLoopRoutes.post(
  '/projects/:projectId/github-repo-binding',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const parsed = ProjectGitHubRepoBindingInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const binding = await upsertProjectGitHubRepoBinding(req.params.projectId as string, authReq.userId!, parsed.data);
    if (!binding) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ProjectGitHubRepoBindingSchema.parse(toTransportJson(binding)));
  }),
);

v1ImprovementLoopRoutes.post(
  '/projects/:projectId/github-repo-binding/validate',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const result = await validateProjectGitHubRepoBinding(req.params.projectId as string, authReq.userId!);
    if (!result) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ProjectGitHubRepoBindingValidationSchema.parse(toTransportJson(result)));
  }),
);

v1ImprovementLoopRoutes.post(
  '/improvement-loops',
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const parsed = CreateImprovementLoopAndProjectRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    if (!isGitHubAppConfigured() && parsed.data.repoBinding.engineeringAutomationEnabled) {
      res.status(409).json({ error: 'GitHub App integration is not configured on the server.' });
      return;
    }

    try {
      if (!isGitHubAppConfigured() && !parsed.data.repoBinding.engineeringAutomationEnabled) {
        await getPublicGitHubRepoInfo(parsed.data.repoBinding.repositoryFullName);
      } else {
        await getGitHubRepoInfo({
          repositoryFullName: parsed.data.repoBinding.repositoryFullName,
          installationId: parsed.data.repoBinding.installationId,
          defaultBranch: parsed.data.repoBinding.defaultBranch,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub repo validation failed.';
      res.status(400).json({ error: message });
      return;
    }

    const project = await projectService.createProject(authReq.userId!, {
      title: parsed.data.projectTitle,
      description: 'Created by improvement loop',
      type: 'campaign',
    });

    await upsertProjectGitHubRepoBinding(project.id, authReq.userId!, parsed.data.repoBinding);
    const validation = await validateProjectGitHubRepoBinding(project.id, authReq.userId!);
    if (!validation || validation.status !== 'valid') {
      res.status(400).json({ error: validation?.message ?? 'GitHub repo binding validation failed.' });
      return;
    }

    const run = await createImprovementLoopRun({
      projectId: project.id,
      userId: authReq.userId!,
      mode: 'create_campaign',
      request: {
        prompt: parsed.data.prompt,
        objective: parsed.data.objective,
        generationMode: parsed.data.generationMode,
        generationQuality: parsed.data.generationQuality,
        projectTitle: parsed.data.projectTitle,
      },
    });

    if (!run) {
      res.status(500).json({ error: 'Failed to create improvement loop run.' });
      return;
    }

    await enqueueImprovementLoopRun(run.id, authReq.userId!, project.id);
    res.status(201).json(ImprovementLoopRunSchema.parse(toTransportJson(run)));
  }),
);

v1ImprovementLoopRoutes.post(
  '/projects/:projectId/improvement-loops',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const parsed = CreateImprovementLoopRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const binding = await getProjectGitHubRepoBinding(projectId, authReq.userId!);
    if (!binding) {
      res.status(409).json({ error: 'Configure a GitHub repo binding before starting the improvement loop.' });
      return;
    }

    if (binding.lastValidationStatus !== 'valid') {
      res.status(409).json({ error: 'GitHub repo binding must validate successfully before starting the improvement loop.' });
      return;
    }

    const run = await createImprovementLoopRun({
      projectId,
      userId: authReq.userId!,
      mode: 'current_project',
      request: parsed.data,
    });

    if (!run) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await enqueueImprovementLoopRun(run.id, authReq.userId!, projectId);
    res.status(201).json(ImprovementLoopRunSchema.parse(toTransportJson(run)));
  }),
);

v1ImprovementLoopRoutes.get(
  '/projects/:projectId/improvement-loops',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runs = await listImprovementLoopRuns(req.params.projectId as string, authReq.userId!);
    if (!runs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ImprovementLoopRunSummarySchema.array().parse(toTransportJson(runs)));
  }),
);

v1ImprovementLoopRoutes.get(
  '/projects/:projectId/improvement-loops/:runId',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const runId = req.params.runId as string;
    const run = await getImprovementLoopRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const artifactCount = await prisma.improvementLoopArtifact.count({
      where: { runId },
    });

    res.json(ImprovementLoopRunDetailSchema.parse(toTransportJson({
      ...run,
      artifactCount,
    })));
  }),
);

for (const action of ['pause', 'resume', 'cancel'] as const) {
  v1ImprovementLoopRoutes.post(
    `/projects/:projectId/improvement-loops/:runId/${action}`,
    requireAuth,
    validateUuid('projectId', 'runId'),
    asyncHandler(async (req, res) => {
      const authReq = req as AuthRequest;
      const runId = req.params.runId as string;
      const projectId = req.params.projectId as string;

      if (action === 'resume') {
        const run = await getImprovementLoopRun(runId, authReq.userId!);
        if (!run || run.status !== 'paused') {
          res.status(409).json({ error: 'Run is not paused' });
          return;
        }

        const resumeStage = (run.currentStage ?? 'creator') as Parameters<typeof transitionImprovementLoopStatus>[2];
        const result = await transitionImprovementLoopStatus(runId, authReq.userId!, resumeStage);
        if (!result) {
          res.status(409).json({ error: 'Cannot resume this run' });
          return;
        }

        await enqueueImprovementLoopRun(runId, authReq.userId!, projectId, { priority: 10 });
        res.json(ImprovementLoopRunSchema.parse(toTransportJson(result)));
        return;
      }

      const status = action === 'pause' ? 'paused' : 'cancelled';
      const result = await transitionImprovementLoopStatus(runId, authReq.userId!, status);
      if (!result) {
        res.status(409).json({ error: `Cannot ${action} this run` });
        return;
      }

      res.json(ImprovementLoopRunSchema.parse(toTransportJson(result)));
    }),
  );
}

v1ImprovementLoopRoutes.get(
  '/projects/:projectId/improvement-loops/:runId/artifacts',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const artifacts = await listImprovementLoopArtifacts(req.params.runId as string, authReq.userId!);
    if (!artifacts) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(ImprovementLoopArtifactSchema.array().parse(toTransportJson(artifacts)));
  }),
);

v1ImprovementLoopRoutes.get(
  '/projects/:projectId/improvement-loops/:runId/artifacts/:artifactId',
  requireAuth,
  validateUuid('projectId', 'runId', 'artifactId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const artifact = await getImprovementLoopArtifact(
      req.params.runId as string,
      req.params.artifactId as string,
      authReq.userId!,
    );
    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    res.json(ImprovementLoopArtifactSchema.parse(toTransportJson(artifact)));
  }),
);

v1ImprovementLoopRoutes.get(
  '/projects/:projectId/improvement-loops/:runId/events',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const run = await getImprovementLoopRun(req.params.runId as string, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const subscription = await subscribeToImprovementLoopRun(req.params.runId as string, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      void subscription.unsubscribe();
      res.end();
    });
  }),
);

export default v1ImprovementLoopRoutes;
