import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { generateObjectWithTimeout } from '../../services/generation/model-timeouts.js';
import { executeChapterPlanGeneration } from '../../services/generation/chapter-plan.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('../../services/generation/model-timeouts.js', () => ({
  generateObjectWithTimeout: vi.fn(),
}));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateObjectWithTimeout = vi.mocked(generateObjectWithTimeout);

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
      scenePurpose: 'Introduce the village in a playable, table-facing way.',
      playerObjective: 'Learn what happened and decide whom to trust.',
      decisionPoint: 'Choose whether to investigate the damage, talk to witnesses, or fortify the village.',
      consequenceSummary: 'The first lead and first ally shape how prepared the party is for the ambush.',
      keyBeats: ['PCs arrive', 'See damaged buildings', 'Meet villagers'],
      entityReferences: ['chief-gnarltooth'],
      blocksNeeded: ['readAloud', 'dmTips'],
    },
    {
      slug: 'ambush', title: 'Goblin Ambush', contentType: 'encounter', targetWords: 1200,
      outline: 'Goblins ambush the party at the village outskirts.',
      scenePurpose: 'Deliver the chapter combat set piece and reveal goblin tactics.',
      playerObjective: 'Survive the ambush and secure the goblins’ trail or clues.',
      decisionPoint: 'Choose whether to hold ground, protect villagers, or chase the retreating goblins.',
      consequenceSummary: 'The outcome affects available clues, allied morale, and the next route forward.',
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
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_PLAN,
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
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_PLAN,
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

    const call = mockGenerateObjectWithTimeout.mock.calls[0][1];
    expect(call.prompt).toContain('ch-1');
    expect(call.prompt).toContain('chief-gnarltooth');
    expect(call.prompt).toContain('Arrival');
  });

  it('should update run token count', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_PLAN,
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

  it('should normalize weak plans into table-usable chapter structure', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: {
        chapterSlug: 'ch-1',
        chapterTitle: 'Chapter 1: The Village',
        sections: [
          {
            slug: 'arrival',
            title: 'Arrival',
            contentType: 'narrative',
            targetWords: 1400,
            outline: 'The party reaches the village.',
            keyBeats: ['PCs arrive'],
            entityReferences: ['chief-gnarltooth'],
            blocksNeeded: [],
          },
          {
            slug: 'ambush',
            title: 'Goblin Ambush',
            contentType: 'encounter',
            targetWords: 200,
            outline: 'Goblins strike from cover.',
            keyBeats: ['combat starts'],
            entityReferences: ['chief-gnarltooth'],
            blocksNeeded: ['readAloud'],
          },
        ],
        encounters: VALID_PLAN.encounters,
        entityReferences: ['chief-gnarltooth'],
        readAloudCount: 0,
        dmTipCount: 0,
        difficultyProgression: '',
      },
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

    expect(result.plan.sections[0].targetWords).toBeLessThanOrEqual(1900);
    expect(result.plan.sections[0].blocksNeeded).toContain('readAloud');
    expect(result.plan.sections[0].blocksNeeded).toContain('dmTips');
    expect(result.plan.sections[0].blocksNeeded).toContain('handout');
    expect(result.plan.sections[0].scenePurpose).toBeTruthy();
    expect(result.plan.sections[0].playerObjective).toBeTruthy();
    expect(result.plan.sections[0].decisionPoint).toBeTruthy();
    expect(result.plan.sections[0].consequenceSummary).toBeTruthy();
    expect(result.plan.sections[0].blocksNeeded.length).toBeGreaterThanOrEqual(4);
    expect(result.plan.sections[0].keyBeats.length).toBeGreaterThanOrEqual(6);
    expect(result.plan.sections[1].targetWords).toBeGreaterThanOrEqual(1500);
    expect(result.plan.sections[1].blocksNeeded).toContain('encounterTable');
    expect(result.plan.sections[1].blocksNeeded).toContain('statBlock');
    expect(result.plan.sections[1].blocksNeeded).toContain('dmTips');
    expect(result.plan.sections[1].blocksNeeded.length).toBeGreaterThanOrEqual(5);
    expect(result.plan.sections[1].keyBeats.length).toBeGreaterThanOrEqual(6);
    expect(result.plan.readAloudCount).toBeGreaterThanOrEqual(2);
    expect(result.plan.dmTipCount).toBeGreaterThanOrEqual(1);
    expect(result.plan.difficultyProgression).toBeTruthy();
  });

  it('adds deterministic utility fallbacks for exploration and social sections', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: {
        chapterSlug: 'ch-1',
        chapterTitle: 'Chapter 1: The Village',
        sections: [
          {
            slug: 'arrival',
            title: 'Arrival',
            contentType: 'exploration',
            targetWords: 700,
            outline: 'The party surveys the mine entrance.',
            keyBeats: ['Choose a route'],
            entityReferences: ['chief-gnarltooth'],
            blocksNeeded: [],
          },
          {
            slug: 'ambush',
            title: 'Goblin Ambush',
            contentType: 'social',
            targetWords: 500,
            outline: 'The mayor bargains for help.',
            keyBeats: ['Hear the mayor out'],
            entityReferences: ['chief-gnarltooth'],
            blocksNeeded: [],
          },
        ],
        encounters: [],
        entityReferences: ['chief-gnarltooth'],
        readAloudCount: 0,
        dmTipCount: 0,
        difficultyProgression: '',
      },
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

    expect(result.plan.sections[0].blocksNeeded).toEqual(
      expect.arrayContaining(['readAloud', 'randomTable', 'encounterTable', 'handout', 'dmTips']),
    );
    expect(result.plan.sections[1].blocksNeeded).toEqual(
      expect.arrayContaining(['readAloud', 'npcProfile', 'dmTips']),
    );
  });

  it('backfills missing required section titles from the outline before validation', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: {
        chapterSlug: 'ch-1',
        chapterTitle: 'Chapter 1: The Village',
        sections: [
          {
            slug: 'arrival',
            contentType: 'narrative',
            targetWords: 1500,
            outline: 'The party reaches the village.',
            keyBeats: ['PCs arrive'],
            entityReferences: ['chief-gnarltooth'],
            blocksNeeded: ['readAloud'],
          },
          {
            slug: 'ambush',
            contentType: 'encounter',
            targetWords: 1700,
            outline: 'Goblins strike from cover.',
            keyBeats: ['combat starts'],
            entityReferences: ['chief-gnarltooth'],
            blocksNeeded: ['encounterTable', 'statBlock'],
          },
        ],
        encounters: VALID_PLAN.encounters,
      },
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

    expect(result.plan.sections[0].title).toBe('Arrival');
    expect(result.plan.sections[1].title).toBe('Goblin Ambush');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateObjectWithTimeout.mockRejectedValueOnce(new Error('Structured chapter plan generation failed'));

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
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: { ...VALID_PLAN, chapterSlug: 'ch-2', chapterTitle: 'Chapter 2' },
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

  it('should coerce sloppy pipe-delimited section contentType values from the model', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: {
        ...VALID_PLAN,
        sections: [
          {
            ...VALID_PLAN.sections[0],
            contentType: 'narrative | social | transition',
          },
          {
            ...VALID_PLAN.sections[1],
            contentType: 'encounter / exploration',
          },
        ],
      },
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

    expect(result.plan.sections[0].contentType).toBe('narrative');
    expect(result.plan.sections[1].contentType).toBe('encounter');
  });

  it('coerces numeric encounter CR values into strings', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: {
        ...VALID_PLAN,
        encounters: [
          {
            ...VALID_PLAN.encounters[0],
            enemies: [{ name: 'Goblin', count: 6, cr: 0.25 }],
          },
        ],
      },
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

    expect(result.plan.encounters[0].enemies[0].cr).toBe('0.25');
  });

  it('defaults missing plan arrays instead of failing generation', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: {
        chapterSlug: 'ch-1',
        chapterTitle: 'Chapter 1: The Village',
        sections: [
          {
            slug: 'arrival',
            title: 'Arrival',
            contentType: 'narrative',
            targetWords: 800,
            outline: 'The party arrives in the village.',
            keyBeats: ['Arrive at dusk'],
            blocksNeeded: ['readAloud'],
          },
        ],
      },
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

    expect(result.plan.encounters).toEqual([]);
    expect(result.plan.entityReferences).toEqual([]);
    expect(result.plan.sections[0].entityReferences).toEqual([]);
  });

  it('reuses the persisted chapter plan on replay', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_PLAN,
      usage: { inputTokens: 1000, outputTokens: 1500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const first = await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map((e) => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );
    const second = await executeChapterPlanGeneration(
      run!, SAMPLE_CHAPTER, SAMPLE_BIBLE,
      SAMPLE_BIBLE.entities.map((e) => ({ slug: e.slug, entityType: e.entityType, name: e.name, summary: e.summary })),
      {} as any, 8192,
    );

    expect(second.artifactId).toBe(first.artifactId);
    expect(second.plan.sections).toHaveLength(first.plan.sections.length);
    expect(mockGenerateObjectWithTimeout).toHaveBeenCalledTimes(1);

    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId: run!.id, artifactType: 'chapter_plan' },
    });
    expect(artifacts).toHaveLength(1);
  });
});
