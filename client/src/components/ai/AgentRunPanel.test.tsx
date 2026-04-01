import { screen } from '@testing-library/react';
import type { AgentRun } from '@dnd-booker/shared';
import { AgentRunPanel } from './AgentRunPanel';
import { useAgentStore } from '../../stores/agentStore';
import { renderWithProviders } from '../../test/render';

function buildRun(): AgentRun {
  return {
    id: 'run-1',
    projectId: 'project-1',
    userId: 'user-1',
    linkedGenerationRunId: null,
    mode: 'persistent_editor',
    status: 'completed',
    currentStage: null,
    progressPercent: 100,
    goal: {
      objective: 'Stabilize parity drift',
      successDefinition: 'Parity findings resolved',
      prompt: null,
      targetFormat: 'pdf',
      primaryObjective: 'dm_ready_quality',
      modeIntent: 'persistent_editor',
      generationMode: 'one_shot',
      generationQuality: 'polished',
      pageTarget: null,
    },
    budget: {
      maxCycles: 3,
      maxExports: 3,
      maxImagePassesPerDocument: 0,
      maxNoImprovementStreak: 2,
      maxDurationMs: 600000,
    },
    critiqueBacklog: [],
    latestScorecard: null,
    designProfile: null,
    bestCheckpointId: null,
    latestCheckpointId: null,
    currentStrategy: 'Audit layout parity before generic refreshes.',
    cycleCount: 1,
    exportCount: 1,
    noImprovementStreak: 0,
    failureReason: null,
    createdAt: '2026-03-31T20:00:00.000Z',
    updatedAt: '2026-03-31T20:10:00.000Z',
    startedAt: '2026-03-31T20:00:00.000Z',
    completedAt: '2026-03-31T20:10:00.000Z',
  };
}

describe('AgentRunPanel parity action labels', () => {
  it('renders audit_layout_parity actions with the friendly label and result summary', () => {
    useAgentStore.setState({
      currentRun: buildRun(),
      progressPercent: 100,
      currentStage: null,
      events: [],
      checkpoints: [],
      actions: [{
        id: 'action-1',
        runId: 'run-1',
        cycleIndex: 1,
        actionType: 'audit_layout_parity',
        status: 'completed',
        rationale: 'Parity findings take priority over generic refreshes.',
        input: null,
        result: { summary: 'Applied 2 automatic fixes across 1 document.' },
        scoreDelta: 5,
        startedAt: '2026-03-31T20:05:00.000Z',
        completedAt: '2026-03-31T20:06:00.000Z',
        createdAt: '2026-03-31T20:05:00.000Z',
      }],
      error: null,
      fetchLatestRun: vi.fn().mockResolvedValue(undefined),
      pauseRun: vi.fn().mockResolvedValue(undefined),
      resumeRun: vi.fn().mockResolvedValue(undefined),
      cancelRun: vi.fn().mockResolvedValue(undefined),
      restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      unsubscribe: vi.fn(),
    });

    renderWithProviders(<AgentRunPanel projectId="project-1" />);

    expect(screen.getByText('Audit layout parity: Applied 2 automatic fixes across 1 document.')).toBeInTheDocument();
  });
});
