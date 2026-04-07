import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import {
  PublicationDocumentPatchSchema,
  PublicationDocumentSummarySchema,
  PublicationDocumentTypstSchema,
  type PublicationDocument,
} from '@dnd-booker/shared';
import {
  getPublicationDocument,
  listPublicationDocuments,
  type PublicationDocumentSummary as ServicePublicationDocumentSummary,
  updatePublicationDocument,
} from '../../services/document-publication.service.js';

const v1DocumentRoutes = Router({ mergeParams: true });

const publicationDocumentRouteResponseSchema = z.object({
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  sortOrder: z.number().int(),
  targetPageCount: z.number().int().nullable(),
  status: z.string().min(1),
  sourceArtifactId: z.string().uuid().nullable(),
  canonicalDocJson: z.unknown(),
  editorProjectionJson: z.unknown(),
  typstSource: z.string(),
  canonicalVersion: z.number().int().min(1),
  editorProjectionVersion: z.number().int().min(1),
  typstVersion: z.number().int().min(1),
  updatedAt: z.string().datetime(),
});

const publicationDocumentBodySchema = PublicationDocumentPatchSchema;

function toRouteDocumentResponse(document: PublicationDocument) {
  return {
    documentId: document.documentId,
    projectId: document.projectId,
    kind: document.kind,
    title: document.title,
    slug: document.slug,
    sortOrder: document.sortOrder,
    targetPageCount: document.targetPageCount,
    status: document.status,
    sourceArtifactId: document.sourceArtifactId,
    canonicalDocJson: document.canonicalDocJson,
    editorProjectionJson: document.editorProjectionJson,
    typstSource: document.typstSource,
    canonicalVersion: document.canonicalVersion,
    editorProjectionVersion: document.editorProjectionVersion,
    typstVersion: document.typstVersion,
    updatedAt: document.updatedAt,
  };
}

function toSummaryResponse(document: ServicePublicationDocumentSummary) {
  return {
    ...document,
    documentId: document.id,
  };
}

// GET /api/v1/projects/:projectId/documents
v1DocumentRoutes.get(
  '/documents',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const projectId = req.params.projectId as string;

    const documents = await listPublicationDocuments(projectId, authReq.userId!);
    if (!documents) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(PublicationDocumentSummarySchema.array().parse(documents.map((document) => toSummaryResponse(document))));
  }),
);

// GET /api/v1/projects/:projectId/documents/:docId
v1DocumentRoutes.get(
  '/documents/:docId',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const document = await getPublicationDocument(docId, authReq.userId!);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(publicationDocumentRouteResponseSchema.parse(toRouteDocumentResponse(document)));
  }),
);

// GET /api/v1/projects/:projectId/documents/:docId/canonical
v1DocumentRoutes.get(
  '/documents/:docId/canonical',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const document = await getPublicationDocument(docId, authReq.userId!);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(document.canonicalDocJson);
  }),
);

// GET /api/v1/projects/:projectId/documents/:docId/editor-projection
v1DocumentRoutes.get(
  '/documents/:docId/editor-projection',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const document = await getPublicationDocument(docId, authReq.userId!);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(document.editorProjectionJson);
  }),
);

// GET /api/v1/projects/:projectId/documents/:docId/typst
v1DocumentRoutes.get(
  '/documents/:docId/typst',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const document = await getPublicationDocument(docId, authReq.userId!);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(PublicationDocumentTypstSchema.parse({
      documentId: document.documentId,
      typstSource: document.typstSource,
      typstVersion: document.typstVersion,
      updatedAt: document.updatedAt,
    }));
  }),
);

// PATCH /api/v1/projects/:projectId/documents/:docId
v1DocumentRoutes.patch(
  '/documents/:docId',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const parsed = publicationDocumentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid document update', details: parsed.error.flatten() });
      return;
    }

    const result = await updatePublicationDocument(docId, authReq.userId!, parsed.data);
    if (result.status === 'not_found') {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (result.status === 'conflict') {
      res.status(409).json({
        error: 'Document has been modified since the provided timestamp',
        document: publicationDocumentRouteResponseSchema.parse(toRouteDocumentResponse(result.document)),
      });
      return;
    }

    res.json(publicationDocumentRouteResponseSchema.parse(toRouteDocumentResponse(result.document)));
  }),
);

export default v1DocumentRoutes;
