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
}) {
  return prisma.project.create({
    data: {
      userId,
      title: data.title,
      description: data.description || '',
      type: data.type || 'campaign',
      settings: DEFAULT_PROJECT_SETTINGS,
    },
  });
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

  return prisma.project.update({ where: { id }, data });
}

export async function deleteProject(id: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) return null;

  return prisma.project.delete({ where: { id } });
}
