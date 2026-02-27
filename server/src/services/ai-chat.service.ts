import { prisma } from '../config/database.js';

export async function getOrCreateSession(projectId: string, userId: string) {
  return prisma.aiChatSession.upsert({
    where: {
      projectId_userId: { projectId, userId },
    },
    create: { projectId, userId },
    update: {},
  });
}

export async function getRecentMessages(sessionId: string, limit: number) {
  const messages = await prisma.aiChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return messages.reverse();
}

const MAX_MESSAGES_TO_LOAD = 200;

export async function getSessionByProject(projectId: string, userId: string) {
  return prisma.aiChatSession.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: MAX_MESSAGES_TO_LOAD },
    },
  });
}

export async function getMessageCount(sessionId: string): Promise<number> {
  return prisma.aiChatMessage.count({ where: { sessionId } });
}

export async function addMessage(
  sessionId: string,
  role: string,
  content: string,
  blocks?: unknown,
) {
  return prisma.aiChatMessage.create({
    data: {
      sessionId,
      role,
      content,
      blocks: blocks ?? undefined,
    },
  });
}

export async function clearSessionByProject(projectId: string, userId: string) {
  const session = await prisma.aiChatSession.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
  });
  if (!session) return null;

  await prisma.aiChatMessage.deleteMany({
    where: { sessionId: session.id },
  });
  return true;
}
