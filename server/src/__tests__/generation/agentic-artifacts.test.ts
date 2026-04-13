import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  generatedArtifact: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../config/database.js', () => ({
  prisma: mockPrisma,
}));

import { createVersionedArtifact } from '../../services/generation/agentic-artifacts.service.js';

describe('createVersionedArtifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the latest identical artifact after a unique-constraint retry collision', async () => {
    const existingArtifact = {
      id: 'artifact-1',
      version: 1,
      jsonContent: { score: 90 },
      summary: 'identical artifact',
      markdownContent: null,
    };

    mockPrisma.generatedArtifact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingArtifact);
    mockPrisma.generatedArtifact.create.mockRejectedValueOnce({ code: 'P2002' });

    const result = await createVersionedArtifact({
      runId: 'run-1',
      projectId: 'project-1',
      artifactType: 'critic_report',
      artifactKey: 'critic-report-text-cycle-1',
      title: 'Critic Report Cycle 1',
      summary: 'identical artifact',
      jsonContent: { score: 90 },
    });

    expect(result).toBe(existingArtifact);
    expect(mockPrisma.generatedArtifact.create).toHaveBeenCalledTimes(1);
  });

  it('retries with the next version after a unique-constraint collision on a different payload', async () => {
    const existingArtifact = {
      id: 'artifact-1',
      version: 1,
      jsonContent: { score: 90 },
      summary: 'old artifact',
      markdownContent: null,
    };
    const createdArtifact = {
      id: 'artifact-2',
      version: 2,
      jsonContent: { score: 95 },
      summary: 'new artifact',
      markdownContent: null,
    };

    mockPrisma.generatedArtifact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingArtifact);
    mockPrisma.generatedArtifact.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce(createdArtifact);

    const result = await createVersionedArtifact({
      runId: 'run-1',
      projectId: 'project-1',
      artifactType: 'critic_report',
      artifactKey: 'critic-report-text-cycle-1',
      title: 'Critic Report Cycle 1',
      summary: 'new artifact',
      jsonContent: { score: 95 },
    });

    expect(result).toBe(createdArtifact);
    expect(mockPrisma.generatedArtifact.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.generatedArtifact.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version: 2,
        parentArtifactId: 'artifact-1',
      }),
    }));
  });
});
