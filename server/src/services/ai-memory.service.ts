import { prisma } from '../config/database.js';
import type { PlanTask } from '@dnd-booker/shared';

const MAX_WORKING_MEMORY_BULLETS = 20;

// --- Working Memory ---

export async function getWorkingMemory(projectId: string, userId: string): Promise<string[]> {
  const record = await prisma.aiWorkingMemory.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!record) return [];
  const bullets = record.bullets as unknown;
  return Array.isArray(bullets) ? bullets.filter((b): b is string => typeof b === 'string') : [];
}

export async function saveWorkingMemory(projectId: string, userId: string, bullets: string[]): Promise<void> {
  const trimmed = bullets.slice(0, MAX_WORKING_MEMORY_BULLETS);
  await prisma.aiWorkingMemory.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, bullets: trimmed },
    update: { bullets: trimmed },
  });
}

export async function resetWorkingMemory(projectId: string, userId: string): Promise<void> {
  await prisma.aiWorkingMemory.deleteMany({
    where: { projectId, userId },
  });
}

// --- Long-Term Memory Items ---

export async function getMemoryItems(userId: string, projectId?: string) {
  const where = projectId
    ? { userId, OR: [{ projectId }, { projectId: null }] }
    : { userId, projectId: null };

  return prisma.aiMemoryItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function addMemoryItem(userId: string, data: {
  type: string;
  content: string;
  projectId?: string | null;
  confidence?: number;
  source?: string | null;
}) {
  return prisma.aiMemoryItem.create({
    data: {
      userId,
      type: data.type,
      content: data.content,
      projectId: data.projectId ?? null,
      confidence: data.confidence ?? 1.0,
      source: data.source ?? null,
    },
  });
}

export async function removeMemoryItem(userId: string, itemId: string): Promise<boolean> {
  const item = await prisma.aiMemoryItem.findFirst({
    where: { id: itemId, userId },
  });
  if (!item) return false;

  await prisma.aiMemoryItem.delete({ where: { id: itemId } });
  return true;
}

// --- Task Plan ---

export async function getTaskPlan(projectId: string, userId: string): Promise<PlanTask[]> {
  const record = await prisma.aiTaskPlan.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!record) return [];
  const tasks = record.tasks as unknown;
  return Array.isArray(tasks) ? tasks as PlanTask[] : [];
}

export async function saveTaskPlan(projectId: string, userId: string, tasks: PlanTask[]): Promise<void> {
  const tasksJson = JSON.parse(JSON.stringify(tasks));
  await prisma.aiTaskPlan.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, tasks: tasksJson },
    update: { tasks: tasksJson },
  });
}

export async function resetTaskPlan(projectId: string, userId: string): Promise<void> {
  await prisma.aiTaskPlan.deleteMany({
    where: { projectId, userId },
  });
}
