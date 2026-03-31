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
  theme: 'gilded-folio',
  fonts: { heading: 'Cinzel', body: 'Crimson Text' },
  textLayoutFallbacks: {},
};

const BLANK_CONTENT = { type: 'doc', content: [{ type: 'paragraph' }] };

function normalizeTextLayoutFallbacks(value: unknown): Record<string, { scopeIds: string[] }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([documentId, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const rawScopeIds = (entry as { scopeIds?: unknown }).scopeIds;
      if (!Array.isArray(rawScopeIds)) return [];
      const scopeIds = [...new Set(
        rawScopeIds
          .filter((scopeId): scopeId is string => typeof scopeId === 'string' && /^(group|unit):.+$/.test(scopeId))
          .map((scopeId) => scopeId.trim())
          .filter(Boolean),
      )];
      if (scopeIds.length === 0) return [];
      return [[documentId, { scopeIds }]];
    }),
  );
}

function normalizeProjectSettings(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }

  const raw = value as Record<string, unknown>;
  return {
    ...DEFAULT_PROJECT_SETTINGS,
    ...raw,
    textLayoutFallbacks: normalizeTextLayoutFallbacks(raw.textLayoutFallbacks),
  };
}

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
  const projects = await prisma.project.findMany({
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

  return projects.map((project) => ({
    ...project,
    settings: normalizeProjectSettings(project.settings),
  }));
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
    return {
      ...project,
      settings: normalizeProjectSettings(project.settings),
    };
  }

  const updatedAt = documents.reduce(
    (latest, document) => (document.updatedAt > latest ? document.updatedAt : latest),
    project.updatedAt,
  );

  return {
    ...project,
    settings: normalizeProjectSettings(project.settings),
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

  const updated = await prisma.project.update({ where: { id }, data });
  return {
    ...updated,
    settings: normalizeProjectSettings(updated.settings),
  };
}

export async function updateProjectContent(id: string, userId: string, content: Prisma.InputJsonValue) {
  const result = await saveCanonicalProjectContent(id, userId, content);
  if (result.status !== 'success') return null;

  return {
    ...result.project,
    settings: normalizeProjectSettings(result.project.settings),
    content: result.content,
    updatedAt: result.updatedAt,
  };
}

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  return prisma.project.delete({ where: { id } });
}
