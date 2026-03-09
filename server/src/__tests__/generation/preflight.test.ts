import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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
  if (!testUser) return;
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

afterEach(async () => {
  if (!testProject) return;
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
    expect(result.stats.layoutDocumentsAnalyzed).toBe(0);

    const report = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'preflight_report' },
      orderBy: { version: 'desc' },
    });
    expect(report?.status).toBe('failed_evaluation');
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
    expect(result.stats.layoutDocumentsAnalyzed).toBe(0);
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
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Chapter One' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'The first chapter opens cleanly.' }],
            },
          ],
        } as any,
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
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Chapter Two' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'The second chapter follows.' }],
            },
          ],
        } as any,
      },
    });

    const result = await runPreflight(run!);

    expect(result.passed).toBe(true);
    expect(result.stats.documentsCreated).toBe(2);
    expect(result.stats.chaptersFound).toBe(2);
    expect(result.stats.totalPageEstimate).toBe(18);
    expect(result.stats.layoutDocumentsAnalyzed).toBe(2);
    expect(result.stats.bookStructureDocumentsAnalyzed).toBe(2);

    const report = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'preflight_report' },
      orderBy: { version: 'desc' },
    });
    expect(report?.status).toBe('accepted');
  });

  it('fails preflight on blocking compiled layout issues', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'layout failure',
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

    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'ch-one',
        sortOrder: 0,
        targetPageCount: 10,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'A tense scene unfolds. '.repeat(80) }],
            },
            { type: 'pageBreak' },
            { type: 'pageBreak' },
          ],
        } as any,
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

    expect(result.passed).toBe(false);
    expect(result.stats.layoutDocumentsAnalyzed).toBe(1);
    expect(result.stats.bookStructureDocumentsAnalyzed).toBe(2);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'LAYOUT_CONSECUTIVE_PAGE_BREAKS',
        severity: 'error',
        documentSlug: 'ch-one',
      }),
    );

    const report = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'preflight_report' },
      orderBy: { version: 'desc' },
    });
    expect(report?.status).toBe('failed_evaluation');
  });

  it('keeps mid-page chapter headings as warnings', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'layout warning',
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

    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'ch-one',
        sortOrder: 0,
        targetPageCount: 10,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'An extended setup scene. '.repeat(120) }],
            },
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Chapter One' }],
            },
          ],
        } as any,
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
    expect(result.stats.layoutDocumentsAnalyzed).toBe(1);
    expect(result.stats.bookStructureDocumentsAnalyzed).toBe(2);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'LAYOUT_CHAPTER_HEADING_MID_PAGE',
        severity: 'warning',
        documentSlug: 'ch-one',
      }),
    );
  });
});
