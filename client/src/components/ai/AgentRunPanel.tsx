import { useEffect } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { AGENT_STATUS_TRANSITIONS, type AgentAction, type AgentEvent, type AgentRunStatus } from '@dnd-booker/shared';

const STAGE_LABELS: Record<AgentRunStatus, string> = {
  queued: 'Queued',
  seeding: 'Seeding Draft',
  observing: 'Observing Project',
  planning: 'Planning Next Move',
  acting: 'Applying Changes',
  evaluating: 'Evaluating Results',
  checkpointing: 'Checkpointing',
  completed: 'Complete',
  failed: 'Failed',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const ACTIVE_STATUSES: AgentRunStatus[] = [
  'queued',
  'seeding',
  'observing',
  'planning',
  'acting',
  'evaluating',
  'checkpointing',
];

const ACTION_LABELS: Partial<Record<AgentAction['actionType'], string>> = {
  audit_layout_parity: 'Audit layout parity',
  refresh_layout_plan: 'Refresh layout plan',
  create_export_review: 'Create export review',
  create_design_profile: 'Create design profile',
  observe_project: 'Observe project',
  expand_random_tables: 'Expand random tables',
  repair_stat_blocks: 'Repair stat blocks',
  densify_section_utility: 'Densify section utility',
  finalize_output: 'Finalize output',
};

function formatEvent(event: AgentEvent): string | null {
  switch (event.type) {
    case 'design_profile_created':
      return `Design profile: ${event.title}`;
    case 'score_updated':
      return `Score updated: ${event.scorecard.overallScore}/100`;
    case 'checkpoint_created':
      return `Checkpoint: ${event.label}`;
    case 'checkpoint_restored':
      return `Restored checkpoint: ${event.label}`;
    case 'action_started':
      return `Action started: ${event.actionType.replace(/_/g, ' ')}`;
    case 'action_completed':
      return event.summary ?? `Action completed: ${event.actionType.replace(/_/g, ' ')}`;
    case 'decision_made':
      return event.actionType ? `Decision: ${event.actionType.replace(/_/g, ' ')}` : `Decision: ${event.rationale}`;
    case 'run_warning':
      return `${event.severity === 'error' ? 'Error' : event.severity === 'warning' ? 'Warning' : 'Info'}: ${event.message}`;
    case 'run_completed':
      return 'Creative director complete';
    case 'run_failed':
      return `Failed: ${event.reason}`;
    case 'run_status':
      return STAGE_LABELS[event.status] ?? event.status;
    default:
      return null;
  }
}

function formatAction(action: AgentAction): string {
  const base = ACTION_LABELS[action.actionType] ?? action.actionType.replace(/_/g, ' ');
  const resultSummary = action.result && typeof action.result === 'object' && 'summary' in action.result
    && typeof (action.result as { summary?: unknown }).summary === 'string'
    ? (action.result as { summary: string }).summary
    : null;
  if (resultSummary) return `${base}: ${resultSummary}`;
  if (action.rationale) return `${base}: ${action.rationale}`;
  return base;
}

interface Props {
  projectId: string;
}

export function AgentRunPanel({ projectId }: Props) {
  const {
    currentRun,
    progressPercent,
    currentStage,
    events,
    checkpoints,
    actions,
    error,
    fetchLatestRun,
    pauseRun,
    resumeRun,
    cancelRun,
    restoreCheckpoint,
    reset,
  } = useAgentStore();

  useEffect(() => {
    fetchLatestRun(projectId);
    return () => {
      useAgentStore.getState().unsubscribe();
    };
  }, [projectId, fetchLatestRun]);

  if (!currentRun) return null;

  const status = currentRun.status;
  const isActive = ACTIVE_STATUSES.includes(status);
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(status);
  const canPause = AGENT_STATUS_TRANSITIONS[status]?.includes('paused') ?? false;
  const canResume = status === 'paused'
    && Boolean(currentRun.currentStage)
    && (AGENT_STATUS_TRANSITIONS.paused?.includes(currentRun.currentStage as AgentRunStatus) ?? false);
  const canCancel = AGENT_STATUS_TRANSITIONS[status]?.includes('cancelled') ?? false;

  const recentEvents = events.slice(-5);
  const recentActions = actions.slice(0, 3);
  const bestCheckpointId = currentRun.bestCheckpointId;

  return (
    <div className="border border-amber-200 rounded-lg p-3 mb-3 bg-amber-50/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isActive && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          {status === 'completed' && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {status === 'failed' && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {status === 'paused' && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
          <span className="text-sm font-medium text-gray-800">
            Creative Director: {STAGE_LABELS[status] ?? currentStage ?? status}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {currentRun.mode === 'background_producer' ? 'Background producer' : 'Persistent editor'}
        </span>
      </div>

      {(isActive || status === 'paused') && (
        <div className="w-full bg-amber-100 rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${status === 'paused' ? 'bg-yellow-500' : 'bg-amber-600'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="text-xs text-gray-600 space-y-1 mb-3">
        <div><span className="font-medium">Goal:</span> {currentRun.goal.objective}</div>
        {currentRun.currentStrategy && <div><span className="font-medium">Strategy:</span> {currentRun.currentStrategy}</div>}
        {currentRun.latestScorecard && (
          <div>
            <span className="font-medium">Score:</span> {currentRun.latestScorecard.overallScore}/100, {currentRun.latestScorecard.warningFindingCount} warning(s), {currentRun.latestScorecard.blockingFindingCount} blocking
            <div className="text-[11px] text-gray-500">
              Thin tables: {currentRun.latestScorecard.thinRandomTableCount} • Low-utility sections: {currentRun.latestScorecard.lowUtilityDensityCount} • Stat-block issues: {currentRun.latestScorecard.suspiciousStatBlockCount}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {recentEvents.length > 0 && (
        <div className="text-xs text-gray-500 space-y-0.5 mb-2 max-h-20 overflow-y-auto">
          {recentEvents.map((event, index) => {
            const label = formatEvent(event);
            if (!label) return null;
            return <div key={index} className="truncate">{label}</div>;
          })}
        </div>
      )}

      {recentActions.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Recent actions</div>
          <div className="space-y-1">
            {recentActions.map((action) => (
              <div key={action.id} className="text-xs text-gray-600 bg-white/70 border border-amber-100 rounded px-2 py-1">
                {formatAction(action)}
              </div>
            ))}
          </div>
        </div>
      )}

      {checkpoints.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Checkpoints</div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {checkpoints.slice(0, 5).map((checkpoint) => (
              <div key={checkpoint.id} className="flex items-center justify-between gap-2 text-xs bg-white/80 border border-amber-100 rounded px-2 py-1">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-700">
                    {checkpoint.label}{checkpoint.id === bestCheckpointId ? ' (best)' : ''}
                  </div>
                  {checkpoint.scorecard && (
                    <div className="text-gray-500 truncate">Score {checkpoint.scorecard.overallScore}/100</div>
                  )}
                </div>
                <button
                  onClick={() => restoreCheckpoint(projectId, currentRun.id, checkpoint.id)}
                  className="shrink-0 text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {isActive && canPause && (
          <button
            onClick={() => pauseRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
          >
            Pause
          </button>
        )}
        {canResume && (
          <button
            onClick={() => resumeRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
          >
            Resume
          </button>
        )}
        {(isActive || status === 'paused') && canCancel && (
          <button
            onClick={() => cancelRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
          >
            Cancel
          </button>
        )}
        {isTerminal && (
          <button
            onClick={() => reset()}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
