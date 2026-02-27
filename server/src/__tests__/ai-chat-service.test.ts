import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import * as aiChat from '../services/ai-chat.service.js';

// Integration tests for AI chat service (database operations).
// Requires running PostgreSQL.

const TEST_USER = {
  email: 'ai-chat-svc-test@example.com',
  password: 'hashed-unused',
  displayName: 'Chat Service Test',
};

let userId: string;
let projectId: string;

describe('AI Chat Service', () => {
  beforeAll(async () => {
    // Clean up and create test user + project
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.aiChatMessage.deleteMany({ where: { session: { userId: existing.id } } });
      await prisma.aiChatSession.deleteMany({ where: { userId: existing.id } });
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        passwordHash: '$2b$10$placeholder',
        displayName: TEST_USER.displayName,
      },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: { title: 'Chat Service Test Project', userId },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.aiChatMessage.deleteMany({ where: { session: { userId: existing.id } } });
      await prisma.aiChatSession.deleteMany({ where: { userId: existing.id } });
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('getOrCreateSession', () => {
    it('should create a new session for a project/user pair', async () => {
      const session = await aiChat.getOrCreateSession(projectId, userId);
      expect(session).toBeDefined();
      expect(session.projectId).toBe(projectId);
      expect(session.userId).toBe(userId);
      expect(session.id).toBeDefined();
    });

    it('should return the same session on subsequent calls', async () => {
      const session1 = await aiChat.getOrCreateSession(projectId, userId);
      const session2 = await aiChat.getOrCreateSession(projectId, userId);
      expect(session1.id).toBe(session2.id);
    });
  });

  describe('addMessage + getSessionMessages', () => {
    it('should add and retrieve messages in order', async () => {
      const session = await aiChat.getOrCreateSession(projectId, userId);

      await aiChat.addMessage(session.id, 'user', 'Create an orc');
      await aiChat.addMessage(session.id, 'assistant', 'Here is your orc stat block...');

      const messages = await aiChat.getSessionMessages(session.id);
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Create an orc');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Here is your orc stat block...');
    });

    it('should support optional blocks field', async () => {
      const session = await aiChat.getOrCreateSession(projectId, userId);
      const blocks = [{ type: 'statBlock', name: 'Orc' }];

      const msg = await aiChat.addMessage(session.id, 'assistant', 'Here you go', blocks);
      expect(msg.blocks).toEqual(blocks);
    });
  });

  describe('getRecentMessages', () => {
    it('should return only the most recent N messages', async () => {
      const session = await aiChat.getOrCreateSession(projectId, userId);

      // Add several messages
      for (let i = 0; i < 5; i++) {
        await aiChat.addMessage(session.id, 'user', `Message ${i}`);
      }

      const recent = await aiChat.getRecentMessages(session.id, 3);
      expect(recent.length).toBe(3);
      // Should be in ascending order (oldest to newest of the recent 3)
      expect(recent[0].createdAt.getTime()).toBeLessThanOrEqual(recent[1].createdAt.getTime());
    });
  });

  describe('getSessionByProject', () => {
    it('should return session with messages included', async () => {
      const result = await aiChat.getSessionByProject(projectId, userId);
      expect(result).not.toBeNull();
      expect(result!.messages).toBeDefined();
      expect(Array.isArray(result!.messages)).toBe(true);
      expect(result!.messages.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent project/user pair', async () => {
      const result = await aiChat.getSessionByProject('00000000-0000-0000-0000-000000000000', userId);
      expect(result).toBeNull();
    });
  });

  describe('clearSessionByProject', () => {
    it('should delete all messages for a project', async () => {
      const result = await aiChat.clearSessionByProject(projectId, userId);
      expect(result).toBe(true);

      // Verify messages are gone
      const session = await aiChat.getSessionByProject(projectId, userId);
      expect(session!.messages.length).toBe(0);
    });

    it('should return null for non-existent session', async () => {
      const result = await aiChat.clearSessionByProject('00000000-0000-0000-0000-000000000000', userId);
      expect(result).toBeNull();
    });
  });
});
