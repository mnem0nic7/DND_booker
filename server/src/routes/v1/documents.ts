import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { validateUuid } from '../../middleware/validate-uuid.js';
import {
  LayoutPlanSchema,
  PublicationDocumentDetailSchema,
  PublicationDocumentPatchSchema,
  PublicationDocumentSummarySchema,
  PublicationDocumentTypstSchema,
} from '@dnd-booker/shared';
import {
  getPublicationDocument,
  listPublicationDocuments,
  type PublicationDocumentSummary as ServicePublicationDocumentSummary,
  updatePublicationDocument,
} from '../../services/document-publication.service.js';
import { getDocument, updateDocumentLayout } from '../../services/document.service.js';

const v1DocumentRoutes = Router({ mergeParams: true });

const publicationDocumentBodySchema = PublicationDocumentPatchSchema;

function toTransportJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

function toRouteDocumentResponse(document: {
  schemaVersion?: number;
  documentId?: string;
  id?: string;
  projectId: string;
  runId?: string | null;
  kind: string;
  title: string;
  slug: string;
  sortOrder: number;
  targetPageCount: number | null;
  layoutPlan?: unknown | null;
  status: string;
  sourceArtifactId: string | null;
  canonicalDocJson: unknown;
  editorProjectionJson: unknown;
  typstSource: string;
  canonicalVersion: number;
  editorProjectionVersion: number;
  typstVersion: number;
  updatedAt: string | Date;
}) {
  return {
    schemaVersion: document.schemaVersion ?? 1,
    documentId: document.documentId ?? document.id,
    projectId: document.projectId,
    runId: document.runId ?? null,
    kind: document.kind,
    title: document.title,
    slug: document.slug,
    sortOrder: document.sortOrder,
    targetPageCount: document.targetPageCount,
    layoutPlan: document.layoutPlan ?? null,
    status: document.status,
    sourceArtifactId: document.sourceArtifactId,
    canonicalDocJson: document.canonicalDocJson,
    editorProjectionJson: document.editorProjectionJson,
    typstSource: document.typstSource,
    canonicalVersion: document.canonicalVersion,
    editorProjectionVersion: document.editorProjectionVersion,
    typstVersion: document.typstVersion,
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt.toISOString() : document.updatedAt,
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

    res.json(PublicationDocumentSummarySchema.array().parse(documents.map((document) => toTransportJson(toSummaryResponse(document)))));
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

    const legacyDocument = await getDocument(docId, authReq.userId!);
    res.json(PublicationDocumentDetailSchema.parse(toTransportJson({
      ...toRouteDocumentResponse(document),
      layoutPlan: legacyDocument?.layoutPlan ?? null,
    })));
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
        document: PublicationDocumentDetailSchema.parse(toTransportJson({
          ...toRouteDocumentResponse(result.document),
          layoutPlan: (await getDocument(docId, authReq.userId!))?.layoutPlan ?? null,
        })),
      });
      return;
    }

    res.json(PublicationDocumentDetailSchema.parse(toTransportJson({
      ...toRouteDocumentResponse(result.document),
      layoutPlan: (await getDocument(docId, authReq.userId!))?.layoutPlan ?? null,
    })));
  }),
);

// PATCH /api/v1/projects/:projectId/documents/:docId/layout
v1DocumentRoutes.patch(
  '/documents/:docId/layout',
  requireAuth,
  validateUuid('projectId', 'docId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const docId = req.params.docId as string;

    const parsed = LayoutPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid layout plan', details: parsed.error.flatten() });
      return;
    }

    const document = await updateDocumentLayout(docId, authReq.userId!, parsed.data as never);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const publicationDocument = await getPublicationDocument(docId, authReq.userId!);
    if (!publicationDocument) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(PublicationDocumentDetailSchema.parse(toTransportJson({
      ...toRouteDocumentResponse(publicationDocument),
      layoutPlan: document.layoutPlan ?? null,
    })));
  }),
);

export default v1DocumentRoutes;
