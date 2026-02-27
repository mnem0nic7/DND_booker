import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import * as documentService from '../services/document.service.js';

// Routes nested under /api/projects/:projectId/documents
export const projectDocumentRoutes = Router({ mergeParams: true });
projectDocumentRoutes.use(requireAuth);

// TipTap JSON content schema — validates structure without being overly strict
const tiptapContentSchema = z.object({
  type: z.string().max(50),
  content: z.array(z.any()).optional(),
  attrs: z.record(z.unknown()).optional(),
}).refine(
  (val) => JSON.stringify(val).length <= 5_000_000,
  { message: 'Document content exceeds 5 MB limit' }
);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: tiptapContentSchema.optional(),
});

projectDocumentRoutes.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const doc = await documentService.createDocument(
    req.params.projectId as string,
    req.userId!,
    parsed.data
  );
  if (!doc) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.status(201).json(doc);
});

projectDocumentRoutes.get('/', async (req: AuthRequest, res: Response) => {
  const docs = await documentService.getProjectDocuments(
    req.params.projectId as string,
    req.userId!
  );
  if (!docs) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(docs);
});

// Routes at /api/documents
export const documentRoutes = Router();
documentRoutes.use(requireAuth);

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: tiptapContentSchema.optional(),
});

const reorderSchema = z.object({
  projectId: z.string().uuid(),
  documentIds: z.array(z.string().uuid()),
});

// IMPORTANT: reorder route MUST be before /:id routes to avoid "reorder" matching as :id
documentRoutes.patch('/reorder', async (req: AuthRequest, res: Response) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const result = await documentService.reorderDocuments(parsed.data.projectId, req.userId!, parsed.data.documentIds);
  if (!result) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json({ success: true });
});

documentRoutes.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const doc = await documentService.updateDocument(req.params.id as string, req.userId!, parsed.data);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json(doc);
});

documentRoutes.delete('/:id', async (req: AuthRequest, res: Response) => {
  const doc = await documentService.deleteDocument(req.params.id as string, req.userId!);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.status(204).send();
});
