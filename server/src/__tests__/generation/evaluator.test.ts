import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';
import { EVALUATION_WEIGHTS, ACCEPTANCE_THRESHOLDS } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import {
  evaluateArtifact,
  calculateOverallScore,
  checkAcceptance,
  getArtifactCategory,
} from '../../services/generation/evaluator.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'Test Campaign',
  summary: 'A test.',
  premise: 'Testing.',
  worldRules: {
    setting: 'Test world',
    era: 'Modern',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [],
  timeline: [],
  levelProgression: null,
  pageBudget: [],
  styleGuide: {
    voice: 'Test',
    vocabulary: [],
    avoidTerms: [],
    narrativePerspective: 'second person',
    toneNotes: '',
  },
  openThreads: [],
  entities: [],
};

const PASSING_EVAL_RESPONSE = {
  structuralCompleteness: 92,
  continuityScore: 88,
  dndSanity: 85,
  editorialQuality: 80,
  publicationFit: 82,
  findings: [
    { severity: 'informational', code: 'GOOD_PACING', message: 'Well-paced narrative.', affectedScope: 'global' },
  ],
  recommendedActions: ['Minor polish on transitions'],
};

const FAILING_EVAL_RESPONSE = {
  structuralCompleteness: 65,
  continuityScore: 70,
  dndSanity: 60,
  editorialQuality: 55,
  publicationFit: 50,
  findings: [
    { severity: 'critical', code: 'MISSING_SECTION', message: 'Section 2 is missing.', affectedScope: 'section-2', suggestedFix: 'Add the missing section.' },
    { severity: 'major', code: 'NPC_INCONSISTENCY', message: 'NPC name differs from canon.', affectedScope: 'chief-gnarltooth' },
  ],
  recommendedActions: ['Add missing section', 'Fix NPC names'],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `eval-test-${Date.now()}@test.com`,
      displayName: `Eval Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Eval Test Project', userId: testUser.id },
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

describe('Evaluator — pure functions', () => {
  it('getArtifactCategory maps artifact types to categories', () => {
    expect(getArtifactCategory('chapter_plan')).toBe('planning');
    expect(getArtifactCategory('npc_dossier')).toBe('reference');
    expect(getArtifactCategory('chapter_draft')).toBe('written');
    expect(getArtifactCategory('unknown_type')).toBe('written');
  });

  it('calculateOverallScore computes weighted score', () => {
    const dimensions = {
      structuralCompleteness: 90,
      continuityScore: 85,
      dndSanity: 80,
      editorialQuality: 75,
      publicationFit: 70,
    };
    const score = calculateOverallScore(dimensions, EVALUATION_WEIGHTS.written);
    // 90*0.20 + 85*0.25 + 80*0.20 + 75*0.20 + 70*0.15 = 18+21.25+16+15+10.5 = 80.75 → 81
    expect(score).toBe(81);
  });

  it('checkAcceptance passes when all thresholds met', () => {
    const result = checkAcceptance(
      { structuralCompleteness: 92, continuityScore: 88, publicationFit: 82 },
      85,
      ACCEPTANCE_THRESHOLDS.written,
      [],
    );
    expect(result).toBe(true);
  });

  it('checkAcceptance fails on critical finding', () => {
    const findings: EvaluationFinding[] = [
      { severity: 'critical', code: 'TEST', message: 'Critical issue', affectedScope: 'global' },
    ];
    const result = checkAcceptance(
      { structuralCompleteness: 95, continuityScore: 95, publicationFit: 95 },
      95,
      ACCEPTANCE_THRESHOLDS.written,
      findings,
    );
    expect(result).toBe(false);
  });

  it('checkAcceptance fails when overall score below threshold', () => {
    const result = checkAcceptance(
      { structuralCompleteness: 90, continuityScore: 90, publicationFit: 90 },
      70,
      ACCEPTANCE_THRESHOLDS.written,
      [],
    );
    expect(result).toBe(false);
  });
});

describe('Evaluator — evaluateArtifact', () => {
  it('should create a passing ArtifactEvaluation', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(PASSING_EVAL_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'test-chapter',
        status: 'generated',
        version: 1,
        title: 'Test Chapter',
        jsonContent: { test: true } as any,
      },
    });

    const result = await evaluateArtifact(run!, artifact.id, SAMPLE_BIBLE, {} as any, 4096);

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.findings.length).toBe(1);

    const evaluation = await prisma.artifactEvaluation.findUnique({ where: { id: result.evaluationId } });
    expect(evaluation).not.toBeNull();
    expect(evaluation!.passed).toBe(true);

    // Artifact should be accepted
    const updated = await prisma.generatedArtifact.findUnique({ where: { id: artifact.id } });
    expect(updated!.status).toBe('accepted');
  });

  it('should create a failing ArtifactEvaluation with critical findings', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(FAILING_EVAL_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'test-failing',
        status: 'generated',
        version: 1,
        title: 'Failing Chapter',
        jsonContent: { test: true } as any,
      },
    });

    const result = await evaluateArtifact(run!, artifact.id, SAMPLE_BIBLE, {} as any, 4096);

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBe(2);

    // Artifact should be failed_evaluation (NOT needs_revision)
    const updated = await prisma.generatedArtifact.findUnique({ where: { id: artifact.id } });
    expect(updated!.status).toBe('failed_evaluation');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(PASSING_EVAL_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'npc_dossier',
        artifactKey: 'test-npc-eval',
        status: 'generated',
        version: 1,
        title: 'Test NPC',
        jsonContent: { test: true } as any,
      },
    });

    await evaluateArtifact(run!, artifact.id, SAMPLE_BIBLE, {} as any, 4096);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(1500);
  });
});
