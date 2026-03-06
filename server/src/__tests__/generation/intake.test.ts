import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { NormalizedInput } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { executeIntake } from '../../services/generation/intake.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));

const mockGenerateText = vi.mocked(generateText);

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
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A level 4 goblin cave adventure',
    });

    const result = await executeIntake(run!, {} as any, 4096);

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
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
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
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A gothic horror campaign',
      constraints: { tone: 'gothic horror', levelRange: '3-10' },
    });

    await executeIntake(run!, {} as any, 4096);

    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain('gothic horror');
    expect(call.prompt).toContain('3-10');
  });

  it('should throw on malformed AI response', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'This is not JSON at all',
      usage: { inputTokens: 500, outputTokens: 100 },
    } as any);

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

    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(responseWithExtras),
      usage: { inputTokens: 500, outputTokens: 300 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'A test adventure',
    });

    const result = await executeIntake(run!, {} as any, 4096);
    expect(result.normalizedInput.title).toBe(VALID_AI_RESPONSE.title);
  });

  it('should record token usage on the artifact', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(VALID_AI_RESPONSE),
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
});
