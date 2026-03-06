import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, NpcDossier, LocationBrief, ItemBundle } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { expandCanonEntity, expandAllCanonEntities } from '../../services/generation/canon.service.js';
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
  summary: 'A one-shot adventure.',
  premise: 'Goblins raiding the village.',
  worldRules: {
    setting: 'The Duskhollow region',
    era: 'Medieval fantasy',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous', 'classic'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [
    { act: 1, title: 'Act 1', summary: 'Begin', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1'] },
  ],
  timeline: [],
  levelProgression: null,
  pageBudget: [],
  styleGuide: {
    voice: 'Adventurous',
    vocabulary: [],
    avoidTerms: [],
    narrativePerspective: 'second person',
    toneNotes: 'Classic.',
  },
  openThreads: [],
  entities: [
    {
      entityType: 'npc',
      name: 'Chief Gnarltooth',
      slug: 'chief-gnarltooth',
      summary: 'Goblin chief.',
      details: { race: 'Goblin', class: 'Fighter', level: 4, alignment: 'CE', role: 'antagonist', personality: 'cunning', motivation: 'power', appearance: 'Large goblin' },
    },
    {
      entityType: 'location',
      name: 'Duskhollow Caves',
      slug: 'duskhollow-caves',
      summary: 'Ancient caves.',
      details: { locationType: 'dungeon', atmosphere: 'dark', features: ['stream'], dangers: ['traps'], connections: ['village'] },
    },
    {
      entityType: 'item',
      name: 'Fang of Gnarltooth',
      slug: 'fang-of-gnarltooth',
      summary: 'A goblin chieftain dagger.',
      details: { itemType: 'weapon', rarity: 'uncommon', properties: '+1 dagger', lore: 'Forged from a tusk' },
    },
  ],
};

const VALID_NPC_DOSSIER: NpcDossier = {
  slug: 'chief-gnarltooth',
  name: 'Chief Gnarltooth',
  race: 'Goblin',
  class: 'Fighter',
  level: 4,
  alignment: 'CE',
  role: 'antagonist',
  appearance: 'A large goblin with a broken tusk.',
  personality: 'Cunning and cruel.',
  motivation: 'Power over his tribe.',
  backstory: 'Rose to power by defeating the previous chief.',
  mannerisms: ['speaks in third person', 'taps his broken tusk'],
  dialogueHooks: ['You dare enter MY caves?'],
  relationships: [{ name: 'Elder Mara', slug: 'elder-mara', nature: 'enemy' }],
  secrets: ['He fears a deeper threat in the caves'],
  statBlock: {
    ac: 16,
    hp: '33 (6d6+12)',
    speed: '30 ft.',
    abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 8, cha: 12 },
    skills: ['Athletics +4', 'Intimidation +3'],
    senses: 'darkvision 60 ft., passive Perception 9',
    languages: ['Common', 'Goblin'],
    cr: '2',
  },
};

const VALID_LOCATION_BRIEF: LocationBrief = {
  slug: 'duskhollow-caves',
  name: 'Duskhollow Caves',
  locationType: 'dungeon',
  atmosphere: 'Dark and damp with echoing drips.',
  description: 'An ancient cave network now home to goblins.',
  areas: [
    { name: 'Entrance', description: 'A narrow opening.', features: ['stalactites'], dangers: ['pit trap'] },
    { name: 'Main Chamber', description: 'A large cavern.', features: ['underground stream'], dangers: ['goblin guards'] },
  ],
  npcsPresent: [{ slug: 'chief-gnarltooth', name: 'Chief Gnarltooth', role: 'boss' }],
  secrets: ['Hidden dwarven door behind the waterfall'],
  connections: [{ destination: 'Millbrook Village', description: 'Trail through the forest' }],
  environmentalEffects: ['dim light throughout', 'difficult terrain (loose rocks)'],
};

