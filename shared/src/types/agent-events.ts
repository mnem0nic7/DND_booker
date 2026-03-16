import type {
  AgentActionType,
  AgentRunStatus,
  AgentScorecard,
} from './agent-run.js';

export type AgentEvent =
  | { type: 'run_status'; runId: string; status: AgentRunStatus; stage: string | null; progressPercent: number }
  | { type: 'design_profile_created'; runId: string; title: string }
  | { type: 'score_updated'; runId: string; scorecard: AgentScorecard }
  | { type: 'checkpoint_created'; runId: string; checkpointId: string; label: string; isBest: boolean }
  | { type: 'checkpoint_restored'; runId: string; checkpointId: string; label: string }
  | { type: 'action_started'; runId: string; actionId: string; actionType: AgentActionType; cycleIndex: number }
  | { type: 'action_completed'; runId: string; actionId: string; actionType: AgentActionType; cycleIndex: number; summary: string | null }
  | { type: 'decision_made'; runId: string; cycleIndex: number; actionType: AgentActionType | null; rationale: string }
  | { type: 'run_warning'; runId: string; message: string; severity: 'info' | 'warning' | 'error' }
  | { type: 'run_completed'; runId: string; bestCheckpointId: string | null }
  | { type: 'run_failed'; runId: string; reason: string };
