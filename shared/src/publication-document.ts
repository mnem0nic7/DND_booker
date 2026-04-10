import { z } from 'zod';
import { ensureStableNodeIds } from './layout-plan.js';
import { LayoutDocumentV2Schema, parseLayoutDocumentV2 } from './layout-runtime-v2.js';
import { tiptapToTypst } from './renderers/tiptap-to-typst.js';
import type { DocumentContent } from './types/document.js';
import type { LayoutPlan } from './types/layout-plan.js';

export const PUBLICATION_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const PUBLICATION_DOCUMENT_KINDS = ['front_matter', 'chapter', 'appendix', 'back_matter'] as const;

export type PublicationDocumentKind = (typeof PUBLICATION_DOCUMENT_KINDS)[number];
export type CanonicalTypstNode = DocumentContent;
export type EditorProjection = DocumentContent;

const INLINE_MARK_SCHEMA = z.object({
  type: z.string().min(1),
  attrs: z.record(z.unknown()).optional(),
});

export const CanonicalTypstNodeSchema: z.ZodType<CanonicalTypstNode> = z.lazy(() => z.object({
  type: z.string().min(1),
  content: z.array(CanonicalTypstNodeSchema).optional(),
  attrs: z.record(z.unknown()).optional(),
  marks: z.array(INLINE_MARK_SCHEMA).optional(),
  text: z.string().optional(),
}));

export const EditorProjectionSchema = CanonicalTypstNodeSchema;

export const PublicationDocumentSchema = z.object({
  schemaVersion: z.literal(PUBLICATION_DOCUMENT_SCHEMA_VERSION),
  documentId: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: z.enum(PUBLICATION_DOCUMENT_KINDS),
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0),
  targetPageCount: z.number().int().positive().nullable(),
  status: z.string().min(1).max(50),
  sourceArtifactId: z.string().uuid().nullable(),
  canonicalDocJson: CanonicalTypstNodeSchema,
  editorProjectionJson: EditorProjectionSchema,
  typstSource: z.string(),
  layoutSnapshotJson: LayoutDocumentV2Schema.nullable(),
  layoutEngineVersion: z.number().int().positive().nullable(),
  layoutSnapshotUpdatedAt: z.string().datetime().nullable(),
  canonicalVersion: z.number().int().min(1),
  editorProjectionVersion: z.number().int().min(1),
  typstVersion: z.number().int().min(1),
  updatedAt: z.string().datetime(),
});

export const PublicationDocumentPatchSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  status: z.string().min(1).max(50).optional(),
  canonicalDocJson: CanonicalTypstNodeSchema.optional(),
  editorProjectionJson: EditorProjectionSchema.optional(),
}).refine(
  (value) =>
    value.title !== undefined
    || value.slug !== undefined
    || value.status !== undefined
    || value.canonicalDocJson !== undefined
    || value.editorProjectionJson !== undefined,
  { message: 'At least one field must be provided.' },
);

export type PublicationDocument = z.infer<typeof PublicationDocumentSchema>;
export type PublicationDocumentPatch = z.infer<typeof PublicationDocumentPatchSchema>;

export interface PublicationDocumentSnapshotInput {
  documentId: string;
  projectId: string;
  kind: PublicationDocumentKind;
  title: string;
  slug: string;
  sortOrder: number;
  targetPageCount: number | null;
  status: string;
  sourceArtifactId: string | null;
  canonicalDocJson?: unknown;
  editorProjectionJson?: unknown;
  content?: unknown;
  typstSource?: string | null;
  layoutSnapshotJson?: unknown;
  layoutEngineVersion?: number | null;
  layoutSnapshotUpdatedAt?: Date | null;
  canonicalVersion?: number | null;
  editorProjectionVersion?: number | null;
  typstVersion?: number | null;
  updatedAt: Date;
}

const BLANK_DOC: DocumentContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function asDocumentContent(value: unknown): DocumentContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as DocumentContent;
}

function normalizeNode(value: unknown): DocumentContent {
  const content = asDocumentContent(value);
  if (!content) return BLANK_DOC;

  const normalized = ensureStableNodeIds(content);
  if (normalized.type === 'doc') return normalized;
  return { type: 'doc', content: [normalized] };
}

export function normalizePublicationDocumentContent(value: unknown): DocumentContent {
  return normalizeNode(value);
}

export function canonicalPublicationDocumentToEditorProjection(
  canonicalDocJson: unknown,
): EditorProjection {
  return normalizeNode(canonicalDocJson);
}

export function canonicalPublicationDocumentToTypstSource(
  canonicalDocJson: unknown,
  options: {
    layoutPlan?: LayoutPlan | null;
    kind?: string | null;
    title?: string | null;
  } = {},
): string {
  return tiptapToTypst(normalizeNode(canonicalDocJson), {
    layoutPlan: options.layoutPlan ?? null,
    documentKind: options.kind ?? null,
    documentTitle: options.title ?? null,
  });
}

export function buildPublicationDocumentSnapshot(
  input: PublicationDocumentSnapshotInput,
): PublicationDocument {
  const editorProjectionJson = normalizeNode(
    input.editorProjectionJson ?? input.canonicalDocJson ?? input.content,
  );
  const canonicalDocJson = normalizeNode(
    input.canonicalDocJson ?? editorProjectionJson,
  );
  const typstSource = String(
    input.typstSource ?? canonicalPublicationDocumentToTypstSource(editorProjectionJson),
  );
  const layoutSnapshotJson = parseLayoutDocumentV2(input.layoutSnapshotJson);

  return {
    schemaVersion: PUBLICATION_DOCUMENT_SCHEMA_VERSION,
    documentId: input.documentId,
    projectId: input.projectId,
    kind: input.kind,
    title: input.title,
    slug: input.slug,
    sortOrder: input.sortOrder,
    targetPageCount: input.targetPageCount,
    status: input.status,
    sourceArtifactId: input.sourceArtifactId,
    canonicalDocJson,
    editorProjectionJson,
    typstSource,
    layoutSnapshotJson: layoutSnapshotJson as PublicationDocument['layoutSnapshotJson'],
    layoutEngineVersion: input.layoutEngineVersion ?? null,
    layoutSnapshotUpdatedAt: input.layoutSnapshotUpdatedAt?.toISOString() ?? null,
    canonicalVersion: input.canonicalVersion ?? 1,
    editorProjectionVersion: input.editorProjectionVersion ?? 1,
    typstVersion: input.typstVersion ?? 1,
    updatedAt: input.updatedAt.toISOString(),
  };
}
