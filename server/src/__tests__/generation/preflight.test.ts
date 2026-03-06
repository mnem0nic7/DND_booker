import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from 'vitest';
import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { runPreflight } from '../../services/generation/preflight.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'ch-one',
      title: 'Chapter One',
      act: 1,
      sortOrder: 0,
      levelRange: { min: 1, max: 2 },
      targetPages: 10,
      summary: 'First chapter.',
      keyEntities: [],
      sections: [],
    },
    {
      slug: 'ch-two',
      title: 'Chapter Two',
      act: 1,
      sortOrder: 1,
      levelRange: { min: 2, max: 3 },
      targetPages: 8,
      summary: 'Second chapter.',
      keyEntities: [],
      sections: [],
    },
  ],
  appendices: [],
  totalPageEstimate: 18,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `preflight-test-${Date.now()}@test.com`,
      displayName: `Preflight Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Preflight Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.projectDocument.deleteMany({ where: { projectId: testProject.id } });
  vi.clearAllMocks();
});

describe('Preflight Service', () => {
  it('returns error when no accepted outline exists', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'no outline',
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'NO_OUTLINE', severity: 'error' }),
    );
  });

  it('detects missing chapters', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'missing chapters',
    });

    // Create outline
    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'accepted',
        version: 1,
        title: 'Outline',
        jsonContent: SAMPLE_OUTLINE as any,
      },
    });

    // Create only one of the two expected documents
    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'ch-one',
        sortOrder: 0,
        content: {} as any,
      },
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_CHAPTER', documentSlug: 'ch-two' }),
    );
    expect(result.stats.chaptersExpected).toBe(2);
    expect(result.stats.chaptersFound).toBe(1);
  });

  it('passes when all chapters present', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'all present',
    });

    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'accepted',
        version: 1,
        title: 'Outline',
        jsonContent: SAMPLE_OUTLINE as any,
      },
    });

    // Create both documents with slugs matching the outline
    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'ch-one',
        sortOrder: 0,
        targetPageCount: 10,
        content: {} as any,
      },
    });
    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter Two',
        slug: 'ch-two',
        sortOrder: 1,
        targetPageCount: 8,
        content: {} as any,
      },
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(true);
    expect(result.stats.documentsCreated).toBe(2);
    expect(result.stats.chaptersFound).toBe(2);
    expect(result.stats.totalPageEstimate).toBe(18);
  });
});
