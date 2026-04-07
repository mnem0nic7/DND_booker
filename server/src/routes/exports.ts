import { Router, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import { exportRateLimit } from '../middleware/ai-rate-limit.js';
import * as exportService from '../services/export.service.js';
import { openExportArtifactStream } from '../services/object-storage.service.js';

const router = Router();
router.use(requireAuth);

const exportSchema = z.object({
  format: z.enum(['pdf', 'epub', 'print_pdf']),
});

// GET /api/projects/:id/export-jobs — list export history for a project
router.get('/projects/:id/export-jobs', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const jobs = await exportService.listExportJobs(req.params.id as string, req.userId!);
  if (!jobs) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(jobs);
}));

// POST /api/projects/:id/export
router.post('/projects/:id/export', validateUuid('id'), exportRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
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
    console.log(`[AUDIT] Export job ${job.id} created by user ${req.userId} (project=${req.params.id}, format=${parsed.data.format})`);
    res.status(201).json(job);
  } catch (err) {
    console.error('[Export] Failed to create export job:', err);
    res.status(500).json({ error: 'Failed to start export.' });
  }
}));

// GET /api/export-jobs/:id
router.get('/export-jobs/:id', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
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
}));

// POST /api/export-jobs/:id/fix — apply safe document fixes from export review and queue a re-export
router.post('/export-jobs/:id/fix', validateUuid('id'), exportRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const result = await exportService.fixExportJobIssues(req.params.id as string, req.userId!);
    if (!result) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }

    if (result.status === 'no_review') {
      res.status(400).json({ error: result.summary, result });
      return;
    }

    if (result.status === 'no_fixes') {
      res.status(400).json({ error: result.summary, result });
      return;
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('[Export] Failed to apply export fixes:', err);
    res.status(500).json({ error: 'Failed to apply export fixes.' });
  }
}));

// GET /api/export-jobs/:id/download — authenticated file download
router.get('/export-jobs/:id/download', validateUuid('id'), asyncHandler(async (req: AuthRequest, res: Response) => {
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

    // outputUrl is stored as "/output/filename.ext" and served through authenticated download.
    const filename = path.basename(job.outputUrl);

    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.epub' ? 'application/epub+zip' : 'application/pdf';

    // RFC 6266 compliant Content-Disposition with UTF-8 fallback
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const encodedFilename = encodeURIComponent(filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);

    const stream = await openExportArtifactStream(job.outputUrl);
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        if (!res.headersSent) {
          res.status(404).json({ error: 'Export file not found. It may have been cleaned up.' });
        }
      } else if (err.code === 'EINVAL') {
        if (!res.headersSent) {
          res.status(400).json({ error: 'Invalid file reference.' });
        }
      } else {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to read export file.' });
        }
      }
    });
    stream.pipe(res);
  } catch (err) {
    console.error('[Export] Download failed:', err);
    res.status(500).json({ error: 'Failed to download export file.' });
  }
}));

export default router;
