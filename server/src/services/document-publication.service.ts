import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { resolveDocumentLayout } from './layout-plan.service.js';
import { rebuildProjectContentCache } from './project-document-content.service.js';
import {
  buildLayoutDocumentV2,
  buildPublicationDocumentSnapshot,
  canonicalPublicationDocumentToTypstSource,
  normalizePublicationDocumentContent,
  parseLayoutDocumentV2,
  type PublicationDocument,
  type LayoutPlan,
  type PagePreset,
} from '@dnd-booker/shared';

export const publicationDocumentFullSelect = {
  id: true,
  projectId: true,
  runId: true,
  kind: true,
  title: true,
  slug: true,
  sortOrder: true,
  targetPageCount: true,
  outlineJson: true,
  layoutPlan: true,
  content: true,
  canonicalDocJson: true,
  editorProjectionJson: true,
  typstSource: true,
  layoutSnapshotJson: true,
  layoutEngineVersion: true,
  layoutSnapshotUpdatedAt: true,
  canonicalVersion: true,
  editorProjectionVersion: true,
  typstVersion: true,
  status: true,
  sourceArtifactId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectDocumentSelect;

export type PublicationDocumentRecord = Prisma.ProjectDocumentGetPayload<{
  select: typeof publicationDocumentFullSelect;
}>;

export const publicationDocumentListSelect = {
  id: true,
  projectId: true,
  runId: true,
  kind: true,
  title: true,
  slug: true,
  sortOrder: true,
  targetPageCount: true,
  layoutPlan: true,
  status: true,
  sourceArtifactId: true,
  layoutSnapshotJson: true,
  layoutEngineVersion: true,
  layoutSnapshotUpdatedAt: true,
  canonicalVersion: true,
  editorProjectionVersion: true,
  typstVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectDocumentSelect;

export interface PublicationDocumentStorageInput {
  content?: unknown;
  canonicalDocJson?: unknown;
  editorProjectionJson?: unknown;
  typstSource?: string | null;
  layoutSnapshotJson?: unknown;
  layoutSnapshotPreset?: PagePreset;
  theme?: string | null;
  layoutPlan?: unknown;
  kind?: string | null;
  title?: string | null;
}

export interface PublicationDocumentVersionState {
  canonicalVersion?: number | null;
  editorProjectionVersion?: number | null;
  typstVersion?: number | null;
}

export interface PublicationDocumentStorageFields {
  content: Prisma.InputJsonValue;
  canonicalDocJson: Prisma.InputJsonValue;
  editorProjectionJson: Prisma.InputJsonValue;
  typstSource: string;
  layoutSnapshotJson: Prisma.InputJsonValue;
  layoutEngineVersion: number;
  layoutSnapshotUpdatedAt: Date;
  canonicalVersion: number;
  editorProjectionVersion: number;
  typstVersion: number;
}

export interface PublicationDocumentWriteData extends PublicationDocumentStorageFields {
  layoutPlan: Prisma.InputJsonValue;
}

export interface PublicationDocumentSummary {
  id: string;
  projectId: string;
  runId: string | null;
  kind: string;
  title: string;
  slug: string;
  sortOrder: number;
  targetPageCount: number | null;
  layoutPlan: unknown | null;
  status: string;
  sourceArtifactId: string | null;
  layoutSnapshotJson: unknown | null;
  layoutEngineVersion: number | null;
  layoutSnapshotUpdatedAt: string | null;
  canonicalVersion: number;
  editorProjectionVersion: number;
  typstVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicationDocumentDetail extends PublicationDocument {
  runId: string | null;
  layoutPlan: unknown | null;
}

function resolveThemeName(settings: unknown): string {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'gilded-folio';
  const theme = (settings as Record<string, unknown>).theme;
  return typeof theme === 'string' && theme.trim().length > 0 ? theme : 'gilded-folio';
}

export type PublicationDocumentUpdateResult =
  | { status: 'not_found' }
  | { status: 'conflict'; document: PublicationDocumentDetail }
  | { status: 'success'; document: PublicationDocumentDetail };

export function buildPublicationDocumentStorageFields(
  input: PublicationDocumentStorageInput,
  versions: PublicationDocumentVersionState = {},
  options: { bumpVersions?: boolean } = {},
): PublicationDocumentStorageFields {
  const canonicalSource = input.canonicalDocJson ?? input.editorProjectionJson ?? input.content;
  const canonicalDocJson = normalizePublicationDocumentContent(canonicalSource);
  const editorProjectionJson = normalizePublicationDocumentContent(canonicalSource);
  const typstSource = String(
    input.typstSource ?? canonicalPublicationDocumentToTypstSource(canonicalDocJson, {
      layoutPlan: (input.layoutPlan ?? null) as any,
      kind: input.kind ?? null,
      title: input.title ?? null,
    }),
  );
  const layoutSnapshotPreset = input.layoutSnapshotPreset ?? 'standard_pdf';
  const parsedLayoutSnapshot = parseLayoutDocumentV2(input.layoutSnapshotJson);
  const layoutSnapshotJson = parsedLayoutSnapshot && parsedLayoutSnapshot.preset === layoutSnapshotPreset
    ? parsedLayoutSnapshot
    : buildLayoutDocumentV2({
        content: canonicalDocJson,
        layoutPlan: (input.layoutPlan ?? null) as LayoutPlan | null,
        preset: layoutSnapshotPreset,
        theme: input.theme ?? 'gilded-folio',
        documentKind: input.kind ?? null,
        documentTitle: input.title ?? null,
        measurementMode: 'deterministic',
        respectManualPageBreaks: true,
      });

  const currentCanonicalVersion = versions.canonicalVersion ?? 1;
  const currentEditorProjectionVersion = versions.editorProjectionVersion ?? 1;
  const currentTypstVersion = versions.typstVersion ?? 1;
  const bump = options.bumpVersions === true;

  return {
    content: canonicalDocJson as unknown as Prisma.InputJsonValue,
    canonicalDocJson: canonicalDocJson as unknown as Prisma.InputJsonValue,
    editorProjectionJson: editorProjectionJson as unknown as Prisma.InputJsonValue,
    typstSource,
    layoutSnapshotJson: layoutSnapshotJson as unknown as Prisma.InputJsonValue,
    layoutEngineVersion: layoutSnapshotJson.version,
    layoutSnapshotUpdatedAt: new Date(layoutSnapshotJson.generatedAt),
    canonicalVersion: bump ? currentCanonicalVersion + 1 : currentCanonicalVersion,
    editorProjectionVersion: bump ? currentEditorProjectionVersion + 1 : currentEditorProjectionVersion,
    typstVersion: bump ? currentTypstVersion + 1 : currentTypstVersion,
  };
}

export function buildResolvedPublicationDocumentWriteData(input: {
  content: unknown;
  layoutPlan?: unknown;
  kind?: string | null;
  title?: string | null;
  theme?: string | null;
  layoutSnapshotPreset?: PagePreset;
  versions?: PublicationDocumentVersionState;
  bumpVersions?: boolean;
}): PublicationDocumentWriteData {
  const resolvedLayout = resolveDocumentLayout({
    content: input.content,
    layoutPlan: input.layoutPlan,
    kind: input.kind ?? null,
    title: input.title ?? null,
  });
  const publicationFields = buildPublicationDocumentStorageFields(
    {
      content: resolvedLayout.content,
      layoutPlan: resolvedLayout.layoutPlan,
      kind: input.kind ?? null,
      title: input.title ?? null,
      theme: input.theme ?? null,
      layoutSnapshotPreset: input.layoutSnapshotPreset,
    },
    input.versions,
    { bumpVersions: input.bumpVersions === true },
  );

  return {
    ...publicationFields,
    layoutPlan: resolvedLayout.layoutPlan as unknown as Prisma.InputJsonValue,
  };
}

export function toPublicationDocumentSnapshot(
  document: PublicationDocumentRecord & { project?: { settings?: unknown } | null },
): PublicationDocumentDetail {
  const canonicalDocJson = document.canonicalDocJson ?? document.content;
  const editorProjectionJson = document.editorProjectionJson ?? document.canonicalDocJson ?? document.content;
  const layoutSnapshotJson = parseLayoutDocumentV2(document.layoutSnapshotJson)
    ?? buildLayoutDocumentV2({
      content: normalizePublicationDocumentContent(canonicalDocJson),
      layoutPlan: (document.layoutPlan ?? null) as LayoutPlan | null,
      preset: 'standard_pdf',
      theme: resolveThemeName(document.project?.settings),
      documentKind: document.kind,
      documentTitle: document.title,
      measurementMode: 'deterministic',
      respectManualPageBreaks: true,
    });

  return {
    ...buildPublicationDocumentSnapshot({
      documentId: document.id,
      projectId: document.projectId,
      kind: document.kind,
      title: document.title,
      slug: document.slug,
      sortOrder: document.sortOrder,
      targetPageCount: document.targetPageCount,
      status: document.status,
      sourceArtifactId: document.sourceArtifactId,
      canonicalDocJson,
      editorProjectionJson,
      typstSource: document.typstSource,
      layoutSnapshotJson,
      layoutEngineVersion: document.layoutEngineVersion ?? layoutSnapshotJson.version,
      layoutSnapshotUpdatedAt: document.layoutSnapshotUpdatedAt ?? document.updatedAt,
      canonicalVersion: document.canonicalVersion ?? 1,
      editorProjectionVersion: document.editorProjectionVersion ?? 1,
      typstVersion: document.typstVersion ?? 1,
      updatedAt: document.updatedAt,
    }),
    runId: document.runId,
    layoutPlan: document.layoutPlan,
  };
}

function toPublicationDocumentSummary(
  document: Prisma.ProjectDocumentGetPayload<{ select: typeof publicationDocumentListSelect }>,
): PublicationDocumentSummary {
  return {
    id: document.id,
    projectId: document.projectId,
    runId: document.runId,
    kind: document.kind,
    title: document.title,
    slug: document.slug,
    sortOrder: document.sortOrder,
    targetPageCount: document.targetPageCount,
    layoutPlan: document.layoutPlan,
    status: document.status,
    sourceArtifactId: document.sourceArtifactId,
    layoutSnapshotJson: document.layoutSnapshotJson,
    layoutEngineVersion: document.layoutEngineVersion,
    layoutSnapshotUpdatedAt: document.layoutSnapshotUpdatedAt?.toISOString() ?? null,
    canonicalVersion: document.canonicalVersion ?? 1,
    editorProjectionVersion: document.editorProjectionVersion ?? 1,
    typstVersion: document.typstVersion ?? 1,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function listPublicationDocuments(
  projectId: string,
  userId: string,
): Promise<PublicationDocumentSummary[] | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return null;

  const documents = await prisma.projectDocument.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: publicationDocumentListSelect,
  });

  return documents.map((document) => toPublicationDocumentSummary(document));
}

export async function getPublicationDocument(
  documentId: string,
  userId: string,
): Promise<PublicationDocumentDetail | null> {
  const document = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!document || document.project.userId !== userId) return null;

  return toPublicationDocumentSnapshot(document);
}

export interface UpdatePublicationDocumentInput {
  expectedUpdatedAt?: string;
  title?: string;
  slug?: string;
  status?: string;
  canonicalDocJson?: unknown;
  editorProjectionJson?: unknown;
}

export async function updatePublicationDocument(
  documentId: string,
  userId: string,
  patch: UpdatePublicationDocumentInput,
): Promise<PublicationDocumentUpdateResult> {
  const document = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!document || document.project.userId !== userId) return { status: 'not_found' };

  if (patch.expectedUpdatedAt && document.updatedAt.toISOString() !== patch.expectedUpdatedAt) {
    return { status: 'conflict', document: toPublicationDocumentSnapshot(document) };
  }

  const hasBodyUpdate = patch.canonicalDocJson !== undefined || patch.editorProjectionJson !== undefined;
  const nextBodySource = patch.canonicalDocJson ?? patch.editorProjectionJson ?? document.content;
  const resolvedLayout = hasBodyUpdate
    ? resolveDocumentLayout({
      content: nextBodySource,
      layoutPlan: document.layoutPlan,
      kind: document.kind,
      title: patch.title ?? document.title,
    })
    : {
        content: normalizePublicationDocumentContent(document.content),
        layoutPlan: document.layoutPlan as unknown as Prisma.JsonObject | null,
      };

  const publicationFields = buildPublicationDocumentStorageFields(
    {
      content: resolvedLayout.content,
      canonicalDocJson: patch.canonicalDocJson,
      editorProjectionJson: patch.editorProjectionJson,
      typstSource: hasBodyUpdate ? null : document.typstSource,
      layoutPlan: resolvedLayout.layoutPlan,
      kind: document.kind,
      title: patch.title ?? document.title,
      theme: resolveThemeName(document.project.settings),
    },
    {
      canonicalVersion: document.canonicalVersion,
      editorProjectionVersion: document.editorProjectionVersion,
      typstVersion: document.typstVersion,
    },
    { bumpVersions: hasBodyUpdate },
  );

  const updated = await prisma.projectDocument.update({
    where: { id: documentId },
    data: {
      title: patch.title ?? document.title,
      slug: patch.slug ?? document.slug,
      status: patch.status ?? document.status,
      content: publicationFields.content,
      canonicalDocJson: publicationFields.canonicalDocJson,
      editorProjectionJson: publicationFields.editorProjectionJson,
      typstSource: publicationFields.typstSource,
      layoutSnapshotJson: publicationFields.layoutSnapshotJson,
      layoutEngineVersion: publicationFields.layoutEngineVersion,
      layoutSnapshotUpdatedAt: publicationFields.layoutSnapshotUpdatedAt,
      canonicalVersion: publicationFields.canonicalVersion,
      editorProjectionVersion: publicationFields.editorProjectionVersion,
      typstVersion: publicationFields.typstVersion,
      ...(hasBodyUpdate
        ? {
            layoutPlan: resolvedLayout.layoutPlan as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
    include: { project: true },
  });
  await rebuildProjectContentCache(updated.projectId);

  return { status: 'success', document: toPublicationDocumentSnapshot(updated) };
}

export async function updatePublicationDocumentLayout(
  documentId: string,
  userId: string,
  layoutPlan: unknown,
): Promise<PublicationDocumentDetail | null> {
  const document = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!document || document.project.userId !== userId) return null;

  const resolvedLayout = resolveDocumentLayout({
    content: document.content,
    layoutPlan,
    kind: document.kind,
    title: document.title,
  });
  const publicationFields = buildPublicationDocumentStorageFields(
    {
      content: resolvedLayout.content,
      layoutPlan: resolvedLayout.layoutPlan,
      kind: document.kind,
      title: document.title,
      theme: resolveThemeName(document.project.settings),
    },
    {
      canonicalVersion: document.canonicalVersion,
      editorProjectionVersion: document.editorProjectionVersion,
      typstVersion: document.typstVersion,
    },
  );

  const updated = await prisma.projectDocument.update({
    where: { id: documentId },
    data: {
      content: resolvedLayout.content as unknown as Prisma.InputJsonValue,
      layoutPlan: resolvedLayout.layoutPlan as unknown as Prisma.InputJsonValue,
      canonicalDocJson: publicationFields.canonicalDocJson,
      editorProjectionJson: publicationFields.editorProjectionJson,
      typstSource: publicationFields.typstSource,
      layoutSnapshotJson: publicationFields.layoutSnapshotJson,
      layoutEngineVersion: publicationFields.layoutEngineVersion,
      layoutSnapshotUpdatedAt: publicationFields.layoutSnapshotUpdatedAt,
      canonicalVersion: publicationFields.canonicalVersion,
      editorProjectionVersion: publicationFields.editorProjectionVersion,
      typstVersion: publicationFields.typstVersion,
      status: 'edited',
    },
    select: publicationDocumentFullSelect,
  });

  await rebuildProjectContentCache(updated.projectId);
  return toPublicationDocumentSnapshot(updated);
}
