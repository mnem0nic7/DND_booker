import { Router } from 'express';
import {
  InterviewSessionCreateRequestSchema,
  InterviewSessionLockRequestSchema,
  InterviewSessionMessageRequestSchema,
  LatestInterviewSessionResponseSchema,
  InterviewSessionSchema,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import {
  appendInterviewMessage,
  createInterviewSession,
  getInterviewSession,
  lockInterviewSession,
} from '../../services/interview.service.js';

const v1InterviewRoutes = Router({ mergeParams: true });

async function ensureOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

v1InterviewRoutes.post(
  '/interview/sessions',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const parsed = InterviewSessionCreateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const project = await ensureOwnedProject(projectId, authReq.userId!);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const session = await createInterviewSession(projectId, authReq.userId!, parsed.data.initialPrompt);
    res.status(201).json(InterviewSessionSchema.parse(session));
  }),
);

v1InterviewRoutes.get(
  '/interview/sessions/latest',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const project = await ensureOwnedProject(projectId, authReq.userId!);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const session = await getInterviewSession(projectId, authReq.userId!);
    res.json(LatestInterviewSessionResponseSchema.parse(session));
  }),
);

v1InterviewRoutes.get(
  '/interview/sessions/:sessionId',
  requireAuth,
  validateUuid('projectId', 'sessionId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const session = await getInterviewSession(projectId, authReq.userId!);
    if (!session || session.id !== req.params.sessionId) {
      res.status(404).json({ error: 'Interview session not found' });
      return;
    }

    res.json(InterviewSessionSchema.parse(session));
  }),
);

v1InterviewRoutes.post(
  '/interview/sessions/:sessionId/messages',
  requireAuth,
  validateUuid('projectId', 'sessionId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const sessionId = req.params.sessionId as string;
    const parsed = InterviewSessionMessageRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    try {
      const session = await appendInterviewMessage(
        projectId,
        authReq.userId!,
        sessionId,
        parsed.data.content,
      );
      if (!session) {
        res.status(404).json({ error: 'Interview session not found' });
        return;
      }

      res.json(InterviewSessionSchema.parse(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to append interview message';
      res.status(409).json({ error: message });
    }
  }),
);

v1InterviewRoutes.post(
  '/interview/sessions/:sessionId/lock',
  requireAuth,
  validateUuid('projectId', 'sessionId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const sessionId = req.params.sessionId as string;
    const parsed = InterviewSessionLockRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    try {
      const session = await lockInterviewSession(
        projectId,
        authReq.userId!,
        sessionId,
        parsed.data.force ?? false,
      );
      if (!session) {
        res.status(404).json({ error: 'Interview session not found' });
        return;
      }

      res.json(InterviewSessionSchema.parse(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to lock interview session';
      res.status(409).json({ error: message });
    }
  }),
);

export default v1InterviewRoutes;
