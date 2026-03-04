import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../services/ai-tools/types.js';

const mockPrisma = vi.hoisted(() => ({
  project: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  template: {
    findUnique: vi.fn(),
  },
}));

vi.mock('../../config/database.js', () => ({
  prisma: mockPrisma,
}));

import { listProjects } from '../../services/ai-tools/crud/list-projects.js';
import { getProject } from '../../services/ai-tools/crud/get-project.js';
import { getProjectContent } from '../../services/ai-tools/crud/get-project-content.js';
import { createProject } from '../../services/ai-tools/crud/create-project.js';
import { updateProject } from '../../services/ai-tools/crud/update-project.js';
import { deleteProject } from '../../services/ai-tools/crud/delete-project.js';
import { updateProjectContent } from '../../services/ai-tools/crud/update-project-content.js';

const ctx: ToolContext = { userId: 'user-1', projectId: 'proj-1', requestId: 'req-1' };
const NOW = new Date('2026-03-04T12:00:00.000Z');

describe('CRUD Read Tools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listProjects returns user projects', async () => {
    const projects = [
      { id: 'p1', title: 'Campaign A', type: 'campaign', status: 'draft', updatedAt: NOW },
    ];
    mockPrisma.project.findMany.mockResolvedValue(projects);

    const result = await listProjects.execute({}, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(projects);
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('getProject returns project metadata', async () => {
    const project = { id: 'p1', title: 'My Campaign', updatedAt: NOW };
    mockPrisma.project.findFirst.mockResolvedValue(project);

    const result = await getProject.execute({ projectId: 'p1' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(project);
  });

  it('getProject returns NOT_FOUND for missing project', async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const result = await getProject.execute({ projectId: 'missing' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('getProjectContent returns content and updatedAt', async () => {
    const project = {
      id: 'p1',
      content: { type: 'doc', content: [] },
      updatedAt: NOW,
    };
    mockPrisma.project.findFirst.mockResolvedValue(project);

    const result = await getProjectContent.execute({ projectId: 'p1' }, ctx);
    expect(result.success).toBe(true);
    expect((result.data as any).updatedAt).toBe('2026-03-04T12:00:00.000Z');
  });
});

describe('CRUD Write Tools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createProject creates with defaults', async () => {
    mockPrisma.project.create.mockResolvedValue({
      id: 'new-1', title: 'New Campaign', type: 'campaign', updatedAt: NOW,
    });

    const result = await createProject.execute({ title: 'New Campaign' }, ctx);
    expect(result.success).toBe(true);
    expect((result.data as any).id).toBe('new-1');
  });

  it('createProject uses template content when templateId given', async () => {
    mockPrisma.template.findUnique.mockResolvedValue({
      id: 'tmpl-1', type: 'one_shot', content: { type: 'doc', content: [{ type: 'heading' }] },
    });
    mockPrisma.project.create.mockResolvedValue({
      id: 'new-2', title: 'From Template', type: 'one_shot', updatedAt: NOW,
    });

    const result = await createProject.execute({
      title: 'From Template', templateId: 'tmpl-1',
    }, ctx);
    expect(result.success).toBe(true);
    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: { type: 'doc', content: [{ type: 'heading' }] },
        }),
      }),
    );
  });

  it('updateProject succeeds with matching timestamp', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'p1', updatedAt: NOW });
    const newTime = new Date('2026-03-04T12:01:00.000Z');
    mockPrisma.project.update.mockResolvedValue({ id: 'p1', updatedAt: newTime });

    const result = await updateProject.execute({
      projectId: 'p1',
      expectedUpdatedAt: NOW.toISOString(),
      title: 'Updated Title',
    }, ctx);
    expect(result.success).toBe(true);
  });

  it('updateProject returns CONFLICT on stale timestamp', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({
      id: 'p1', updatedAt: new Date('2026-03-04T12:05:00.000Z'),
    });

    const result = await updateProject.execute({
      projectId: 'p1',
      expectedUpdatedAt: NOW.toISOString(),
      title: 'Stale Update',
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });

  it('deleteProject succeeds with matching timestamp', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'p1', updatedAt: NOW });
    mockPrisma.project.delete.mockResolvedValue({ id: 'p1' });

    const result = await deleteProject.execute({
      projectId: 'p1',
      expectedUpdatedAt: NOW.toISOString(),
    }, ctx);
    expect(result.success).toBe(true);
    expect((result.data as any).deleted).toBe(true);
  });

  it('deleteProject returns NOT_FOUND for wrong user', async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null);

    const result = await deleteProject.execute({
      projectId: 'p1',
      expectedUpdatedAt: NOW.toISOString(),
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('updateProjectContent enforces concurrency', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({
      id: 'p1', updatedAt: new Date('2026-03-04T12:10:00.000Z'),
    });

    const result = await updateProjectContent.execute({
      projectId: 'p1',
      expectedUpdatedAt: NOW.toISOString(),
      content: { type: 'doc', content: [] },
    }, ctx);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('CONFLICT');
  });

  it('updateProjectContent succeeds with fresh timestamp', async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: 'p1', updatedAt: NOW });
    const newTime = new Date('2026-03-04T12:01:00.000Z');
    mockPrisma.project.update.mockResolvedValue({ id: 'p1', updatedAt: newTime });

    const result = await updateProjectContent.execute({
      projectId: 'p1',
      expectedUpdatedAt: NOW.toISOString(),
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    }, ctx);
    expect(result.success).toBe(true);
  });
});
