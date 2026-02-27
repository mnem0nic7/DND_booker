import { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';

const DEFAULT_PROJECT_SETTINGS = {
  pageSize: 'letter',
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  columns: 1,
  theme: 'classic-parchment',
  fonts: { heading: 'Cinzel', body: 'Crimson Text' },
};

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
      // Use the template's type if the caller didn't specify one
      if (!data.type) {
        data.type = template.type;
      }
    }
  }

  const project = await prisma.project.create({
    data: {
      userId,
      title: data.title,
      description: data.description || '',
      type: data.type || 'campaign',
      settings: DEFAULT_PROJECT_SETTINGS,
    },
  });

  // Create an initial document — either from template or blank
  await prisma.document.create({
    data: {
      projectId: project.id,
      title: templateContent ? data.title : 'Untitled',
      content: (templateContent as Prisma.InputJsonValue) ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      sortOrder: 0,
    },
  });

  return project;
}

export async function getUserProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { documents: true } } },
  });
}

export async function getProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: { id, userId },
    include: {
      documents: { orderBy: { sortOrder: 'asc' } },
    },
  });
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

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  return prisma.project.delete({ where: { id } });
}
