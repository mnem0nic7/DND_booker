import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { resolveDocumentLayout } from './layout-plan.service.js';
import { rebuildProjectContentCache } from './project-document-content.service.js';
import {
  buildPublicationDocumentSnapshot,
  canonicalPublicationDocumentToTypstSource,
  normalizePublicationDocumentContent,
  type PublicationDocument,
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

  const currentCanonicalVersion = versions.canonicalVersion ?? 1;
  const currentEditorProjectionVersion = versions.editorProjectionVersion ?? 1;
  const currentTypstVersion = versions.typstVersion ?? 1;
  const bump = options.bumpVersions === true;

  return {
    content: canonicalDocJson as unknown as Prisma.InputJsonValue,
    canonicalDocJson: canonicalDocJson as unknown as Prisma.InputJsonValue,
    editorProjectionJson: editorProjectionJson as unknown as Prisma.InputJsonValue,
    typstSource,
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
  document: PublicationDocumentRecord,
): PublicationDocumentDetail {
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
      canonicalDocJson: document.canonicalDocJson ?? document.content,
      editorProjectionJson: document.editorProjectionJson ?? document.canonicalDocJson ?? document.content,
      typstSource: document.typstSource,
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
