import { prisma } from '../config/database.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON fields require InputJsonValue which is incompatible with strict interfaces
export async function createDocument(projectId: string, userId: string, data: { title: string; content?: any }) {
  // Verify project belongs to user
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const maxOrder = await prisma.document.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  return prisma.document.create({
    data: {
      projectId,
      title: data.title,
      content: data.content || { type: 'doc', content: [{ type: 'paragraph' }] },
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function getProjectDocuments(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  return prisma.document.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function updateDocument(id: string, userId: string, data: { title?: string; content?: any }) {
  const doc = await prisma.document.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!doc || doc.project.userId !== userId) return null;

  return prisma.document.update({ where: { id }, data });
}

export async function reorderDocuments(projectId: string, userId: string, documentIds: string[]) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  // Verify all document IDs belong to this project (prevents IDOR)
  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, projectId },
    select: { id: true },
  });
  if (docs.length !== documentIds.length) return null;

  const updates = documentIds.map((id, index) =>
    prisma.document.update({ where: { id }, data: { sortOrder: index } })
  );

  return prisma.$transaction(updates);
}

export async function deleteDocument(id: string, userId: string) {
  const doc = await prisma.document.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  });
  if (!doc || doc.project.userId !== userId) return null;

  return prisma.document.delete({ where: { id } });
}
