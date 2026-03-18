import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import {
  assembleDocuments,
  buildManifestDocuments,
} from '../../services/generation/assembler.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
vi.mock('../../services/generation/markdown-artifact-conversion.service.js', () => ({
  convertMarkdownToTipTapWithTimeout: vi.fn(async () => ({ type: 'doc', content: [{ type: 'paragraph' }] })),
}));

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'goblin-ambush',
      title: 'The Goblin Ambush',
      act: 1,
      sortOrder: 0,
      levelRange: { min: 1, max: 2 },
      targetPages: 10,
      summary: 'Goblins attack the party.',
      keyEntities: ['goblin-chief'],
      sections: [],
    },
    {
      slug: 'dark-forest',
      title: 'Into the Dark Forest',
      act: 1,
      sortOrder: 1,
      levelRange: { min: 2, max: 3 },
      targetPages: 12,
      summary: 'Party enters the forest.',
      keyEntities: [],
      sections: [],
    },
  ],
  appendices: [
    {
      slug: 'monster-index',
      title: 'Monster Index',
      targetPages: 5,
      sourceEntityTypes: ['npc'],
      summary: 'All monsters.',
    },
  ],
  totalPageEstimate: 27,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `asm-test-${Date.now()}@test.com`,
      displayName: `Asm Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Assembly Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Assembler — buildManifestDocuments', () => {
  it('orders chapters then appendices with correct kinds', () => {
    const keys = new Set([
      'chapter-draft-goblin-ambush',
      'chapter-draft-dark-forest',
      'appendix-draft-monster-index',
    ]);
    const docs = buildManifestDocuments(SAMPLE_OUTLINE, keys);

    expect(docs).toHaveLength(3);
    expect(docs[0].kind).toBe('chapter');
    expect(docs[0].documentSlug).toBe('goblin-ambush');
    expect(docs[0].sortOrder).toBe(0);
    expect(docs[1].kind).toBe('chapter');
    expect(docs[1].documentSlug).toBe('dark-forest');
    expect(docs[1].sortOrder).toBe(1);
    expect(docs[2].kind).toBe('appendix');
    expect(docs[2].documentSlug).toBe('monster-index');
    expect(docs[2].sortOrder).toBe(2);
  });

  it('includes front matter when present', () => {
    const keys = new Set(['front-matter', 'chapter-draft-goblin-ambush']);
    const docs = buildManifestDocuments(SAMPLE_OUTLINE, keys);

    expect(docs[0].kind).toBe('front_matter');
    expect(docs[0].documentSlug).toBe('front-matter');
    expect(docs[1].kind).toBe('chapter');
  });

  it('includes chapter even when draft key is missing', () => {
    const keys = new Set<string>();
    const docs = buildManifestDocuments(SAMPLE_OUTLINE, keys);

    // All chapters and appendices still appear
    expect(docs).toHaveLength(3);
    expect(docs[0].documentSlug).toBe('goblin-ambush');
  });
});

describe('Assembler — assembleDocuments', () => {
  it('creates manifest and ProjectDocuments from accepted artifacts', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test assembly',
    });

    // Create accepted outline artifact
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

    // Create accepted chapter draft
    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'chapter-draft-goblin-ambush',
        status: 'accepted',
        version: 1,
        title: 'The Goblin Ambush',
        tiptapContent: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
        jsonContent: { wordCount: 2500 } as any,
      },
    });

    const result = await assembleDocuments(run!);

    expect(result.manifestId).toBeDefined();
    // 2 chapters + 1 appendix = 3 documents
    expect(result.documentIds).toHaveLength(3);

    // Verify manifest
    const manifest = await prisma.assemblyManifest.findUnique({
      where: { id: result.manifestId },
    });
    expect(manifest).not.toBeNull();
    expect(manifest!.status).toBe('assembled');

    // Verify documents created
    const docs = await prisma.projectDocument.findMany({
      where: { runId: run!.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(docs).toHaveLength(3);
    expect(docs[0].kind).toBe('chapter');
    expect(docs[0].slug).toBe('goblin-ambush');
    expect(docs[0].sourceArtifactId).not.toBeNull();
    expect(docs[1].kind).toBe('chapter');
    expect(docs[1].slug).toBe('dark-forest');
  });

  it('replaces any existing project documents before assembling new ones', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'replace docs test',
    });

    await prisma.projectDocument.create({
      data: {
        projectId: run!.projectId,
        runId: null,
        kind: 'chapter',
        title: 'Old Draft',
        slug: 'old-draft',
        sortOrder: 0,
        content: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
        status: 'draft',
      },
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

    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'chapter-draft-goblin-ambush',
        status: 'accepted',
        version: 1,
        title: 'The Goblin Ambush',
        tiptapContent: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
        jsonContent: { wordCount: 2500 } as any,
      },
    });

    await assembleDocuments(run!);

    const docs = await prisma.projectDocument.findMany({
      where: { projectId: run!.projectId },
      orderBy: { sortOrder: 'asc' },
    });

    expect(docs.some((doc) => doc.slug === 'old-draft')).toBe(false);
    expect(docs).toHaveLength(3);
  });

  it('falls back to the latest non-accepted outline when needed', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'fallback outline test',
    });

    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'failed_evaluation',
        version: 2,
        title: 'Outline',
        jsonContent: SAMPLE_OUTLINE as any,
      },
    });

    await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'chapter-draft-goblin-ambush',
        status: 'accepted',
        version: 1,
        title: 'The Goblin Ambush',
        tiptapContent: { type: 'doc', content: [{ type: 'paragraph' }] } as any,
        jsonContent: { wordCount: 2500 } as any,
      },
    });

    const result = await assembleDocuments(run!);
    expect(result.documentIds).toHaveLength(3);
  });

  it('hydrates markdown-only chapter drafts during assembly', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'markdown hydrate test',
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

    const draft = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'chapter-draft-goblin-ambush',
        status: 'accepted',
        version: 1,
        title: 'The Goblin Ambush',
        markdownContent: '## The Goblin Ambush\n\nThis draft only has markdown.',
        tiptapContent: Prisma.DbNull,
        jsonContent: { wordCount: 2500 } as any,
      },
    });

    await assembleDocuments(run!);

    const hydrated = await prisma.generatedArtifact.findUniqueOrThrow({ where: { id: draft.id } });
    expect(hydrated.tiptapContent).not.toBeNull();
  });

  it('throws when no outline exists at all', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'no outline test',
    });

    await expect(assembleDocuments(run!)).rejects.toThrow(
      'No chapter outline found',
    );
  });
});
