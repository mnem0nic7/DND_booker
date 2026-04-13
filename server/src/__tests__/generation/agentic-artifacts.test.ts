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
      title: 'Critic Report Cycle 1',
      version: 1,
      jsonContent: { findings: [{ code: 'A', severity: 'major' }], score: 90 },
      summary: 'identical artifact',
      markdownContent: null,
      metadata: { cycle: 1, stage: 'critic_text_pass' },
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
      jsonContent: { score: 90, findings: [{ severity: 'major', code: 'A' }] },
      metadata: { stage: 'critic_text_pass', cycle: 1 },
    });

    expect(result).toBe(existingArtifact);
    expect(mockPrisma.generatedArtifact.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.generatedArtifact.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        runId: 'run-1',
        artifactType: 'critic_report',
        artifactKey: 'critic-report-text-cycle-1',
      }),
    }));
  });

  it('retries with the next version after a unique-constraint collision on a different payload', async () => {
    const existingArtifact = {
      id: 'artifact-1',
      title: 'Critic Report Cycle 1',
      version: 1,
      jsonContent: { score: 90 },
      summary: 'old artifact',
      markdownContent: null,
      metadata: null,
    };
    const createdArtifact = {
      id: 'artifact-2',
      version: 2,
      jsonContent: { score: 95 },
      summary: 'new artifact',
      markdownContent: null,
      metadata: null,
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

  it('treats message-only unique-constraint errors as retryable', async () => {
    const existingArtifact = {
      id: 'artifact-2',
      title: 'Critic Report Cycle 2',
      version: 1,
      jsonContent: { score: 91 },
      summary: 'same payload',
      markdownContent: null,
      metadata: null,
    };

    mockPrisma.generatedArtifact.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingArtifact);
    mockPrisma.generatedArtifact.create.mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`run_id`,`artifact_type`,`artifact_key`,`version`)'),
    );

    const result = await createVersionedArtifact({
      runId: 'run-1',
      projectId: 'project-1',
      artifactType: 'critic_report',
      artifactKey: 'critic-report-text-cycle-2',
      title: 'Critic Report Cycle 2',
      summary: 'same payload',
      jsonContent: { score: 91 },
    });

    expect(result).toBe(existingArtifact);
    expect(mockPrisma.generatedArtifact.create).toHaveBeenCalledTimes(1);
  });
});
