import { act } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { useGenerationStore } from './generationStore';
import { server } from '../test/msw/server';

describe('generationStore.fetchLatestRun', () => {
  it('hydrates terminal runs from the detail endpoint so artifact counts stay current', async () => {
    server.use(
      http.get('/api/projects/:projectId/ai/generation-runs', () => HttpResponse.json([
        {
          id: 'run-1',
          mode: 'campaign',
          quality: 'quick',
          status: 'completed',
          currentStage: null,
          progressPercent: 100,
          inputPrompt: 'Parity test run',
          createdAt: '2026-04-01T16:00:00.000Z',
          updatedAt: '2026-04-01T16:05:00.000Z',
        },
      ])),
      http.get('/api/projects/:projectId/ai/generation-runs/:runId', () => HttpResponse.json({
        id: 'run-1',
        projectId: 'project-1',
        userId: 'user-1',
        mode: 'campaign',
        quality: 'quick',
        status: 'completed',
        currentStage: null,
        inputPrompt: 'Parity test run',
        inputParameters: null,
        progressPercent: 100,
        estimatedPages: 8,
        estimatedTokens: 5000,
        estimatedCost: null,
        actualTokens: 4200,
        actualCost: 0,
        failureReason: null,
        createdAt: '2026-04-01T16:00:00.000Z',
        updatedAt: '2026-04-01T16:05:00.000Z',
        startedAt: '2026-04-01T16:00:00.000Z',
        completedAt: '2026-04-01T16:05:00.000Z',
        taskCount: 0,
        artifactCount: 3,
        latestExportReview: null,
      })),
    );

    await act(async () => {
      await useGenerationStore.getState().fetchLatestRun('project-1');
    });

    const state = useGenerationStore.getState();
    expect(state.currentRun?.id).toBe('run-1');
    expect(state.progressPercent).toBe(100);
    expect(state.currentStage).toBeNull();
    expect(state.artifactCount).toBe(3);
  });
});
