import { act } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { vi } from 'vitest';
import { useAgentStore } from './agentStore';
import { server } from '../test/msw/server';

describe('agentStore.resolveInterrupt', () => {
  it('resolves a pending agent interrupt and resumes a paused run', async () => {
    const resumeRun = vi.fn().mockResolvedValue(undefined);

    useAgentStore.setState({
      currentRun: {
        id: 'run-1',
        projectId: 'project-1',
        userId: 'user-1',
        linkedGenerationRunId: null,
        mode: 'persistent_editor',
        status: 'paused',
        currentStage: 'planning',
        progressPercent: 18,
        goal: {
          objective: 'Improve the project',
          successDefinition: 'Improve the project',
          prompt: null,
          targetFormat: 'pdf',
          primaryObjective: 'dm_ready_quality',
          modeIntent: 'persistent_editor',
          generationMode: 'campaign',
          generationQuality: 'polished',
          pageTarget: null,
        },
        budget: {
          maxCycles: 4,
          maxExports: 6,
          maxImagePassesPerDocument: 2,
          maxNoImprovementStreak: 2,
          maxDurationMs: 1200000,
        },
        critiqueBacklog: [],
        latestScorecard: null,
        designProfile: null,
        bestCheckpointId: null,
        latestCheckpointId: null,
        currentStrategy: 'Review changes',
        cycleCount: 1,
        exportCount: 0,
        noImprovementStreak: 0,
        failureReason: null,
        graphStateJson: {
          interrupts: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              kind: 'approval_gate',
              status: 'pending',
              createdAt: '2026-04-01T16:00:00.000Z',
            },
          ],
        },
        resumeToken: null,
        createdAt: '2026-04-01T16:00:00.000Z',
        updatedAt: '2026-04-01T16:05:00.000Z',
        startedAt: '2026-04-01T16:00:00.000Z',
        completedAt: null,
      },
      resumeRun: resumeRun as any,
    });

    server.use(
      http.post('/api/v1/projects/:projectId/agent-runs/:runId/interrupts/:interruptId/resolve', () => HttpResponse.json({
        id: '22222222-2222-4222-8222-222222222222',
        runType: 'agent',
        runId: 'run-1',
        kind: 'approval_gate',
        title: 'Approve creative director changes',
        summary: 'Needs approval',
        status: 'edited',
        payload: null,
        resolutionPayload: { note: 'Tighten encounter pacing' },
        resolvedByUserId: 'user-1',
        createdAt: '2026-04-01T16:00:00.000Z',
        resolvedAt: '2026-04-01T16:06:00.000Z',
      })),
    );

    await act(async () => {
      await useAgentStore.getState().resolveInterrupt(
        'project-1',
        'run-1',
        '22222222-2222-4222-8222-222222222222',
        'edit',
        { note: 'Tighten encounter pacing' },
      );
    });

    expect(resumeRun).toHaveBeenCalledWith('project-1', 'run-1');
  });
});
