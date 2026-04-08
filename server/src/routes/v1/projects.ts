import { Prisma } from '@prisma/client';
import { Router } from 'express';
import {
  ProjectCreateRequestSchema,
  ProjectDetailSchema,
  ProjectSummarySchema,
  ProjectUpdateRequestSchema,
} from '@dnd-booker/shared';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import * as projectService from '../../services/project.service.js';

const v1ProjectRoutes = Router();

function toTransportJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

v1ProjectRoutes.get(
  '/projects',
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projects = await projectService.getUserProjects(authReq.userId!);
    res.json(ProjectSummarySchema.array().parse(toTransportJson(projects)));
  }),
);

v1ProjectRoutes.post(
  '/projects',
  requireAuth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const parsed = ProjectCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const project = await projectService.createProject(authReq.userId!, parsed.data);
    res.status(201).json(ProjectSummarySchema.parse(toTransportJson(project)));
  }),
);

v1ProjectRoutes.get(
  '/projects/:projectId',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const project = await projectService.getProject(projectId, authReq.userId!);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ProjectDetailSchema.parse(toTransportJson(project)));
  }),
);

v1ProjectRoutes.patch(
  '/projects/:projectId',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const parsed = ProjectUpdateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { content, settings, ...metadata } = parsed.data;

    if (Object.keys(metadata).length > 0 || settings !== undefined) {
      const updatedProject = await projectService.updateProject(projectId, authReq.userId!, {
        ...metadata,
        ...(settings !== undefined ? { settings: settings as Prisma.InputJsonValue } : {}),
      });
      if (!updatedProject) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    if (content !== undefined) {
      const updatedProject = await projectService.updateProjectContent(
        projectId,
        authReq.userId!,
        content as unknown as Prisma.InputJsonValue,
      );
      if (!updatedProject) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
    }

    const project = await projectService.getProject(projectId, authReq.userId!);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ProjectDetailSchema.parse(toTransportJson(project)));
  }),
);

v1ProjectRoutes.delete(
  '/projects/:projectId',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const project = await projectService.deleteProject(projectId, authReq.userId!);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.status(204).send();
  }),
);

export default v1ProjectRoutes;
