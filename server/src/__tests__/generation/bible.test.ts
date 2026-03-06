import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeBibleGeneration } from '../../services/generation/bible.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_INPUT: NormalizedInput = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'A level 4 one-shot adventure through goblin-infested caves.',
  inferredMode: 'one_shot',
  tone: 'classic fantasy',
  themes: ['exploration', 'combat'],
  setting: 'Caves beneath a farming village.',
  premise: 'Goblins raiding the village must be stopped.',
  levelRange: { min: 3, max: 5 },
  pageTarget: 12,
  chapterEstimate: 3,
  constraints: { strict5e: true, includeHandouts: false, includeMaps: false },
  keyElements: {
    npcs: ['Chief Gnarltooth'],
    locations: ['Duskhollow Caves'],
    plotHooks: ['goblin raids'],
    items: [],
  },
};

const VALID_BIBLE_RESPONSE: BibleContent = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'Adventurers delve into goblin-infested caves to save a village.',
  premise: 'Goblins have been raiding Millbrook Village from their cave network.',
  worldRules: {
    setting: 'The Duskhollow region, a pastoral area with ancient cave systems.',
    era: 'Standard medieval fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous', 'classic'],
    forbiddenElements: ['modern technology'],
    worldSpecificRules: ['The caves contain remnants of a dwarven outpost'],
  },
  actStructure: [
    {
      act: 1,
      title: 'The Village',
      summary: 'Adventurers arrive and learn of the goblin threat.',
      levelRange: { min: 3, max: 3 },
      chapterSlugs: ['chapter-1-the-village'],
    },
    {
      act: 2,
      title: 'The Caves',
      summary: 'Delving into the goblin caves.',
      levelRange: { min: 4, max: 4 },
      chapterSlugs: ['chapter-2-the-caves'],
    },
    {
      act: 3,
      title: 'The Throne Room',
      summary: 'Confronting Chief Gnarltooth.',
      levelRange: { min: 4, max: 5 },
      chapterSlugs: ['chapter-3-the-throne-room'],
    },
  ],
  timeline: [
    { order: 1, event: 'Goblins discover the cave system', timeframe: '3 months ago', significance: 'Origin of the problem' },
    { order: 2, event: 'First raids on Millbrook', timeframe: '2 weeks ago', significance: 'Inciting incident' },
  ],
  levelProgression: {
    type: 'milestone',
    milestones: ['Level 4 after clearing the upper caves', 'Level 5 after defeating Chief Gnarltooth'],
  },
  pageBudget: [
    { slug: 'chapter-1-the-village', title: 'Chapter 1: The Village', targetPages: 3, sections: ['Arrival', 'The Elder'] },
    { slug: 'chapter-2-the-caves', title: 'Chapter 2: The Caves', targetPages: 5, sections: ['Upper Caves', 'Traps'] },
    { slug: 'chapter-3-the-throne-room', title: 'Chapter 3: The Throne Room', targetPages: 4, sections: ['The Approach', 'Boss Fight'] },
  ],
  styleGuide: {
    voice: 'Adventurous and descriptive',
    vocabulary: ['delve', 'chamber', 'torchlight'],
    avoidTerms: ['video game', 'level up'],
    narrativePerspective: 'second person',
    toneNotes: 'Keep the tone classic and approachable for new players.',
  },
  openThreads: ['What were the dwarves mining?'],
  entities: [
    {
      entityType: 'npc',
      name: 'Chief Gnarltooth',
      slug: 'chief-gnarltooth',
      summary: 'The cunning goblin chief who leads the raiding parties.',
      details: { race: 'Goblin', class: 'Fighter', level: 4, alignment: 'CE', role: 'antagonist', personality: 'cunning and cruel', motivation: 'power', appearance: 'Large goblin with a broken tusk' },
    },
    {
      entityType: 'npc',
      name: 'Elder Mara',
      slug: 'elder-mara',
      summary: 'The village elder who hires the adventurers.',
      details: { race: 'Human', class: 'Commoner', level: 1, alignment: 'LG', role: 'quest giver', personality: 'worried but resolute', motivation: 'protect her village', appearance: 'Elderly woman with silver hair' },
    },
    {
      entityType: 'location',
      name: 'Duskhollow Caves',
      slug: 'duskhollow-caves',
      summary: 'An ancient cave network now occupied by goblins.',
      details: { locationType: 'dungeon', atmosphere: 'dark and damp', features: ['narrow passages', 'underground stream'], dangers: ['traps', 'goblin patrols'], connections: ['Millbrook Village'] },
    },
  ],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `bible-test-${Date.now()}@test.com`,
      displayName: `Bible Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Bible Test Project',
      userId: testUser.id,
    },
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

describe('Bible Service — executeBibleGeneration', () => {
  it('should create a CampaignBible record from valid AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    const result = await executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192);

    expect(result.bible.title).toBe('The Goblin Caves of Duskhollow');
    expect(result.bible.runId).toBe(run!.id);

    const bible = await prisma.campaignBible.findUnique({ where: { runId: run!.id } });
    expect(bible).not.toBeNull();
    expect(bible!.title).toBe('The Goblin Caves of Duskhollow');
    expect(bible!.summary).toBe(VALID_BIBLE_RESPONSE.summary);
  });

  it('should create a campaign_bible artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'campaign_bible' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.status).toBe('generated');
    expect(artifact!.artifactKey).toBe('campaign-bible');
    expect(artifact!.tokenCount).toBe(3000);
  });

  it('should create CanonEntity records for each entity in the bible', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    const result = await executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192);

    expect(result.entities.length).toBe(3);

    const entities = await prisma.canonEntity.findMany({
      where: { runId: run!.id },
      orderBy: { canonicalName: 'asc' },
    });
    expect(entities.length).toBe(3);

    const chief = entities.find(e => e.slug === 'chief-gnarltooth');
    expect(chief).not.toBeNull();
    expect(chief!.entityType).toBe('npc');
    expect(chief!.canonicalName).toBe('Chief Gnarltooth');
  });

  it('should store structured JSON fields on the CampaignBible', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192);

    const bible = await prisma.campaignBible.findUnique({ where: { runId: run!.id } });
    const worldRules = bible!.worldRules as any;
    expect(worldRules.magicLevel).toBe('standard');
    expect(worldRules.toneDescriptors).toContain('adventurous');

    const pageBudget = bible!.pageBudget as any;
    expect(pageBudget.length).toBe(3);
    expect(pageBudget[0].slug).toBe('chapter-1-the-village');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Not valid JSON',
      usage: { inputTokens: 500, outputTokens: 100 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    await expect(
      executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192),
    ).rejects.toThrow();
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(3000);
  });

  it('should include NormalizedInput context in the AI prompt', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_BIBLE_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    await executeBibleGeneration(run!, SAMPLE_INPUT, {} as any, 8192);

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('The Goblin Caves of Duskhollow');
    expect(call.prompt).toContain('one_shot');
    expect(call.prompt).toContain('classic fantasy');
  });
});
