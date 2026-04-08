import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeOutlineGeneration } from '../../services/generation/outline.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'The Goblin Caves',
  summary: 'A one-shot goblin adventure.',
  premise: 'Clear the goblin caves.',
  worldRules: {
    setting: 'Fantasy', era: 'Medieval', magicLevel: 'standard',
    technologyLevel: 'medieval', toneDescriptors: ['classic'],
    forbiddenElements: [], worldSpecificRules: [],
  },
  actStructure: [
    { act: 1, title: 'The Village', summary: 'Arrive and learn.', levelRange: { min: 3, max: 3 }, chapterSlugs: ['ch-1'] },
    { act: 2, title: 'The Caves', summary: 'Explore and fight.', levelRange: { min: 4, max: 5 }, chapterSlugs: ['ch-2', 'ch-3'] },
  ],
  timeline: [{ order: 1, event: 'Goblins arrive', timeframe: '1 month ago', significance: 'Origin' }],
  levelProgression: { type: 'milestone', milestones: ['Level 4 after ch-1'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: The Village', targetPages: 3, sections: ['Arrival', 'The Elder'] },
    { slug: 'ch-2', title: 'Chapter 2: Upper Caves', targetPages: 5, sections: ['Entry', 'Traps', 'Patrol'] },
    { slug: 'ch-3', title: 'Chapter 3: Throne Room', targetPages: 4, sections: ['Approach', 'Boss Fight'] },
  ],
  styleGuide: {
    voice: 'Adventurous', vocabulary: [], avoidTerms: [],
    narrativePerspective: 'second person', toneNotes: '',
  },
  openThreads: [],
  entities: [
    { entityType: 'npc', name: 'Chief Gnarltooth', slug: 'chief-gnarltooth', summary: 'Goblin chief.', details: {} },
    { entityType: 'location', name: 'The Caves', slug: 'the-caves', summary: 'Goblin lair.', details: {} },
  ],
};

const VALID_OUTLINE: ChapterOutline = {
  chapters: [
    {
      slug: 'ch-1', title: 'Chapter 1: The Village', act: 1, sortOrder: 1,
      levelRange: { min: 3, max: 3 }, targetPages: 3, summary: 'Adventurers arrive.',
      keyEntities: ['the-caves'],
      sections: [
        { slug: 'arrival', title: 'Arrival', sortOrder: 1, targetPages: 1, contentType: 'narrative', summary: 'PCs arrive.' },
        { slug: 'the-elder', title: 'The Elder', sortOrder: 2, targetPages: 2, contentType: 'social', summary: 'Meet the elder.' },
      ],
    },
    {
      slug: 'ch-2', title: 'Chapter 2: Upper Caves', act: 2, sortOrder: 2,
      levelRange: { min: 4, max: 4 }, targetPages: 5, summary: 'Exploring the caves.',
      keyEntities: ['the-caves'],
      sections: [
        { slug: 'entry', title: 'Entry', sortOrder: 1, targetPages: 1, contentType: 'exploration', summary: 'Enter the caves.' },
        { slug: 'traps', title: 'Traps', sortOrder: 2, targetPages: 2, contentType: 'exploration', summary: 'Navigate traps.' },
        { slug: 'patrol', title: 'Patrol', sortOrder: 3, targetPages: 2, contentType: 'encounter', summary: 'Fight goblin patrol.' },
      ],
    },
    {
      slug: 'ch-3', title: 'Chapter 3: Throne Room', act: 2, sortOrder: 3,
      levelRange: { min: 4, max: 5 }, targetPages: 4, summary: 'Final confrontation.',
      keyEntities: ['chief-gnarltooth'],
      sections: [
        { slug: 'approach', title: 'The Approach', sortOrder: 1, targetPages: 1, contentType: 'narrative', summary: 'Approach the throne.' },
        { slug: 'boss-fight', title: 'Boss Fight', sortOrder: 2, targetPages: 3, contentType: 'encounter', summary: 'Fight the chief.' },
      ],
    },
  ],
  appendices: [],
  totalPageEstimate: 12,
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `outline-test-${Date.now()}@test.com`,
      displayName: `Outline Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Outline Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => { vi.clearAllMocks(); });

describe('Outline Service — executeOutlineGeneration', () => {
  it('should create a chapter_outline artifact from valid AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    expect(result.outline.chapters.length).toBe(3);
    expect(result.outline.totalPageEstimate).toBe(12);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'chapter_outline' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.status).toBe('generated');
    expect(artifact!.artifactKey).toBe('chapter-outline');
  });

  it('should include bible context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('The Goblin Caves');
    expect(call.prompt).toContain('ch-1');
    expect(call.prompt).toContain('chief-gnarltooth');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    const updated = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updated!.actualTokens).toBe(2000);
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'not json', usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    await expect(executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192)).rejects.toThrow();
  });

  it('should handle appendices in the outline', async () => {
    const outlineWithAppendices: ChapterOutline = {
      ...VALID_OUTLINE,
      appendices: [{
        slug: 'appendix-a-npcs', title: 'Appendix A: NPCs',
        targetPages: 2, sourceEntityTypes: ['npc'], summary: 'NPC roster.',
      }],
    };

    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(outlineWithAppendices),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);
    expect(result.outline.appendices.length).toBe(1);
    expect(result.outline.appendices[0].slug).toBe('appendix-a-npcs');
  });

  it('should coerce sloppy pipe-delimited contentType values from the model', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        ...VALID_OUTLINE,
        chapters: [
          {
            ...VALID_OUTLINE.chapters[0],
            sections: [
              {
                ...VALID_OUTLINE.chapters[0].sections[0],
                contentType: 'narrative | social | transition',
              },
              {
                ...VALID_OUTLINE.chapters[0].sections[1],
                contentType: 'social / transition',
              },
            ],
          },
          ...VALID_OUTLINE.chapters.slice(1),
        ],
      }),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    expect(result.outline.chapters[0].sections[0].contentType).toBe('narrative');
    expect(result.outline.chapters[0].sections[1].contentType).toBe('social');
  });

  it('should normalize richer scene labels like puzzle and combat', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        ...VALID_OUTLINE,
        chapters: [
          {
            ...VALID_OUTLINE.chapters[0],
            sections: [
              {
                ...VALID_OUTLINE.chapters[0].sections[0],
                contentType: 'puzzle',
              },
              {
                ...VALID_OUTLINE.chapters[0].sections[1],
                contentType: 'combat',
              },
            ],
          },
          ...VALID_OUTLINE.chapters.slice(1),
        ],
      }),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const result = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    expect(result.outline.chapters[0].sections[0].contentType).toBe('exploration');
    expect(result.outline.chapters[0].sections[1].contentType).toBe('encounter');
  });

  it('reuses the persisted outline artifact on replay', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_OUTLINE),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id, userId: testUser.id, prompt: 'test',
    });

    const first = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);
    const second = await executeOutlineGeneration(run!, SAMPLE_BIBLE, {} as any, 8192);

    expect(second.artifactId).toBe(first.artifactId);
    expect(second.outline.totalPageEstimate).toBe(first.outline.totalPageEstimate);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);

    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId: run!.id, artifactType: 'chapter_outline' },
    });
    expect(artifacts).toHaveLength(1);
  });
});
