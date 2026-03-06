import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { reviseArtifact, getRevisionCount } from '../../services/generation/reviser.service.js';
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

const SAMPLE_FINDINGS: EvaluationFinding[] = [
  { severity: 'critical', code: 'MISSING_SECTION', message: 'Section 2 is missing.', affectedScope: 'section-2', suggestedFix: 'Add the missing section.' },
  { severity: 'major', code: 'NPC_INCONSISTENCY', message: 'NPC name wrong.', affectedScope: 'npc-1' },
];

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `reviser-test-${Date.now()}@test.com`,
      displayName: `Reviser Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Reviser Test Project', userId: testUser.id },
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

describe('Reviser Service', () => {
  it('should create a new artifact version with revision record', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ fixed: true, content: 'revised' }),
      usage: { inputTokens: 1500, outputTokens: 2000 },
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
        artifactKey: 'revise-test-ch',
        status: 'failed_evaluation',
        version: 1,
        title: 'Test Chapter',
        jsonContent: { original: true } as any,
      },
    });

    const result = await reviseArtifact(run!, artifact.id, SAMPLE_FINDINGS, SAMPLE_BIBLE, {} as any, 8192);

    expect(result).not.toBeNull();
    expect(result!.newVersion).toBe(2);

    // New artifact should exist
    const newArtifact = await prisma.generatedArtifact.findUnique({ where: { id: result!.newArtifactId } });
    expect(newArtifact).not.toBeNull();
    expect(newArtifact!.version).toBe(2);
    expect(newArtifact!.parentArtifactId).toBe(artifact.id);
    expect(newArtifact!.status).toBe('generated');

    // Revision record should exist
    const revision = await prisma.artifactRevision.findUnique({ where: { id: result!.revisionId } });
    expect(revision).not.toBeNull();
    expect(revision!.fromVersion).toBe(1);
    expect(revision!.toVersion).toBe(2);
  });

  it('should return null and escalate when max revisions exceeded', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    // Create original artifact
    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'max-revise-test',
        status: 'failed_evaluation',
        version: 1,
        title: 'Max Revise Test',
        jsonContent: {} as any,
      },
    });

    // Create 2 existing revision records to simulate max revisions
    const v2 = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'max-revise-test',
        status: 'failed_evaluation',
        version: 2,
        title: 'Max Revise Test',
        jsonContent: {} as any,
      },
    });
    await prisma.artifactRevision.create({
      data: { artifactId: v2.id, fromVersion: 1, toVersion: 2, reason: 'fix 1' },
    });

    const v3 = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'max-revise-test',
        status: 'failed_evaluation',
        version: 3,
        title: 'Max Revise Test',
        jsonContent: {} as any,
      },
    });
    await prisma.artifactRevision.create({
      data: { artifactId: v3.id, fromVersion: 2, toVersion: 3, reason: 'fix 2' },
    });

    const result = await reviseArtifact(run!, artifact.id, SAMPLE_FINDINGS, SAMPLE_BIBLE, {} as any, 8192);

    expect(result).toBeNull();

    // Artifact should be escalated to needs_review
    const updated = await prisma.generatedArtifact.findUnique({ where: { id: artifact.id } });
    expect(updated!.status).toBe('needs_review');
  });

  it('should update run token count on revision', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ revised: true }),
      usage: { inputTokens: 1500, outputTokens: 2000 },
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
        artifactKey: 'token-revise-test',
        status: 'failed_evaluation',
        version: 1,
        title: 'Token Test',
        jsonContent: {} as any,
      },
    });

    await reviseArtifact(run!, artifact.id, SAMPLE_FINDINGS, SAMPLE_BIBLE, {} as any, 8192);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(3500);
  });

  it('getRevisionCount returns correct count', async () => {
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
        artifactKey: 'count-test',
        status: 'generated',
        version: 1,
        title: 'Count Test',
        jsonContent: {} as any,
      },
    });

    expect(await getRevisionCount(artifact.id)).toBe(0);

    // Add a revision
    const v2 = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'count-test',
        status: 'generated',
        version: 2,
        title: 'Count Test',
        jsonContent: {} as any,
      },
    });
    await prisma.artifactRevision.create({
      data: { artifactId: v2.id, fromVersion: 1, toVersion: 2, reason: 'fix' },
    });

    expect(await getRevisionCount(artifact.id)).toBe(1);
  });
});
