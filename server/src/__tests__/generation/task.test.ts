import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { createRun } from '../../services/generation/run.service.js';
import {
  createTask,
  getTask,
  listTasksForRun,
  transitionTaskStatus,
  getReadyTasks,
} from '../../services/generation/task.service.js';

const TEST_USER = {
  email: 'gen-task-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Gen Task Test',
};

let userId: string;
let projectId: string;
let runId: string;

describe('GenerationTask Service', () => {
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
      data: { userId, title: 'Task Test Project', type: 'one_shot' },
    });
    projectId = project.id;

    const run = await createRun({ projectId, userId, prompt: 'Task test run' });
    runId = run!.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('createTask', () => {
    it('should create a task with defaults', async () => {
      const task = await createTask({
        runId,
        taskType: 'normalize_input',
      });

      expect(task.id).toBeDefined();
      expect(task.runId).toBe(runId);
      expect(task.taskType).toBe('normalize_input');
      expect(task.status).toBe('queued');
      expect(task.attemptCount).toBe(0);
      expect(task.maxAttempts).toBe(2);
      expect(task.dependsOn).toEqual([]);
    });

    it('should create a task with dependencies', async () => {
      const parentTask = await createTask({ runId, taskType: 'generate_campaign_bible' });
      const childTask = await createTask({
        runId,
        taskType: 'generate_chapter_outline',
        dependsOn: [parentTask.id],
      });

      expect(childTask.dependsOn).toEqual([parentTask.id]);
      expect(childTask.status).toBe('blocked');
    });
  });

  describe('getTask', () => {
    it('should return a task by id', async () => {
      const created = await createTask({ runId, taskType: 'normalize_input' });
      const fetched = await getTask(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });
  });

  describe('listTasksForRun', () => {
    it('should list all tasks for a run', async () => {
      const tasks = await listTasksForRun(runId);
      expect(tasks.length).toBeGreaterThan(0);
    });
  });

  describe('transitionTaskStatus', () => {
    it('should allow queued → running', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input' });
      const updated = await transitionTaskStatus(task.id, 'running');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('running');
      expect(updated!.startedAt).not.toBeNull();
    });

    it('should allow running → completed', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input' });
      await transitionTaskStatus(task.id, 'running');
      const updated = await transitionTaskStatus(task.id, 'completed');
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).not.toBeNull();
    });

    it('should increment attemptCount on running → failed → queued retry', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input', maxAttempts: 3 });
      await transitionTaskStatus(task.id, 'running');
      const failed = await transitionTaskStatus(task.id, 'failed', 'Provider timeout');
      expect(failed!.status).toBe('failed');
      expect(failed!.errorMessage).toBe('Provider timeout');

      const retried = await transitionTaskStatus(task.id, 'queued');
      expect(retried!.status).toBe('queued');
      expect(retried!.attemptCount).toBe(1);
    });

    it('should reject invalid transitions', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input' });
      const result = await transitionTaskStatus(task.id, 'completed');
      expect(result).toBeNull();
    });
  });

  describe('getReadyTasks', () => {
    it('should return queued tasks with no dependencies', async () => {
      const freshRun = await createRun({ projectId, userId, prompt: 'Ready tasks test' });
      const task = await createTask({ runId: freshRun!.id, taskType: 'normalize_input' });

      const ready = await getReadyTasks(freshRun!.id);
      expect(ready.some((t) => t.id === task.id)).toBe(true);
    });

    it('should not return blocked tasks whose deps are incomplete', async () => {
      const freshRun = await createRun({ projectId, userId, prompt: 'Blocked test' });
      const parent = await createTask({ runId: freshRun!.id, taskType: 'normalize_input' });
      const child = await createTask({
        runId: freshRun!.id,
        taskType: 'generate_campaign_bible',
        dependsOn: [parent.id],
      });

      const ready = await getReadyTasks(freshRun!.id);
      expect(ready.some((t) => t.id === child.id)).toBe(false);
      expect(ready.some((t) => t.id === parent.id)).toBe(true);
    });

    it('should unblock tasks whose deps are all completed', async () => {
      const freshRun = await createRun({ projectId, userId, prompt: 'Unblock test' });
      const parent = await createTask({ runId: freshRun!.id, taskType: 'normalize_input' });
      const child = await createTask({
        runId: freshRun!.id,
        taskType: 'generate_campaign_bible',
        dependsOn: [parent.id],
      });

      await transitionTaskStatus(parent.id, 'running');
      await transitionTaskStatus(parent.id, 'completed');

      const ready = await getReadyTasks(freshRun!.id);
      expect(ready.some((t) => t.id === child.id)).toBe(true);
    });
  });
});
