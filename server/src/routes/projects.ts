import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import { crudRateLimit } from '../middleware/ai-rate-limit.js';
import * as projectService from '../services/project.service.js';

const router = Router();
router.use(requireAuth);
router.use(crudRateLimit);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
  templateId: z.string().uuid().optional(),
});

const settingsSchema = z.object({
  theme: z.enum(['classic-parchment', 'dark-tome', 'clean-modern', 'fey-wild', 'infernal']).optional(),
  pageSize: z.enum(['letter', 'a4']).optional(),
  columns: z.number().int().min(1).max(3).optional(),
}).passthrough(); // allow future fields but validate known ones

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
  status: z.enum(['draft', 'in_progress', 'review', 'published']).optional(),
  settings: settingsSchema.optional(),
});

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const project = await projectService.createProject(req.userId!, parsed.data);
  res.status(201).json(project);
}));

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const projects = await projectService.getUserProjects(req.userId!);
  res.json(projects);
}));

router.get('/:id', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const project = await projectService.getProject(req.params.id as string, req.userId!);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
}));

router.put('/:id', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const { settings, ...rest } = parsed.data;
  const project = await projectService.updateProject(req.params.id as string, req.userId!, {
    ...rest,
    ...(settings !== undefined && { settings: settings as Prisma.InputJsonValue }),
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
}));

router.delete('/:id', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const project = await projectService.deleteProject(req.params.id as string, req.userId!);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.status(204).send();
}));

export default router;
