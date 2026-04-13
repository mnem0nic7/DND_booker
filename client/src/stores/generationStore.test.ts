import { act } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { vi } from 'vitest';
import { useGenerationStore } from './generationStore';
import { server } from '../test/msw/server';

describe('generationStore.fetchLatestRun', () => {
  it('starts autonomous generation from a locked interview session', async () => {
    server.use(
      http.post('/api/v1/projects/:projectId/interview/sessions', () => HttpResponse.json({
        id: 'session-1',
        projectId: 'project-1',
        userId: 'user-1',
        status: 'ready_to_lock',
        turns: [],
        briefDraft: null,
        lockedBrief: null,
        maxUserTurns: 8,
        createdAt: '2026-04-01T16:00:00.000Z',
        updatedAt: '2026-04-01T16:00:00.000Z',
        lockedAt: null,
      })),
      http.post('/api/v1/projects/:projectId/interview/sessions/:sessionId/lock', () => HttpResponse.json({
        id: 'session-1',
        projectId: 'project-1',
        userId: 'user-1',
        status: 'locked',
        turns: [],
        briefDraft: {
          title: 'Smoke Gate',
          summary: 'Short one-shot.',
          generationMode: 'one_shot',
          concept: 'Smoke gate mystery',
          theme: 'Planar smoke',
          tone: 'tense',
          levelRange: { min: 3, max: 4 },
          scope: '4-6 pages',
          partyAssumptions: 'party of four',
          desiredComplexity: 'straightforward',
          qualityBudgetLane: 'fast',
          mustHaveElements: ['one encounter'],
          specialConstraints: ['original only'],
          settings: { includeHandouts: true, includeMaps: false, strict5e: true },
        },
        lockedBrief: {
          title: 'Smoke Gate',
          summary: 'Short one-shot.',
          generationMode: 'one_shot',
          concept: 'Smoke gate mystery',
          theme: 'Planar smoke',
          tone: 'tense',
          levelRange: { min: 3, max: 4 },
          scope: '4-6 pages',
          partyAssumptions: 'party of four',
          desiredComplexity: 'straightforward',
          qualityBudgetLane: 'fast',
          mustHaveElements: ['one encounter'],
          specialConstraints: ['original only'],
          settings: { includeHandouts: true, includeMaps: false, strict5e: true },
        },
        maxUserTurns: 8,
        createdAt: '2026-04-01T16:00:00.000Z',
        updatedAt: '2026-04-01T16:01:00.000Z',
        lockedAt: '2026-04-01T16:01:00.000Z',
      })),
      http.post('/api/v1/projects/:projectId/generation-runs', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        expect(body).toMatchObject({
          interviewSessionId: 'session-1',
          quality: 'quick',
          pageTarget: 8,
        });

        return HttpResponse.json({
          id: 'run-2',
          projectId: 'project-1',
          userId: 'user-1',
          mode: 'one_shot',
          quality: 'quick',
          status: 'queued',
          currentStage: 'planning',
          progressPercent: 0,
          inputPrompt: 'Short one-shot.',
          createdAt: '2026-04-01T16:01:00.000Z',
          updatedAt: '2026-04-01T16:01:00.000Z',
        }, { status: 201 });
      }),
      http.get('/api/v1/projects/:projectId/generation-runs/:runId/events', () => new HttpResponse('', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })),
      http.get('/api/v1/projects/:projectId/generation-runs', () => HttpResponse.json([])),
    );

    await act(async () => {
      await useGenerationStore.getState().startRun('project-1', 'Smoke gate mystery', 'one_shot', 'quick', 8);
    });

    const state = useGenerationStore.getState();
    expect(state.currentRun?.id).toBe('run-2');
    expect(state.error).toBeNull();
    useGenerationStore.getState().unsubscribe();
  });

  it('hydrates terminal runs from the detail endpoint so artifact counts stay current', async () => {
    server.use(
      http.get('/api/v1/projects/:projectId/generation-runs', () => HttpResponse.json([
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
      http.get('/api/v1/projects/:projectId/generation-runs/:runId', () => HttpResponse.json({
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

  it('resolves a pending interrupt and resumes a paused run', async () => {
    const resumeRun = vi.fn().mockResolvedValue(undefined);

    useGenerationStore.setState({
      currentRun: {
        id: 'run-1',
        mode: 'campaign',
        quality: 'quick',
        status: 'paused',
        currentStage: 'planning',
        progressPercent: 42,
        inputPrompt: 'Parity test run',
        graphStateJson: {
          interrupts: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              kind: 'manual_review',
              status: 'pending',
              createdAt: '2026-04-01T16:00:00.000Z',
            },
          ],
        },
        createdAt: '2026-04-01T16:00:00.000Z',
        updatedAt: '2026-04-01T16:05:00.000Z',
      },
      resumeRun: resumeRun as any,
    });

    server.use(
      http.post('/api/v1/projects/:projectId/generation-runs/:runId/interrupts/:interruptId/resolve', () => HttpResponse.json({
        id: '11111111-1111-4111-8111-111111111111',
        runType: 'generation',
        runId: 'run-1',
        kind: 'manual_review',
        title: 'Review chapter outline',
        summary: 'Needs approval',
        status: 'approved',
        payload: null,
        resolutionPayload: null,
        resolvedByUserId: 'user-1',
        createdAt: '2026-04-01T16:00:00.000Z',
        resolvedAt: '2026-04-01T16:06:00.000Z',
      })),
    );

    await act(async () => {
      await useGenerationStore.getState().resolveInterrupt(
        'project-1',
        'run-1',
        '11111111-1111-4111-8111-111111111111',
        'approve',
      );
    });

    expect(resumeRun).toHaveBeenCalledWith('project-1', 'run-1');
  });
});
