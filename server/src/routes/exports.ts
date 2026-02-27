import { Router, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import * as exportService from '../services/export.service.js';

const router = Router();
router.use(requireAuth);

/** Directory where the export worker writes output files. */
const EXPORT_OUTPUT_DIR = process.env.EXPORT_OUTPUT_DIR
  || path.resolve(process.cwd(), '..', 'worker', 'output');

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

  try {
    const job = await exportService.createExportJob(req.params.id as string, req.userId!, parsed.data.format);
    if (!job) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(201).json(job);
  } catch (err) {
    console.error('[Export] Failed to create export job:', err);
    res.status(500).json({ error: 'Failed to start export.' });
  }
});

// GET /api/export-jobs/:id
router.get('/export-jobs/:id', async (req: AuthRequest, res: Response) => {
  try {
    const job = await exportService.getExportJob(req.params.id as string, req.userId!);
    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }
    res.json(job);
  } catch (err) {
    console.error('[Export] Failed to get export job:', err);
    res.status(500).json({ error: 'Failed to fetch export status.' });
  }
});

// GET /api/export-jobs/:id/download — authenticated file download
router.get('/export-jobs/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const job = await exportService.getExportJob(req.params.id as string, req.userId!);
    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }

    if (job.status !== 'completed' || !job.outputUrl) {
      res.status(400).json({ error: 'Export is not yet complete.' });
      return;
    }

    // outputUrl is stored as "/output/filename.ext" — extract just the filename
    const filename = path.basename(job.outputUrl);

    // Resolve and verify the path stays within EXPORT_OUTPUT_DIR (defense-in-depth)
    const resolvedDir = path.resolve(EXPORT_OUTPUT_DIR);
    const filepath = path.resolve(EXPORT_OUTPUT_DIR, filename);
    if (!filepath.startsWith(resolvedDir + path.sep)) {
      res.status(400).json({ error: 'Invalid file reference.' });
      return;
    }

    try {
      await fs.promises.access(filepath, fs.constants.R_OK);
    } catch {
      res.status(404).json({ error: 'Export file not found. It may have been cleaned up.' });
      return;
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.epub' ? 'application/epub+zip' : 'application/pdf';

    // RFC 6266 compliant Content-Disposition with UTF-8 fallback
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
    fs.createReadStream(filepath).pipe(res);
  } catch (err) {
    console.error('[Export] Download failed:', err);
    res.status(500).json({ error: 'Failed to download export file.' });
  }
});

export default router;
