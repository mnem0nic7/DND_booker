/**
 * Golden Prompt Regression Suite
 *
 * Tests the intake -> bible pipeline chain with 4 canonical prompts
 * representing different generation modes and styles.
 *
 * These are structural regression tests -- they verify:
 * 1. The pipeline produces valid output for each prompt
 * 2. Mode inference works correctly across prompt types
 * 3. Entity counts and page budgets are reasonable
 * 4. Bible content has structural completeness
 *
 * All AI calls are mocked. These do NOT test AI output quality
 * (that requires live evaluation), only pipeline correctness.
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { createRun } from '../../services/generation/run.service.js';
import { generateObjectWithTimeout } from '../../services/generation/model-timeouts.js';
import { executeIntake } from '../../services/generation/intake.service.js';
import { executeBibleGeneration } from '../../services/generation/bible.service.js';

// Fixtures
import * as goblinOneShot from './golden-prompts/goblin-one-shot.js';
import * as horrorMiniCampaign from './golden-prompts/horror-mini-campaign.js';
import * as urbanIntrigue from './golden-prompts/urban-intrigue.js';
import * as wildernessHex from './golden-prompts/wilderness-hex.js';

vi.mock('../../services/generation/model-timeouts.js', () => ({
  generateObjectWithTimeout: vi.fn(),
}));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));

const mockGenerateObjectWithTimeout = vi.mocked(generateObjectWithTimeout);

let testUser: { id: string };
let testProject: { id: string };

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `golden-test-${Date.now()}@test.com`,
      displayName: `Golden Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Golden Prompt Test Project',
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

interface GoldenFixture {
  PROMPT: string;
  EXPECTED_INTAKE: NormalizedInput;
  EXPECTED_BIBLE: BibleContent;
}

const GOLDEN_PROMPTS: { name: string; fixture: GoldenFixture }[] = [
  { name: 'Goblin one-shot', fixture: goblinOneShot },
  { name: 'Horror mini-campaign', fixture: horrorMiniCampaign },
  { name: 'Urban intrigue campaign', fixture: urbanIntrigue },
  { name: 'Wilderness hex campaign', fixture: wildernessHex },
];

describe('Golden Prompt Regression Suite', () => {
  describe.each(GOLDEN_PROMPTS)('$name', ({ fixture }) => {
    it('should produce valid intake output', async () => {
      mockGenerateObjectWithTimeout.mockResolvedValueOnce({
        object: fixture.EXPECTED_INTAKE,
        usage: { inputTokens: 500, outputTokens: 400 },
      } as any);

      const run = await createRun({
        projectId: testProject.id,
        userId: testUser.id,
        prompt: fixture.PROMPT,
      });

      const result = await executeIntake(run!, {} as any, 4096);

      // Structural assertions on the returned normalizedInput
      expect(result.normalizedInput.title).toBeTruthy();
      expect(result.normalizedInput.summary.length).toBeGreaterThan(20);
      expect(result.normalizedInput.inferredMode).toBe(fixture.EXPECTED_INTAKE.inferredMode);
      expect(result.normalizedInput.pageTarget).toBeGreaterThan(0);
      expect(result.normalizedInput.chapterEstimate).toBeGreaterThan(0);
      expect(result.normalizedInput.levelRange!.min).toBeLessThanOrEqual(
        result.normalizedInput.levelRange!.max,
      );

      // Key elements should exist
      expect(result.normalizedInput.keyElements.npcs.length).toBeGreaterThan(0);
      expect(result.normalizedInput.keyElements.locations.length).toBeGreaterThan(0);

      // Artifact should be created in DB
      const artifact = await prisma.generatedArtifact.findUnique({
        where: { id: result.artifactId },
      });
      expect(artifact).not.toBeNull();
      expect(artifact!.artifactType).toBe('project_profile');
      expect(artifact!.status).toBe('accepted');
    });

    it('should produce valid bible from intake output', async () => {
      mockGenerateObjectWithTimeout.mockResolvedValueOnce({
        object: fixture.EXPECTED_BIBLE,
        usage: { inputTokens: 1500, outputTokens: 3000 },
      } as any);

      const run = await createRun({
        projectId: testProject.id,
        userId: testUser.id,
        prompt: fixture.PROMPT,
      });

      const bibleResult = await executeBibleGeneration(
        run!,
        fixture.EXPECTED_INTAKE,
        {} as any,
        8192,
      );

      // Bible record created
      expect(bibleResult.bible.title).toBeTruthy();

      // Verify full bible content via DB lookup
      const bible = await prisma.campaignBible.findUnique({
        where: { id: bibleResult.bible.id },
      });
      expect(bible).not.toBeNull();
      expect(bible!.summary.length).toBeGreaterThan(20);
      expect(bible!.premise).toBeTruthy();

      // World rules
      const worldRules = bible!.worldRules as any;
      expect(worldRules).toBeTruthy();
      expect(worldRules.setting.length).toBeGreaterThan(10);
      expect(worldRules.toneDescriptors.length).toBeGreaterThan(0);

      // Act structure
      const actStructure = bible!.actStructure as any[];
      expect(actStructure.length).toBeGreaterThanOrEqual(2);
      for (const act of actStructure) {
        expect(act.title).toBeTruthy();
        expect(act.chapterSlugs.length).toBeGreaterThan(0);
      }

      // Page budgets
      const pageBudget = bible!.pageBudget as any[];
      expect(pageBudget.length).toBeGreaterThanOrEqual(2);
      const totalPages = pageBudget.reduce(
        (sum: number, ch: any) => sum + ch.targetPages, 0,
      );
      expect(totalPages).toBeGreaterThan(0);

      // Entities
      expect(bibleResult.entities.length).toBeGreaterThanOrEqual(2);
      const entityTypes = new Set(bibleResult.entities.map(e => e.entityType));
      expect(entityTypes.has('npc')).toBe(true);
      expect(entityTypes.has('location')).toBe(true);

      // Style guide
      const styleGuide = bible!.styleGuide as any;
      expect(styleGuide).toBeTruthy();
      expect(styleGuide.voice.length).toBeGreaterThan(10);
    });

    it('should chain intake -> bible and maintain token tracking', async () => {
      const intakeTokens = { inputTokens: 500, outputTokens: 300 };
      const bibleTokens = { inputTokens: 1500, outputTokens: 3000 };

      mockGenerateObjectWithTimeout
        .mockResolvedValueOnce({
          object: fixture.EXPECTED_INTAKE,
          usage: intakeTokens,
        } as any)
        .mockResolvedValueOnce({
          object: fixture.EXPECTED_BIBLE,
          usage: bibleTokens,
        } as any);

      const run = await createRun({
        projectId: testProject.id,
        userId: testUser.id,
        prompt: fixture.PROMPT,
      });

      // Chain
      const intakeResult = await executeIntake(run!, {} as any, 4096);
      const bibleResult = await executeBibleGeneration(
        run!,
        intakeResult.normalizedInput,
        {} as any,
        8192,
      );

      // Token tracking
      const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
      const expectedTokens =
        intakeTokens.inputTokens + intakeTokens.outputTokens +
        bibleTokens.inputTokens + bibleTokens.outputTokens;
      expect(updatedRun!.actualTokens).toBe(expectedTokens);

      // Two artifacts created
      const artifacts = await prisma.generatedArtifact.findMany({
        where: { runId: run!.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(artifacts.length).toBe(2);
      expect(artifacts[0].artifactType).toBe('project_profile');
      expect(artifacts[1].artifactType).toBe('campaign_bible');

      // Mode should be inferred from intake
      expect(updatedRun!.mode).toBe(fixture.EXPECTED_INTAKE.inferredMode);

      // Canon entities created
      const entities = await prisma.canonEntity.findMany({ where: { runId: run!.id } });
      expect(entities.length).toBe(bibleResult.entities.length);
    });
  });

  describe('Cross-prompt structural invariants', () => {
    it('should infer correct mode for each prompt type', () => {
      expect(goblinOneShot.EXPECTED_INTAKE.inferredMode).toBe('one_shot');
      expect(horrorMiniCampaign.EXPECTED_INTAKE.inferredMode).toBe('module');
      expect(urbanIntrigue.EXPECTED_INTAKE.inferredMode).toBe('campaign');
      expect(wildernessHex.EXPECTED_INTAKE.inferredMode).toBe('campaign');
    });

    it('should have page targets appropriate for each mode', () => {
      // One-shot: 8-18 pages
      expect(goblinOneShot.EXPECTED_INTAKE.pageTarget).toBeGreaterThanOrEqual(8);
      expect(goblinOneShot.EXPECTED_INTAKE.pageTarget).toBeLessThanOrEqual(18);

      // Module: 24-60 pages
      expect(horrorMiniCampaign.EXPECTED_INTAKE.pageTarget).toBeGreaterThanOrEqual(24);
      expect(horrorMiniCampaign.EXPECTED_INTAKE.pageTarget).toBeLessThanOrEqual(60);

      // Campaign: 80-200 pages
      expect(urbanIntrigue.EXPECTED_INTAKE.pageTarget).toBeGreaterThanOrEqual(80);
      expect(urbanIntrigue.EXPECTED_INTAKE.pageTarget).toBeLessThanOrEqual(200);
      expect(wildernessHex.EXPECTED_INTAKE.pageTarget).toBeGreaterThanOrEqual(80);
      expect(wildernessHex.EXPECTED_INTAKE.pageTarget).toBeLessThanOrEqual(250);
    });

    it('should have entity counts that scale with mode', () => {
      const goblinEntities = goblinOneShot.EXPECTED_BIBLE.entities.length;
      const horrorEntities = horrorMiniCampaign.EXPECTED_BIBLE.entities.length;
      const urbanEntities = urbanIntrigue.EXPECTED_BIBLE.entities.length;
      const wildEntities = wildernessHex.EXPECTED_BIBLE.entities.length;

      // One-shot has fewest, campaigns have most
      expect(goblinEntities).toBeLessThanOrEqual(horrorEntities);
      expect(horrorEntities).toBeLessThanOrEqual(Math.max(urbanEntities, wildEntities));
    });
  });
});
