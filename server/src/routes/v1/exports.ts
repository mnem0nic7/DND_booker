import path from 'path';
import { Router, type Response } from 'express';
import {
  ExportCreateRequestSchema,
  ExportJobResponseSchema,
  ExportReviewFixResultSchema,
} from '@dnd-booker/shared';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { exportRateLimit } from '../../middleware/ai-rate-limit.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import * as exportService from '../../services/export.service.js';
import { openExportArtifactStream } from '../../services/object-storage.service.js';

const v1ExportRoutes = Router();
v1ExportRoutes.use(requireAuth);

v1ExportRoutes.get(
  '/projects/:projectId/export-jobs',
  validateUuid('projectId'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const jobs = await exportService.listExportJobs(req.params.projectId as string, req.userId!);
    if (!jobs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ExportJobResponseSchema.array().parse(jobs));
  }),
);

v1ExportRoutes.post(
  '/projects/:projectId/export-jobs',
  validateUuid('projectId'),
  exportRateLimit,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = ExportCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }

    try {
      const job = await exportService.createExportJob(
        req.params.projectId as string,
        req.userId!,
        parsed.data.format,
      );
      if (!job) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      console.log(`[AUDIT] Export job ${job.id} created by user ${req.userId} (project=${req.params.projectId}, format=${parsed.data.format})`);
      res.status(201).json(ExportJobResponseSchema.parse(job));
    } catch (err) {
      console.error('[Export] Failed to create export job:', err);
      res.status(500).json({ error: 'Failed to start export.' });
    }
  }),
);

v1ExportRoutes.get(
  '/export-jobs/:jobId',
  validateUuid('jobId'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const job = await exportService.getExportJob(req.params.jobId as string, req.userId!);
      if (!job) {
        res.status(404).json({ error: 'Export job not found' });
        return;
      }

      res.json(ExportJobResponseSchema.parse(job));
    } catch (err) {
      console.error('[Export] Failed to get export job:', err);
      res.status(500).json({ error: 'Failed to fetch export status.' });
    }
  }),
);

v1ExportRoutes.post(
  '/export-jobs/:jobId/fix',
  validateUuid('jobId'),
  exportRateLimit,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const result = await exportService.fixExportJobIssues(req.params.jobId as string, req.userId!);
      if (!result) {
        res.status(404).json({ error: 'Export job not found' });
        return;
      }

      if (result.status === 'no_review' || result.status === 'no_fixes') {
        res.status(400).json({ error: result.summary, result });
        return;
      }

      res.status(201).json(ExportReviewFixResultSchema.parse(result));
    } catch (err) {
      console.error('[Export] Failed to apply export fixes:', err);
      res.status(500).json({ error: 'Failed to apply export fixes.' });
    }
  }),
);

v1ExportRoutes.get(
  '/export-jobs/:jobId/download',
  validateUuid('jobId'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      const job = await exportService.getExportJob(req.params.jobId as string, req.userId!);
      if (!job) {
        res.status(404).json({ error: 'Export job not found' });
        return;
      }

      if (job.status !== 'completed' || !job.outputUrl) {
        res.status(400).json({ error: 'Export is not yet complete.' });
        return;
      }

      const filename = path.basename(job.outputUrl);
      const ext = path.extname(filename).toLowerCase();
      const contentType = ext === '.epub' ? 'application/epub+zip' : 'application/pdf';
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
          return;
        }

        if (err.code === 'EINVAL') {
          if (!res.headersSent) {
            res.status(400).json({ error: 'Invalid file reference.' });
          }
          return;
        }

        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to read export file.' });
        }
      });
      stream.pipe(res);
    } catch (err) {
      console.error('[Export] Download failed:', err);
      res.status(500).json({ error: 'Failed to download export file.' });
    }
  }),
);

export default v1ExportRoutes;
