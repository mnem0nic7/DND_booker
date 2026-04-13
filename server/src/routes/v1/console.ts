import { Router } from 'express';
import {
  ConsoleAgentSchema,
  ConsoleChatRequestSchema,
  ConsoleChatResponseSchema,
} from '@dnd-booker/shared';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import {
  listForgeConsoleAgents,
  sendForgeConsoleMessage,
} from '../../services/forge-console.service.js';

const v1ConsoleRoutes = Router({ mergeParams: true });

v1ConsoleRoutes.get(
  '/console/agents',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const agents = await listForgeConsoleAgents(projectId, authReq.userId!);

    if (!agents) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(ConsoleAgentSchema.array().parse(agents));
  }),
);

v1ConsoleRoutes.post(
  '/console/chat',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;
    const parsed = ConsoleChatRequestSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    try {
      const replies = await sendForgeConsoleMessage(
        projectId,
        authReq.userId!,
        parsed.data.agentId,
        parsed.data.message,
      );

      if (!replies) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json(ConsoleChatResponseSchema.parse({ replies }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send console message';
      const status = message === 'Unknown console agent.' ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }),
);

export default v1ConsoleRoutes;
