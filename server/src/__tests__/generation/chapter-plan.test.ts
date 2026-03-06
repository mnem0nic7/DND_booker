import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeChapterPlanGeneration } from '../../services/generation/chapter-plan.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'The Goblin Caves', summary: 'Adventure.', premise: 'Clear caves.',
  worldRules: {
    setting: 'Fantasy', era: 'Medieval', magicLevel: 'standard',
    technologyLevel: 'medieval', toneDescriptors: ['classic'],
    forbiddenElements: [], worldSpecificRules: [],
  },
  actStructure: [{ act: 1, title: 'Act 1', summary: 'Begin.', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1'] }],
  timeline: [], levelProgression: null,
  pageBudget: [{ slug: 'ch-1', title: 'Chapter 1', targetPages: 5, sections: ['Arrival', 'Fight'] }],
  styleGuide: { voice: 'Adventurous', vocabulary: [], avoidTerms: [], narrativePerspective: 'second person', toneNotes: '' },
  openThreads: [],
  entities: [
    { entityType: 'npc', name: 'Chief Gnarltooth', slug: 'chief-gnarltooth', summary: 'Goblin chief.', details: {} },
  ],
};

const SAMPLE_CHAPTER: ChapterOutlineEntry = {
  slug: 'ch-1', title: 'Chapter 1: The Village', act: 1, sortOrder: 1,
  levelRange: { min: 3, max: 3 }, targetPages: 5, summary: 'Arrive and explore.',
  keyEntities: ['chief-gnarltooth'],
  sections: [
    { slug: 'arrival', title: 'Arrival', sortOrder: 1, targetPages: 2, contentType: 'narrative', summary: 'PCs arrive.' },
    { slug: 'ambush', title: 'Goblin Ambush', sortOrder: 2, targetPages: 3, contentType: 'encounter', summary: 'Surprise attack.' },
  ],
};

const VALID_PLAN: ChapterPlan = {
  chapterSlug: 'ch-1',
  chapterTitle: 'Chapter 1: The Village',
  sections: [
    {
      slug: 'arrival', title: 'Arrival', contentType: 'narrative', targetWords: 800,
      outline: 'The party arrives at the village and sees signs of recent goblin attacks.',
      keyBeats: ['PCs arrive', 'See damaged buildings', 'Meet villagers'],
      entityReferences: ['chief-gnarltooth'],
      blocksNeeded: ['readAloud', 'dmTips'],
    },
    {
      slug: 'ambush', title: 'Goblin Ambush', contentType: 'encounter', targetWords: 1200,
      outline: 'Goblins ambush the party at the village outskirts.',
      keyBeats: ['Goblins attack from cover', 'Villagers flee', 'Chief watches from afar'],
      entityReferences: ['chief-gnarltooth'],
      blocksNeeded: ['readAloud', 'encounterTable', 'statBlock'],
    },
  ],
  encounters: [
    {
      name: 'Goblin Ambush',
      difficulty: 'medium',
      enemies: [{ name: 'Goblin', count: 6, cr: '1/4' }],
      environment: 'Village outskirts, scattered barricades',
      tactics: 'Goblins use hit-and-run from cover.',
      rewards: ['15 gp', 'Crude cave map'],
    },
  ],
  entityReferences: ['chief-gnarltooth'],
  readAloudCount: 2,
  dmTipCount: 1,
  difficultyProgression: 'Starts with peaceful exploration, escalates to medium combat.',
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `chplan-test-${Date.now()}@test.com`,
      displayName: `ChPlan Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'ChPlan Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => { vi.clearAllMocks(); });

describe('Chapter Plan Service — executeChapterPlanGeneration', () => {
  it('should create a chapter_plan artifact from valid AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_PLAN),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map(e => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    expect(result.plan.chapterSlug).toBe('ch-1');
    expect(result.plan.sections.length).toBe(2);
    expect(result.plan.encounters.length).toBe(1);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'chapter_plan' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.artifactKey).toBe('chapter-plan-ch-1');
    expect(artifact!.tokenCount).toBe(2500);
  });

  it('should include chapter and entity context in the prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_PLAN),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map(e => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('ch-1');
    expect(call.prompt).toContain('chief-gnarltooth');
    expect(call.prompt).toContain('Arrival');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_PLAN),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map(e => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    const updated = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updated!.actualTokens).toBe(2500);
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'not json', usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await expect(
      executeChapterPlanGeneration(
        run!, SAMPLE_CHAPTER, SAMPLE_BIBLE, [], {} as any, 8192,
      ),
    ).rejects.toThrow();
  });

  it('should generate unique artifact keys per chapter', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ ...VALID_PLAN, chapterSlug: 'ch-2', chapterTitle: 'Chapter 2' }),
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const ch2 = { ...SAMPLE_CHAPTER, slug: 'ch-2', title: 'Chapter 2', sortOrder: 2 };
    const result = await executeChapterPlanGeneration(
      run!, ch2, SAMPLE_BIBLE, [], {} as any, 8192,
    );

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'chapter_plan' },
    });
    expect(artifact!.artifactKey).toBe('chapter-plan-ch-2');
  });
});