const VALID_ITEM_BUNDLE: ItemBundle = {
  slug: 'fang-of-gnarltooth',
  name: 'Fang of Gnarltooth',
  itemType: 'weapon',
  rarity: 'uncommon',
  description: 'A crude dagger carved from a goblin tusk.',
  mechanics: '+1 dagger. On a critical hit, the target must make a DC 12 Constitution save or take 1d6 poison damage.',
  attunement: false,
  properties: ['finesse', 'light', 'thrown (20/60)'],
  lore: 'Carved from the tusk of Gnarltooth\'s predecessor.',
  history: 'Kept in the chief\'s treasure hoard.',
  quirks: ['Glows faintly green when goblins are within 60 feet'],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `canon-test-${Date.now()}@test.com`,
      displayName: `Canon Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Canon Test Project', userId: testUser.id },
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

describe('Canon Service — expandCanonEntity', () => {
  it('should create an npc_dossier artifact for an NPC entity', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin cave adventure',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: SAMPLE_BIBLE.entities[0].details as any,
        summary: 'Goblin chief.',
      },
    });

    const result = await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth', canonicalName: 'Chief Gnarltooth', summary: 'Goblin chief.' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(result.artifactType).toBe('npc_dossier');
    expect(result.entitySlug).toBe('chief-gnarltooth');

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact).not.toBeNull();
    expect(artifact!.artifactType).toBe('npc_dossier');
    expect(artifact!.artifactKey).toBe('npc_dossier-chief-gnarltooth');
    expect(artifact!.tokenCount).toBe(2000);
  });

  it('should create a CanonReference linking entity to artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth-ref',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'Goblin chief.',
      },
    });

    const result = await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth-ref', canonicalName: 'Chief Gnarltooth', summary: 'Goblin chief.' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    const ref = await prisma.canonReference.findFirst({
      where: { entityId: entity.id, artifactId: result.artifactId },
    });
    expect(ref).not.toBeNull();
    expect(ref!.referenceType).toBe('introduces');
  });

  it('should update the entity canonicalData with enriched details', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth-update',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: { race: 'Goblin' } as any,
        summary: 'Goblin chief.',
      },
    });

    await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth-update', canonicalName: 'Chief Gnarltooth', summary: 'Goblin chief.' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    const updated = await prisma.canonEntity.findUnique({ where: { id: entity.id } });
    const data = updated!.canonicalData as any;
    expect(data.backstory).toBe('Rose to power by defeating the previous chief.');
    expect(data.statBlock.cr).toBe('2');
  });

  it('should create a location_brief artifact for a location entity', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_LOCATION_BRIEF),
      usage: { inputTokens: 600, outputTokens: 1000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'location',
        slug: 'duskhollow-caves',
        canonicalName: 'Duskhollow Caves',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'Ancient caves.',
      },
    });

    const result = await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'location', slug: 'duskhollow-caves', canonicalName: 'Duskhollow Caves', summary: 'Ancient caves.' },
      SAMPLE_BIBLE.entities[1],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(result.artifactType).toBe('location_brief');

    const artifact = await prisma.generatedArtifact.findUnique({ where: { id: result.artifactId } });
    expect(artifact!.artifactKey).toBe('location_brief-duskhollow-caves');
  });

  it('should throw on unsupported entity type', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    await expect(
      expandCanonEntity(
        run!,
        { id: 'fake', entityType: 'monster', slug: 'dragon', canonicalName: 'Dragon', summary: 'A dragon.' },
        { entityType: 'npc', name: 'x', slug: 'x', summary: 'x', details: {} } as any,
        SAMPLE_BIBLE,
        {} as any,
        4096,
      ),
    ).rejects.toThrow('Unsupported entity type');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Not valid JSON',
      usage: { inputTokens: 100, outputTokens: 50 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'bad-npc',
        canonicalName: 'Bad NPC',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'test',
      },
    });

    await expect(
      expandCanonEntity(
        run!,
        { id: entity.id, entityType: 'npc', slug: 'bad-npc', canonicalName: 'Bad NPC', summary: 'test' },
        SAMPLE_BIBLE.entities[0],
        SAMPLE_BIBLE,
        {} as any,
        4096,
      ),
    ).rejects.toThrow();
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'token-test-npc',
        canonicalName: 'Token Test',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'test',
      },
    });

    await expandCanonEntity(
      run!,
      { id: entity.id, entityType: 'npc', slug: 'token-test-npc', canonicalName: 'Token Test', summary: 'test' },
      SAMPLE_BIBLE.entities[0],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(2000);
  });
});

describe('Canon Service — expandAllCanonEntities', () => {
  it('should expand all entities and return results', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: JSON.stringify(VALID_NPC_DOSSIER), usage: { inputTokens: 800, outputTokens: 1200 } } as any)
      .mockResolvedValueOnce({ text: JSON.stringify(VALID_LOCATION_BRIEF), usage: { inputTokens: 600, outputTokens: 1000 } } as any)
      .mockResolvedValueOnce({ text: JSON.stringify(VALID_ITEM_BUNDLE), usage: { inputTokens: 400, outputTokens: 600 } } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test expand all',
    });

    const entities = await Promise.all(
      SAMPLE_BIBLE.entities.map((seed) =>
        prisma.canonEntity.create({
          data: {
            projectId: run!.projectId,
            runId: run!.id,
            entityType: seed.entityType,
            slug: seed.slug,
            canonicalName: seed.name,
            aliases: [] as any,
            canonicalData: seed.details as any,
            summary: seed.summary,
          },
        }),
      ),
    );

    const results = await expandAllCanonEntities(
      run!,
      entities.map((e) => ({ id: e.id, entityType: e.entityType, slug: e.slug, canonicalName: e.canonicalName })),
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(results.length).toBe(3);
    expect(results.map((r) => r.artifactType).sort()).toEqual(['item_bundle', 'location_brief', 'npc_dossier']);
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it('should skip entities with no matching bible seed', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_NPC_DOSSIER),
      usage: { inputTokens: 800, outputTokens: 1200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test skip',
    });

    const entity = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'chief-gnarltooth',
        canonicalName: 'Chief Gnarltooth',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'test',
      },
    });

    const orphan = await prisma.canonEntity.create({
      data: {
        projectId: run!.projectId,
        runId: run!.id,
        entityType: 'npc',
        slug: 'unknown-npc',
        canonicalName: 'Unknown NPC',
        aliases: [] as any,
        canonicalData: {} as any,
        summary: 'not in bible',
      },
    });

    const results = await expandAllCanonEntities(
      run!,
      [
        { id: entity.id, entityType: 'npc', slug: 'chief-gnarltooth', canonicalName: 'Chief Gnarltooth' },
        { id: orphan.id, entityType: 'npc', slug: 'unknown-npc', canonicalName: 'Unknown NPC' },
      ],
      SAMPLE_BIBLE,
      {} as any,
      4096,
    );

    expect(results.length).toBe(1);
    expect(results[0].entitySlug).toBe('chief-gnarltooth');
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});
