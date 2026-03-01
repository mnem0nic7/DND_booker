import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../config/database.js';
import * as aiMemory from '../services/ai-memory.service.js';

const TEST_USER = {
  email: 'ai-memory-svc-test@example.com',
  displayName: 'Memory Service Test',
};

let userId: string;
let projectId: string;

describe('AI Memory Service', () => {
  beforeAll(async () => {
    // Clean up any previous test data
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.aiMemoryItem.deleteMany({ where: { userId: existing.id } });
      await prisma.aiWorkingMemory.deleteMany({ where: { userId: existing.id } });
      await prisma.aiTaskPlan.deleteMany({ where: { userId: existing.id } });
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
      data: { title: 'Memory Test Project', userId },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.aiMemoryItem.deleteMany({ where: { userId: existing.id } });
      await prisma.aiWorkingMemory.deleteMany({ where: { userId: existing.id } });
      await prisma.aiTaskPlan.deleteMany({ where: { userId: existing.id } });
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  // --- Working Memory ---

  describe('Working Memory', () => {
    it('should return empty array for new project', async () => {
      const bullets = await aiMemory.getWorkingMemory(projectId, userId);
      expect(bullets).toEqual([]);
    });

    it('should save and retrieve bullets', async () => {
      await aiMemory.saveWorkingMemory(projectId, userId, ['Note 1', 'Note 2']);
      const bullets = await aiMemory.getWorkingMemory(projectId, userId);
      expect(bullets).toEqual(['Note 1', 'Note 2']);
    });

    it('should upsert on subsequent saves', async () => {
      await aiMemory.saveWorkingMemory(projectId, userId, ['Updated note']);
      const bullets = await aiMemory.getWorkingMemory(projectId, userId);
      expect(bullets).toEqual(['Updated note']);
    });

    it('should cap at 20 bullets', async () => {
      const many = Array.from({ length: 25 }, (_, i) => `Bullet ${i}`);
      await aiMemory.saveWorkingMemory(projectId, userId, many);
      const bullets = await aiMemory.getWorkingMemory(projectId, userId);
      expect(bullets).toHaveLength(20);
    });

    it('should reset working memory', async () => {
      await aiMemory.saveWorkingMemory(projectId, userId, ['will be deleted']);
      await aiMemory.resetWorkingMemory(projectId, userId);
      const bullets = await aiMemory.getWorkingMemory(projectId, userId);
      expect(bullets).toEqual([]);
    });
  });

  // --- Long-Term Memory Items ---

  describe('Memory Items', () => {
    it('should add a project-scoped memory item', async () => {
      const item = await aiMemory.addMemoryItem(userId, {
        type: 'project_fact',
        content: 'The villain is a lich',
        projectId,
        source: 'ai-chat',
      });
      expect(item.id).toBeDefined();
      expect(item.type).toBe('project_fact');
      expect(item.content).toBe('The villain is a lich');
      expect(item.projectId).toBe(projectId);
    });

    it('should add a global memory item (no projectId)', async () => {
      const item = await aiMemory.addMemoryItem(userId, {
        type: 'preference',
        content: 'Prefers dark tone',
        projectId: null,
        source: 'explicit',
      });
      expect(item.projectId).toBeNull();
      expect(item.type).toBe('preference');
    });

    it('should get global + project items when projectId is specified', async () => {
      const items = await aiMemory.getMemoryItems(userId, projectId);
      const types = items.map((i) => i.type);
      expect(types).toContain('project_fact');
      expect(types).toContain('preference'); // global items included
    });

    it('should get only global items when no projectId', async () => {
      const items = await aiMemory.getMemoryItems(userId);
      expect(items.every((i) => i.projectId === null)).toBe(true);
    });

    it('should remove a memory item by id', async () => {
      const item = await aiMemory.addMemoryItem(userId, {
        type: 'decision',
        content: 'Will be deleted',
      });
      const removed = await aiMemory.removeMemoryItem(userId, item.id);
      expect(removed).toBe(true);

      // Verify it's gone
      const items = await aiMemory.getMemoryItems(userId, projectId);
      expect(items.find((i) => i.id === item.id)).toBeUndefined();
    });

    it('should return false when removing non-existent item', async () => {
      const removed = await aiMemory.removeMemoryItem(userId, '00000000-0000-0000-0000-000000000000');
      expect(removed).toBe(false);
    });

    it('should not remove items belonging to other users', async () => {
      const item = await aiMemory.addMemoryItem(userId, {
        type: 'project_fact',
        content: 'Owned by test user',
      });
      const removed = await aiMemory.removeMemoryItem('00000000-0000-0000-0000-000000000000', item.id);
      expect(removed).toBe(false);
    });
  });

  // --- Task Plan ---

  describe('Task Plan', () => {
    it('should return empty array for new project', async () => {
      const tasks = await aiMemory.getTaskPlan(projectId, userId);
      expect(tasks).toEqual([]);
    });

    it('should save and retrieve a task plan', async () => {
      const tasks = [
        { id: 't1', title: 'Design map', description: 'Create layout', status: 'pending' as const, dependsOn: [] },
        { id: 't2', title: 'Write encounters', description: '', status: 'done' as const, dependsOn: ['t1'] },
      ];
      await aiMemory.saveTaskPlan(projectId, userId, tasks);
      const retrieved = await aiMemory.getTaskPlan(projectId, userId);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].title).toBe('Design map');
      expect(retrieved[1].dependsOn).toEqual(['t1']);
    });

    it('should upsert on subsequent saves', async () => {
      await aiMemory.saveTaskPlan(projectId, userId, [
        { id: 't1', title: 'Only task', description: '', status: 'in_progress' as const, dependsOn: [] },
      ]);
      const tasks = await aiMemory.getTaskPlan(projectId, userId);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('in_progress');
    });

    it('should reset task plan', async () => {
      await aiMemory.saveTaskPlan(projectId, userId, [
        { id: 't1', title: 'Will be deleted', description: '', status: 'pending' as const, dependsOn: [] },
      ]);
      await aiMemory.resetTaskPlan(projectId, userId);
      const tasks = await aiMemory.getTaskPlan(projectId, userId);
      expect(tasks).toEqual([]);
    });
  });
});
