import { prisma } from '../../config/database.js';
import type { TaskStatus, TaskType } from '@dnd-booker/shared';
import { TASK_STATUS_TRANSITIONS } from '@dnd-booker/shared';

interface CreateTaskInput {
  runId: string;
  parentTaskId?: string;
  taskType: TaskType | string;
  artifactType?: string;
  artifactKey?: string;
  priority?: number;
  maxAttempts?: number;
  dependsOn?: string[];
  inputPayload?: unknown;
}

export async function createTask(input: CreateTaskInput) {
  const hasDeps = input.dependsOn && input.dependsOn.length > 0;

  return prisma.generationTask.create({
    data: {
      runId: input.runId,
      parentTaskId: input.parentTaskId ?? null,
      taskType: input.taskType,
      artifactType: input.artifactType ?? null,
      artifactKey: input.artifactKey ?? null,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 2,
      dependsOn: input.dependsOn ?? [],
      inputPayload: input.inputPayload ?? undefined,
      status: hasDeps ? 'blocked' : 'queued',
    },
  });
}

export async function getTask(taskId: string) {
  return prisma.generationTask.findUnique({ where: { id: taskId } });
}

export async function listTasksForRun(runId: string) {
  return prisma.generationTask.findMany({
    where: { runId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function transitionTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
  errorMessage?: string,
) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) return null;

  const allowed = TASK_STATUS_TRANSITIONS[task.status as TaskStatus];
  if (!allowed || !allowed.includes(newStatus)) return null;

  const now = new Date();
  const data: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'running' && !task.startedAt) {
    data.startedAt = now;
  }

  if (newStatus === 'completed' || newStatus === 'failed') {
    data.completedAt = now;
  }

  if (newStatus === 'failed' && errorMessage) {
    data.errorMessage = errorMessage;
  }

  if (task.status === 'failed' && newStatus === 'queued') {
    data.attemptCount = task.attemptCount + 1;
    data.startedAt = null;
    data.completedAt = null;
  }

  return prisma.generationTask.update({
    where: { id: taskId },
    data,
  });
}

export async function getReadyTasks(runId: string) {
  const allTasks = await prisma.generationTask.findMany({ where: { runId } });

  const completedIds = new Set(
    allTasks.filter((t) => t.status === 'completed').map((t) => t.id),
  );

  const ready: typeof allTasks = [];

  for (const task of allTasks) {
    if (task.status === 'queued') {
      ready.push(task);
      continue;
    }

    if (task.status === 'blocked') {
      const deps = task.dependsOn as string[];
      const allDepsComplete = deps.length > 0 && deps.every((id) => completedIds.has(id));
      if (allDepsComplete) {
        const unblocked = await prisma.generationTask.update({
          where: { id: task.id },
          data: { status: 'queued' },
        });
        ready.push(unblocked);
      }
    }
  }

  return ready;
}
