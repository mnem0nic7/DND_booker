import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import * as exportService from '../services/export.service.js';

const router = Router();
router.use(requireAuth);

const exportSchema = z.object({
  format: z.enum(['pdf', 'epub', 'print_pdf']),
});

// POST /api/projects/:id/export
router.post('/projects/:id/export', async (req: AuthRequest, res: Response) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const job = await exportService.createExportJob(req.params.id as string, req.userId!, parsed.data.format);
  if (!job) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.status(201).json(job);
});

// GET /api/export-jobs/:id
router.get('/export-jobs/:id', async (req: AuthRequest, res: Response) => {
  const job = await exportService.getExportJob(req.params.id as string, req.userId!);
  if (!job) {
    res.status(404).json({ error: 'Export job not found' });
    return;
  }
  res.json(job);
});

export default router;
