import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import {
  listDocuments,
  getDocument,
  updateDocumentContent,
  updateDocumentTitle,
  reorderDocuments,
} from '../services/document.service.js';

const documentRoutes = Router({ mergeParams: true });

// TipTap JSON content schema — validates structure without being overly strict
const tiptapContentSchema = z.object({
  type: z.string().max(50),
  content: z.array(z.any()).optional(),
  attrs: z.record(z.unknown()).optional(),
}).refine(
  (val) => JSON.stringify(val).length <= 5_000_000,
  { message: 'Content exceeds 5 MB limit' },
);

const titleSchema = z.object({
  title: z.string().min(1).max(200),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()),
});

// GET /documents — List project documents (no content)
documentRoutes.get(
  '/documents',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const docs = await listDocuments(projectId, authReq.userId!);
    if (!docs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(docs);
  }),
);

// GET /documents/:docId — Get single document with content
documentRoutes.get(
  '/documents/:docId',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const doc = await getDocument(docId, authReq.userId!);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  }),
);

// PUT /documents/:docId/content — Update document content
documentRoutes.put(
  '/documents/:docId/content',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const parsed = tiptapContentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid content', details: parsed.error.flatten() });
      return;
    }

    const doc = await updateDocumentContent(docId, authReq.userId!, parsed.data as any);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  }),
);

// PUT /documents/:docId/title — Update document title
documentRoutes.put(
  '/documents/:docId/title',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const parsed = titleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const doc = await updateDocumentTitle(docId, authReq.userId!, parsed.data.title);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(doc);
  }),
);

// POST /documents/reorder — Reorder documents within a project
documentRoutes.post(
  '/documents/reorder',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const docs = await reorderDocuments(projectId, authReq.userId!, parsed.data.orderedIds);
    if (!docs) {
      res.status(404).json({ error: 'Project not found or invalid document IDs' });
      return;
    }

    res.json(docs);
  }),
);

export default documentRoutes;
