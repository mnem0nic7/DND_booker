import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import {
  createRun,
  getRun,
  listRuns,
  transitionRunStatus,
} from '../../services/generation/run.service.js';

const TEST_USER = {
  email: 'gen-run-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Gen Run Test',
};

let userId: string;
let projectId: string;

describe('GenerationRun Service', () => {
  beforeAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(TEST_USER.password, 4);
    const user = await prisma.user.create({
      data: { email: TEST_USER.email, passwordHash: hash, displayName: TEST_USER.displayName },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: { userId, title: 'Gen Test Project', type: 'one_shot' },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('createRun', () => {
    it('should create a run with defaults', async () => {
      const run = await createRun({
        projectId,
        userId,
        prompt: 'A goblin cave one-shot for level 4 characters',
      });

      expect(run).not.toBeNull();
      expect(run!.id).toBeDefined();
      expect(run!.status).toBe('queued');
      expect(run!.mode).toBe('one_shot');
      expect(run!.quality).toBe('quick');
      expect(run!.inputPrompt).toBe('A goblin cave one-shot for level 4 characters');
      expect(run!.progressPercent).toBe(0);
      expect(run!.actualTokens).toBe(0);
      expect(run!.actualCost).toBe(0);
    });

    it('should create a run with explicit mode and quality', async () => {
      const run = await createRun({
        projectId,
        userId,
        prompt: 'Gothic horror campaign',
        mode: 'campaign',
        quality: 'polished',
        pageTarget: 120,
        constraints: { tone: 'gothic horror', levelRange: '3-10' },
      });

      expect(run).not.toBeNull();
      expect(run!.mode).toBe('campaign');
      expect(run!.quality).toBe('polished');
      expect(run!.estimatedPages).toBe(120);
      expect(run!.inputParameters).toEqual({ tone: 'gothic horror', levelRange: '3-10' });
    });

    it('should reject creation for a project the user does not own', async () => {
      const result = await createRun({
        projectId,
        userId: '00000000-0000-0000-0000-000000000000',
        prompt: 'Should fail',
      });
      expect(result).toBeNull();
    });
  });

  describe('getRun', () => {
    it('should return a run by id for the owning user', async () => {
      const created = await createRun({ projectId, userId, prompt: 'Get test' });
      const fetched = await getRun(created!.id, userId);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created!.id);
    });

    it('should return null for another user', async () => {
      const created = await createRun({ projectId, userId, prompt: 'Ownership test' });
      const fetched = await getRun(created!.id, '00000000-0000-0000-0000-000000000000');
      expect(fetched).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('should list runs for a project', async () => {
      const runs = await listRuns(projectId, userId);
      expect(runs).not.toBeNull();
      expect(Array.isArray(runs)).toBe(true);
      expect(runs!.length).toBeGreaterThan(0);
    });

    it('should return null if user does not own the project', async () => {
      const runs = await listRuns(projectId, '00000000-0000-0000-0000-000000000000');
      expect(runs).toBeNull();
    });
  });

  describe('transitionRunStatus', () => {
    it('should allow queued → planning', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Transition test' });
      const updated = await transitionRunStatus(run!.id, userId, 'planning');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('planning');
      expect(updated!.startedAt).not.toBeNull();
    });

    it('should allow planning → paused', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Pause test' });
      await transitionRunStatus(run!.id, userId, 'planning');
      const updated = await transitionRunStatus(run!.id, userId, 'paused');
      expect(updated!.status).toBe('paused');
    });

    it('should reject invalid transitions (queued → completed)', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Invalid transition' });
      const result = await transitionRunStatus(run!.id, userId, 'completed');
      expect(result).toBeNull();
    });

    it('should set completedAt when reaching completed', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Complete test' });
      await transitionRunStatus(run!.id, userId, 'planning');
      await transitionRunStatus(run!.id, userId, 'generating_assets');
      await transitionRunStatus(run!.id, userId, 'generating_prose');
      await transitionRunStatus(run!.id, userId, 'assembling');
      const completed = await transitionRunStatus(run!.id, userId, 'completed');
      expect(completed!.status).toBe('completed');
      expect(completed!.completedAt).not.toBeNull();
      expect(completed!.currentStage).toBeNull();
      expect(completed!.progressPercent).toBe(100);
    });

    it('should set failureReason when reaching failed', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Fail test' });
      const failed = await transitionRunStatus(run!.id, userId, 'failed', 'Provider returned 500');
      expect(failed!.status).toBe('failed');
      expect(failed!.failureReason).toBe('Provider returned 500');
      expect(failed!.currentStage).toBeNull();
    });
  });
});
