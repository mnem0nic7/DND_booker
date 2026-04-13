import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { createRun } from '../../services/generation/run.service.js';
import { generateObjectWithTimeout } from '../../services/generation/model-timeouts.js';
import { executeIntake } from '../../services/generation/intake.service.js';
import { executeBibleGeneration } from '../../services/generation/bible.service.js';

vi.mock('../../services/generation/model-timeouts.js', () => ({
  generateObjectWithTimeout: vi.fn(),
}));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateObjectWithTimeout = vi.mocked(generateObjectWithTimeout);

let testUser: { id: string };
let testProject: { id: string };

const INTAKE_RESPONSE: NormalizedInput = {
  title: 'Shadows Over Ravenmoor',
  summary: 'A gothic horror campaign for levels 3-10.',
  inferredMode: 'campaign',
  tone: 'gothic horror',
  themes: ['horror', 'mystery', 'betrayal'],
  setting: 'The cursed land of Ravenmoor, a once-prosperous kingdom now shrouded in darkness.',
  premise: 'An ancient evil stirs beneath Castle Ravenmoor, corrupting the land and its people.',
  levelRange: { min: 3, max: 10 },
  pageTarget: 120,
  chapterEstimate: 10,
  constraints: { strict5e: true, includeHandouts: true, includeMaps: false },
  keyElements: {
    npcs: ['Lord Aldric Ravenmoor', 'Sister Elara'],
    locations: ['Castle Ravenmoor', 'The Blighted Marsh'],
    plotHooks: ['corruption spreading from the castle'],
    items: ['Bloodstone Pendant'],
  },
};

const BIBLE_RESPONSE: BibleContent = {
  title: 'Shadows Over Ravenmoor',
  summary: 'A gothic horror campaign where adventurers uncover the dark secret of Castle Ravenmoor.',
  premise: 'An ancient vampire lord is awakening beneath the castle, spreading corruption.',
  worldRules: {
    setting: 'The kingdom of Ravenmoor, inspired by Gothic horror.',
    era: 'Late medieval',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['dark', 'foreboding', 'atmospheric'],
    forbiddenElements: ['comedy relief', 'modern references'],
    worldSpecificRules: ['Undead are more powerful at night', 'Holy water is rare and valuable'],
  },
  actStructure: [
    { act: 1, title: 'The Gathering Dark', summary: 'Adventurers arrive and discover the corruption.', levelRange: { min: 3, max: 5 }, chapterSlugs: ['ch-1', 'ch-2', 'ch-3'] },
    { act: 2, title: 'Into the Depths', summary: 'Investigating the source of the corruption.', levelRange: { min: 5, max: 7 }, chapterSlugs: ['ch-4', 'ch-5', 'ch-6'] },
    { act: 3, title: 'The Final Night', summary: 'Confronting the vampire lord.', levelRange: { min: 8, max: 10 }, chapterSlugs: ['ch-7', 'ch-8', 'ch-9', 'ch-10'] },
  ],
  timeline: [
    { order: 1, event: 'Vampire lord sealed beneath castle', timeframe: '500 years ago', significance: 'Origin' },
    { order: 2, event: 'Seal weakens, corruption begins', timeframe: '1 month ago', significance: 'Inciting event' },
  ],
  levelProgression: { type: 'milestone', milestones: ['Level 4 after Act 1', 'Level 7 after Act 2'] },
  pageBudget: [
    { slug: 'ch-1', title: 'Chapter 1: Arrival', targetPages: 12, sections: ['The Road', 'The Village'] },
    { slug: 'ch-2', title: 'Chapter 2: First Signs', targetPages: 12, sections: ['The Blight', 'The Church'] },
  ],
  styleGuide: {
    voice: 'Dark and atmospheric, building dread.',
    vocabulary: ['shroud', 'blight', 'whisper', 'decay'],
    avoidTerms: ['fun', 'awesome', 'cool'],
    narrativePerspective: 'second person',
    toneNotes: 'Maintain constant unease. Even safe moments should feel temporary.',
  },
  openThreads: ['What other evils were sealed with the vampire lord?'],
  entities: [
    { entityType: 'npc', name: 'Lord Aldric Ravenmoor', slug: 'lord-aldric-ravenmoor', summary: 'The tragic lord of Castle Ravenmoor.', details: { race: 'Human', alignment: 'LN', role: 'tragic figure' } },
    { entityType: 'npc', name: 'Sister Elara', slug: 'sister-elara', summary: 'A priest investigating the corruption.', details: { race: 'Human', alignment: 'LG', role: 'ally' } },
    { entityType: 'location', name: 'Castle Ravenmoor', slug: 'castle-ravenmoor', summary: 'An ancient castle above the sealed evil.', details: { locationType: 'castle', atmosphere: 'oppressive' } },
  ],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `pipeline-test-${Date.now()}@test.com`,
      displayName: `Pipeline Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Pipeline Test Project',
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

describe('Intake → Bible Pipeline', () => {
  it('should chain intake output into bible generation', async () => {
    // Mock both AI calls in sequence
    mockGenerateObjectWithTimeout
      .mockResolvedValueOnce({
        object: INTAKE_RESPONSE,
        usage: { inputTokens: 500, outputTokens: 300 },
      } as any)
      .mockResolvedValueOnce({
        object: BIBLE_RESPONSE,
        usage: { inputTokens: 1500, outputTokens: 3000 },
      } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'Create a gothic horror campaign for levels 3-10 set in a cursed kingdom',
      constraints: { tone: 'gothic horror', levelRange: '3-10' },
    });

    // Step 1: Intake
    const intakeResult = await executeIntake(run!, {} as any, 4096);
    expect(intakeResult.normalizedInput.inferredMode).toBe('campaign');
    expect(intakeResult.normalizedInput.pageTarget).toBe(120);

    // Step 2: Bible generation (uses intake output)
    const bibleResult = await executeBibleGeneration(
      run!,
      intakeResult.normalizedInput,
      {} as any,
      8192,
    );
    expect(bibleResult.bible.title).toBe('Shadows Over Ravenmoor');
    expect(bibleResult.entities.length).toBe(3);

    // Verify full state in DB
    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId: run!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(artifacts.length).toBe(2);
    expect(artifacts[0].artifactType).toBe('project_profile');
    expect(artifacts[1].artifactType).toBe('campaign_bible');

    const bible = await prisma.campaignBible.findUnique({ where: { runId: run!.id } });
    expect(bible).not.toBeNull();

    const entities = await prisma.canonEntity.findMany({ where: { runId: run!.id } });
    expect(entities.length).toBe(3);

    // Verify cumulative token tracking
    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(5300); // 800 + 4500
    expect(updatedRun!.mode).toBe('campaign');
    expect(updatedRun!.estimatedPages).toBe(120);
  });

  it('should handle sparse intake input gracefully in bible generation', async () => {
    const minimalInput: NormalizedInput = {
      ...INTAKE_RESPONSE,
      keyElements: { npcs: [], locations: [], plotHooks: [], items: [] },
    };

    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: BIBLE_RESPONSE,
      usage: { inputTokens: 1000, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A simple adventure',
    });

    const result = await executeBibleGeneration(run!, minimalInput, {} as any, 8192);
    expect(result.bible.title).toBe('Shadows Over Ravenmoor');
  });
});
