import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ensureProjectDocuments } from './project-document-bootstrap.service.js';
import { resolveDocumentLayout } from './layout-plan.service.js';
import { buildPublicationDocumentStorageFields } from './document-publication.service.js';
import { rebuildProjectContentCache } from './project-document-content.service.js';

/**
 * List all documents for a project (excluding large content/outline fields).
 * Returns null if the project doesn't exist or the user doesn't own it.
 */
export async function listDocuments(projectId: string, userId: string) {
  return ensureProjectDocuments(projectId, userId);
}

/**
 * Get a single document by ID. Verifies that the calling user owns the parent project.
 * Returns null if not found or unauthorized.
 */
export async function getDocument(documentId: string, userId: string) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!doc || doc.project.userId !== userId) return null;

  // Strip the nested project before returning
  const { project: _project, ...document } = doc;
  return document;
}

/**
 * Update a document's content and set status to 'edited'.
 * Returns null if the document doesn't exist or the user doesn't own the project.
 */
export async function updateDocumentContent(
  documentId: string,
  userId: string,
  content: Prisma.InputJsonValue,
) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!doc || doc.project.userId !== userId) return null;

  const resolvedLayout = resolveDocumentLayout({
    content,
    layoutPlan: doc.layoutPlan,
    kind: doc.kind,
    title: doc.title,
  });
  const publicationFields = buildPublicationDocumentStorageFields(
    {
      content: resolvedLayout.content,
      layoutPlan: resolvedLayout.layoutPlan,
      kind: doc.kind,
      title: doc.title,
      theme: typeof (doc.project.settings as Record<string, unknown> | null)?.theme === 'string'
        ? String((doc.project.settings as Record<string, unknown>).theme)
        : null,
    },
    {
      canonicalVersion: doc.canonicalVersion,
      editorProjectionVersion: doc.editorProjectionVersion,
      typstVersion: doc.typstVersion,
    },
    { bumpVersions: true },
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
  });
  await rebuildProjectContentCache(doc.projectId);
  return updated;
}

/**
 * Update a document's persisted layout plan while keeping content canonical.
 * Returns null if the document doesn't exist or the user doesn't own the project.
 */
export async function updateDocumentLayout(
  documentId: string,
  userId: string,
  layoutPlan: Prisma.InputJsonValue,
) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!doc || doc.project.userId !== userId) return null;

  const resolvedLayout = resolveDocumentLayout({
    content: doc.content,
    layoutPlan,
    kind: doc.kind,
    title: doc.title,
  });
  const publicationFields = buildPublicationDocumentStorageFields(
    {
      content: resolvedLayout.content,
      layoutPlan: resolvedLayout.layoutPlan,
      kind: doc.kind,
      title: doc.title,
      theme: typeof (doc.project.settings as Record<string, unknown> | null)?.theme === 'string'
        ? String((doc.project.settings as Record<string, unknown>).theme)
        : null,
    },
    {
      canonicalVersion: doc.canonicalVersion,
      editorProjectionVersion: doc.editorProjectionVersion,
      typstVersion: doc.typstVersion,
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
  });
  await rebuildProjectContentCache(doc.projectId);
  return updated;
}

/**
 * Update a document's title.
 * Returns null if the document doesn't exist or the user doesn't own the project.
 */
export async function updateDocumentTitle(
  documentId: string,
  userId: string,
  title: string,
) {
  const doc = await prisma.projectDocument.findUnique({
    where: { id: documentId },
    include: { project: true },
  });
  if (!doc || doc.project.userId !== userId) return null;

  const updated = await prisma.projectDocument.update({
    where: { id: documentId },
    data: { title },
  });
  await rebuildProjectContentCache(doc.projectId);
  return updated;
}

/**
 * Reorder documents within a project. The `orderedIds` array specifies the new
 * sort order (index 0 = sortOrder 0, index 1 = sortOrder 1, etc.).
 *
 * Returns null if the project doesn't exist, the user doesn't own it,
 * or the provided IDs don't match the project's documents exactly.
 */
export async function reorderDocuments(
  projectId: string,
  userId: string,
  orderedIds: string[],
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  // Verify all IDs belong to this project
  const existingDocs = await prisma.projectDocument.findMany({
    where: { projectId },
    select: { id: true },
  });

  const existingIdSet = new Set(existingDocs.map((d) => d.id));
  const orderedIdSet = new Set(orderedIds);

  // Every ordered ID must belong to the project, and counts must match
  if (orderedIds.length !== existingDocs.length) return null;
  for (const id of orderedIds) {
    if (!existingIdSet.has(id)) return null;
  }
  // Guard against duplicates in orderedIds
  if (orderedIdSet.size !== orderedIds.length) return null;

  // Update all sort orders in a single transaction
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.projectDocument.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
  await rebuildProjectContentCache(projectId);

  // Return the updated list (excluding large fields)
  return prisma.projectDocument.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
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
      createdAt: true,
      updatedAt: true,
    },
  });
}
