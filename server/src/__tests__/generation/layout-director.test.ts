import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../config/database.js';
import { createRun } from '../../services/generation/run.service.js';
import { executeLayoutDirectorPass } from '../../services/generation/layout-director.service.js';

vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));

let userId = '';
let projectId = '';

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      email: `layout-director-${Date.now()}@test.local`,
      displayName: 'Layout Director Test',
      passwordHash: 'test-hash',
    },
  });
  userId = user.id;

  const project = await prisma.project.create({
    data: {
      title: 'Layout Director Replay',
      userId,
    },
  });
  projectId = project.id;
});

afterAll(async () => {
  if (projectId) {
    await prisma.project.deleteMany({ where: { id: projectId } });
  }
  if (userId) {
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

describe('Layout Director replay safety', () => {
  it('reuses the layout plan artifact on replay instead of inserting version 1 twice', async () => {
    const run = await createRun({
      projectId,
      userId,
      prompt: 'Replay-safe layout test',
    });

    expect(run).not.toBeNull();

    await prisma.projectDocument.create({
      data: {
        projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter 1',
        slug: `chapter-1-${Date.now()}`,
        sortOrder: 0,
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Chapter 1' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'A short scene for replay-safe layout planning.' }],
            },
          ],
        } as any,
      },
    });

    const first = await executeLayoutDirectorPass({ id: run!.id, projectId });
    const second = await executeLayoutDirectorPass({ id: run!.id, projectId });

    const artifacts = await prisma.generatedArtifact.findMany({
      where: {
        runId: run!.id,
        artifactType: 'layout_plan',
        artifactKey: 'layout-plan',
      },
      orderBy: [{ version: 'asc' }, { createdAt: 'asc' }],
    });

    expect(first.artifactId).toBeDefined();
    expect(second.artifactId).toBe(first.artifactId);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].version).toBe(1);
  });
});
