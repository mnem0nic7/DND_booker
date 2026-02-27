import { Router, Response } from 'express';
import { z } from 'zod';
import { publicRateLimit } from '../middleware/ai-rate-limit.js';
import * as templateService from '../services/template.service.js';

const router = Router();
router.use(publicRateLimit);

const querySchema = z.object({
  type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
});

// GET /api/templates
router.get('/', async (req, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  const type = parsed.success ? parsed.data.type : undefined;
  const templates = await templateService.listTemplates(type);
  res.json(templates);
});

// GET /api/templates/:id
router.get('/:id', async (req, res: Response) => {
  const id = req.params.id as string;
  if (!z.string().uuid().safeParse(id).success) {
    res.status(400).json({ error: 'Invalid template ID' });
    return;
  }
  const template = await templateService.getTemplate(id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
});

export default router;
