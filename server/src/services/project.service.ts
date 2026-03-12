import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { createProjectWithDocuments } from './project-document-bootstrap.service.js';
import {
  composeProjectContentFromDocuments,
  saveCanonicalProjectContent,
} from './project-document-content.service.js';

const DEFAULT_PROJECT_SETTINGS = {
  pageSize: 'letter',
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  columns: 1,
  theme: 'classic-parchment',
  fonts: { heading: 'Cinzel', body: 'Crimson Text' },
};

const BLANK_CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] };

export async function createProject(userId: string, data: {
  title: string;
  description?: string;
  type?: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  templateId?: string;
}) {
  let templateContent: unknown = null;

  if (data.templateId) {
    const template = await prisma.template.findUnique({ where: { id: data.templateId } });
    if (template) {
      templateContent = template.content;
      if (!data.type) {
        data.type = template.type;
      }
    }
  }

  return createProjectWithDocuments(userId, {
    title: data.title,
    description: data.description,
    type: data.type || 'campaign',
    templateContent: (templateContent as Prisma.InputJsonValue) ?? BLANK_CONTENT,
    settings: DEFAULT_PROJECT_SETTINGS as Prisma.InputJsonValue,
  });
}

export async function getUserProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      type: true,
      status: true,
      coverImageUrl: true,
      settings: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id, userId },
  });
  if (!project) return null;

  const documents = await prisma.projectDocument.findMany({
    where: { projectId: id },
    orderBy: { sortOrder: 'asc' },
    select: { content: true, updatedAt: true },
  });

  if (documents.length === 0) {
    return project;
  }

  const updatedAt = documents.reduce(
    (latest, document) => (document.updatedAt > latest ? document.updatedAt : latest),
    project.updatedAt,
  );

  return {
    ...project,
    content: composeProjectContentFromDocuments(documents),
    updatedAt,
  };
}

export async function updateProject(id: string, userId: string, data: {
  title?: string;
  description?: string;
  type?: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  status?: 'draft' | 'in_progress' | 'review' | 'published';
  settings?: Prisma.InputJsonValue;
}) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  // Merge settings with existing values to avoid overwriting unrelated keys
  if (data.settings && typeof data.settings === 'object' && typeof project.settings === 'object' && project.settings !== null) {
    data.settings = { ...(project.settings as Record<string, unknown>), ...(data.settings as Record<string, unknown>) } as Prisma.InputJsonValue;
  }

  return prisma.project.update({ where: { id }, data });
}

export async function updateProjectContent(id: string, userId: string, content: Prisma.InputJsonValue) {
  const result = await saveCanonicalProjectContent(id, userId, content);
  if (result.status !== 'success') return null;

  return {
    ...result.project,
    content: result.content,
    updatedAt: result.updatedAt,
  };
}

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  return prisma.project.delete({ where: { id } });
}
