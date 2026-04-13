import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { NormalizedInput } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { generateObjectWithTimeout } from '../../services/generation/model-timeouts.js';
import { executeIntake } from '../../services/generation/intake.service.js';
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

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `intake-test-${Date.now()}@test.com`,
      displayName: `Intake Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: {
      title: 'Intake Test Project',
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

const VALID_AI_RESPONSE: NormalizedInput = {
  title: 'The Goblin Caves of Duskhollow',
  summary: 'A level 4 one-shot adventure through goblin-infested caves.',
  inferredMode: 'one_shot',
  tone: 'classic fantasy',
  themes: ['exploration', 'combat'],
  setting: 'A network of caves beneath a quiet farming village.',
  premise: 'Goblins have been raiding the village and the adventurers must clear their caves.',
  levelRange: { min: 3, max: 5 },
  pageTarget: 12,
  chapterEstimate: 3,
  constraints: { strict5e: true, includeHandouts: false, includeMaps: false },
  keyElements: {
    npcs: ['Chief Gnarltooth', 'Elder Mara'],
    locations: ['Duskhollow Caves', 'Millbrook Village'],
    plotHooks: ['goblin raids on the village'],
    items: ['Amulet of the Deep'],
  },
};

describe('Intake Service — executeIntake', () => {
  it('should parse a valid AI response and create a project_profile artifact', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_AI_RESPONSE,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A level 4 goblin cave adventure',
    });

    const result = await executeIntake({
      ...run!,
      pageTargetHint: 10,
    }, {} as any, 4096);

    expect(result.normalizedInput.title).toBe('The Goblin Caves of Duskhollow');
    expect(result.normalizedInput.inferredMode).toBe('one_shot');
    expect(result.normalizedInput.levelRange).toEqual({ min: 3, max: 5 });

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'project_profile' },
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.status).toBe('accepted');
    expect(artifact!.artifactKey).toBe('project-profile');
    expect(artifact!.version).toBe(1);
  });

  it('should update the run with inferred mode and page estimates', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_AI_RESPONSE,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A goblin adventure',
    });

    await executeIntake(run!, {} as any, 4096);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.mode).toBe('one_shot');
    expect(updatedRun!.estimatedPages).toBe(12);
  });

  it('should pass user constraints to the prompt', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_AI_RESPONSE,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A gothic horror campaign',
      constraints: { tone: 'gothic horror', levelRange: '3-10' },
    });

    await executeIntake(run!, {} as any, 4096);

    const call = mockGenerateObjectWithTimeout.mock.calls[0][1];
    expect(call.prompt).toContain('gothic horror');
    expect(call.prompt).toContain('3-10');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateObjectWithTimeout.mockRejectedValueOnce(new Error('Structured intake generation failed'));

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    await expect(executeIntake(run!, {} as any, 4096)).rejects.toThrow();
  });

  it('should handle AI response with extra fields gracefully', async () => {
    const responseWithExtras = {
      ...VALID_AI_RESPONSE,
      extraField: 'should be ignored',
      anotherExtra: 42,
    };

    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: responseWithExtras,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    const result = await executeIntake({
      ...run!,
      pageTargetHint: 10,
    }, {} as any, 4096);
    expect(result.normalizedInput.title).toBe(VALID_AI_RESPONSE.title);
  });

  it('should coerce lightweight local-model schema drift before validation', async () => {
    const driftedResponse = {
      ...VALID_AI_RESPONSE,
      levelRange: 4,
      themes: 'mystery',
      pageTarget: undefined,
      chapterEstimate: undefined,
      constraints: {
        strict5e: 'true',
      },
      keyElements: {
        npcs: ['Elder Rowan'],
        locations: ['Briarford'],
        plotHooks: ['the ash bell tolling'],
      },
    };

    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: driftedResponse,
      usage: { inputTokens: 500, outputTokens: 200 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A compact local-model one-shot',
      pageTarget: 10,
    });

    const result = await executeIntake({
      ...run!,
      pageTargetHint: 10,
    }, {} as any, 4096);

    expect(result.normalizedInput.levelRange).toEqual({ min: 4, max: 4 });
    expect(result.normalizedInput.themes).toEqual(['mystery']);
    expect(result.normalizedInput.constraints).toEqual({
      strict5e: true,
      includeHandouts: false,
      includeMaps: false,
    });
    expect(result.normalizedInput.pageTarget).toBe(10);
    expect(result.normalizedInput.chapterEstimate).toBe(4);
    expect(result.normalizedInput.keyElements.items).toEqual([]);
  });

  it('should record token usage on the artifact', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_AI_RESPONSE,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    await executeIntake(run!, {} as any, 4096);

    const artifact = await prisma.generatedArtifact.findFirst({
      where: { runId: run!.id, artifactType: 'project_profile' },
    });
    expect(artifact!.tokenCount).toBe(800); // 500 + 300
  });

  it('reuses the persisted intake artifact on replay instead of regenerating it', async () => {
    mockGenerateObjectWithTimeout.mockResolvedValueOnce({
      object: VALID_AI_RESPONSE,
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    const first = await executeIntake(run!, {} as any, 4096);
    const second = await executeIntake(run!, {} as any, 4096);

    expect(second.artifactId).toBe(first.artifactId);
    expect(second.normalizedInput.title).toBe(first.normalizedInput.title);
    expect(mockGenerateObjectWithTimeout).toHaveBeenCalledTimes(1);

    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId: run!.id, artifactType: 'project_profile' },
    });
    expect(artifacts).toHaveLength(1);
  });
});
