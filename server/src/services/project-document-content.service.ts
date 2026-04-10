import { Prisma } from '@prisma/client';
import type { DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { splitProjectContentIntoDocuments } from './project-document-bootstrap.service.js';
import { resolveDocumentLayout } from './layout-plan.service.js';
import { buildPublicationDocumentStorageFields } from './document-publication.service.js';

const BLANK_DOC: DocumentContent = { type: 'doc', content: [{ type: 'paragraph' }] };

const canonicalProjectSelect = {
  id: true,
  userId: true,
  title: true,
  type: true,
  settings: true,
  content: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

type CanonicalProjectRecord = Prisma.ProjectGetPayload<{ select: typeof canonicalProjectSelect }>;

const documentContentSelect = {
  content: true,
  updatedAt: true,
} satisfies Prisma.ProjectDocumentSelect;

type CanonicalDocumentRecord = Prisma.ProjectDocumentGetPayload<{ select: typeof documentContentSelect }>;
type ProjectDocumentContentClient = Prisma.TransactionClient | typeof prisma;

export interface CanonicalProjectContentSnapshot {
  project: CanonicalProjectRecord;
  content: DocumentContent;
  updatedAt: Date;
  hasDocuments: boolean;
}

export type SaveCanonicalProjectContentResult =
  | { status: 'not_found' }
  | { status: 'conflict'; updatedAt: Date }
  | { status: 'success'; project: CanonicalProjectRecord; content: DocumentContent; updatedAt: Date };

export function composeProjectContentFromDocuments(
  documents: Array<{ content: unknown }>,
): DocumentContent {
  const nodes: DocumentContent[] = [];

  for (const document of documents) {
    const content = asDocumentContent(document.content);
    if (!content) continue;

    if (content.type === 'doc') {
      nodes.push(...(content.content ?? []));
      continue;
    }

    nodes.push(content);
  }

  return nodes.length > 0 ? { type: 'doc', content: nodes } : BLANK_DOC;
}

export async function rebuildProjectContentCache(
  projectId: string,
  client: ProjectDocumentContentClient = prisma,
): Promise<DocumentContent> {
  const documents = await client.projectDocument.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    select: documentContentSelect,
  });

  const content = composeProjectContentFromDocuments(documents);
  await client.project.update({
    where: { id: projectId },
    data: {
      content: content as unknown as Prisma.InputJsonValue,
    },
  });

  return content;
}

export async function getCanonicalProjectContent(
  projectId: string,
  userId: string,
): Promise<CanonicalProjectContentSnapshot | null> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: canonicalProjectSelect,
    });
    if (!project) return null;

    const documents = await tx.projectDocument.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: documentContentSelect,
    });

    if (documents.length === 0) {
      const content = asDocumentContent(project.content) ?? BLANK_DOC;
      return {
        project,
        content,
        updatedAt: project.updatedAt,
        hasDocuments: false,
      };
    }

    return {
      project,
      content: composeProjectContentFromDocuments(documents),
      updatedAt: latestUpdatedAt(project.updatedAt, documents),
      hasDocuments: true,
    };
  });
}

export async function saveCanonicalProjectContent(
  projectId: string,
  userId: string,
  rawContent: unknown,
  expectedUpdatedAt?: string,
): Promise<SaveCanonicalProjectContentResult> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, userId },
      select: canonicalProjectSelect,
    });
    if (!project) {
      return { status: 'not_found' };
    }

    const existingDocuments = await tx.projectDocument.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      select: documentContentSelect,
    });

    const currentUpdatedAt = existingDocuments.length > 0
      ? latestUpdatedAt(project.updatedAt, existingDocuments)
      : project.updatedAt;

    if (expectedUpdatedAt && currentUpdatedAt.toISOString() !== expectedUpdatedAt) {
      return { status: 'conflict', updatedAt: currentUpdatedAt };
    }

    const normalizedContent = asDocumentContent(rawContent) ?? BLANK_DOC;
    const splitDocuments = splitProjectContentIntoDocuments(
      project.title,
      project.type,
      normalizedContent,
    );

    await tx.projectDocument.deleteMany({ where: { projectId } });

    for (const document of splitDocuments) {
      const resolvedLayout = resolveDocumentLayout({
        content: document.content,
        kind: document.kind,
        title: document.title,
      });
      const publicationFields = buildPublicationDocumentStorageFields({
        content: resolvedLayout.content,
        layoutPlan: resolvedLayout.layoutPlan,
        kind: document.kind,
        title: document.title,
        theme: typeof (project.settings as Record<string, unknown> | null)?.theme === 'string'
          ? String((project.settings as Record<string, unknown>).theme)
          : null,
      });

      await tx.projectDocument.create({
        data: {
          projectId,
          runId: null,
          kind: document.kind,
          title: document.title,
          slug: document.slug,
          sortOrder: document.sortOrder,
          targetPageCount: null,
          outlineJson: Prisma.JsonNull,
          layoutPlan: resolvedLayout.layoutPlan as unknown as Prisma.InputJsonValue,
          content: resolvedLayout.content as unknown as Prisma.InputJsonValue,
          canonicalDocJson: publicationFields.canonicalDocJson,
          editorProjectionJson: publicationFields.editorProjectionJson,
          typstSource: publicationFields.typstSource,
          layoutSnapshotJson: publicationFields.layoutSnapshotJson,
          layoutEngineVersion: publicationFields.layoutEngineVersion,
          layoutSnapshotUpdatedAt: publicationFields.layoutSnapshotUpdatedAt,
          canonicalVersion: publicationFields.canonicalVersion,
          editorProjectionVersion: publicationFields.editorProjectionVersion,
          typstVersion: publicationFields.typstVersion,
          status: document.status,
          sourceArtifactId: null,
        },
      });
    }

    const content = composeProjectContentFromDocuments(splitDocuments);
    const updatedProject = await tx.project.update({
      where: { id: projectId },
      data: { content: content as unknown as Prisma.InputJsonValue },
      select: canonicalProjectSelect,
    });

    return {
      status: 'success',
      project: updatedProject,
      content,
      updatedAt: updatedProject.updatedAt,
    };
  });
}

function latestUpdatedAt(
  projectUpdatedAt: Date,
  documents: Array<Pick<CanonicalDocumentRecord, 'updatedAt'>>,
): Date {
  return documents.reduce(
    (latest, document) => (document.updatedAt > latest ? document.updatedAt : latest),
    projectUpdatedAt,
  );
}

function asDocumentContent(value: unknown): DocumentContent | null {
  if (typeof value !== 'object' || value == null || !('type' in value)) {
    return null;
  }

  return value as DocumentContent;
}
