import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import * as projectService from '../services/project.service.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
  status: z.enum(['draft', 'in_progress', 'review', 'published']).optional(),
  settings: z.record(z.unknown()).optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const project = await projectService.createProject(req.userId!, parsed.data);
  res.status(201).json(project);
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const projects = await projectService.getUserProjects(req.userId!);
  res.json(projects);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const project = await projectService.getProject(req.params.id as string, req.userId!);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
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
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const project = await projectService.deleteProject(req.params.id as string, req.userId!);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.status(204).send();
});

export default router;
