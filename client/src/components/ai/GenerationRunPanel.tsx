import { useEffect, useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';
import { RUN_STATUS_TRANSITIONS, type GenerationEvent, type RunStatus } from '@dnd-booker/shared';
import { ArtifactReviewPanel } from './ArtifactReviewPanel';

const STAGE_LABELS: Record<RunStatus, string> = {
  queued: 'Queued',
  planning: 'Planning Campaign',
  generating_assets: 'Creating Assets',
  generating_prose: 'Writing Chapters',
  evaluating: 'Quality Review',
  revising: 'Revising Content',
  assembling: 'Assembling Documents',
  completed: 'Complete',
  failed: 'Failed',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const SUBSTAGE_LABELS: Record<string, string> = {
  planning: 'Planning Campaign',
  generating_assets: 'Creating Assets',
  generating_prose: 'Writing Chapters',
  evaluating: 'Quality Review',
  revising: 'Revising Content',
  assembly: 'Assembling Documents',
  publication_polish: 'Polishing Layout',
  preflight_recheck: 'Rechecking Layout',
  art_direction: 'Planning Artwork',
};

const ACTIVE_STATUSES: RunStatus[] = [
  'queued',
  'planning',
  'generating_assets',
  'generating_prose',
  'evaluating',
  'revising',
  'assembling',
];

function formatEvent(e: GenerationEvent): string | null {
  switch (e.type) {
    case 'artifact_created':
      return `Created: ${e.title}`;
    case 'artifact_evaluated':
      return `Evaluated: ${e.passed ? 'Passed' : 'Needs revision'} (${e.overallScore}/100)`;
    case 'artifact_revised':
      return `Revised: ${e.title} v${e.version}`;
    case 'artifact_escalated':
      return `Escalated: ${e.title} - ${e.reason}`;
    case 'run_warning':
      return `${e.severity === 'error' ? 'Error' : e.severity === 'warning' ? 'Warning' : 'Info'}: ${e.message}`;
    case 'run_status':
      return (e.stage ? SUBSTAGE_LABELS[e.stage] : null) ?? STAGE_LABELS[e.status as RunStatus] ?? e.stage;
    case 'task_started':
      return `Task started: ${e.taskType}`;
    case 'task_completed':
      return `Task completed: ${e.taskType}`;
    case 'run_completed':
      return 'Generation complete';
    case 'run_failed':
      return `Failed: ${e.reason}`;
    default:
      return null;
  }
}

interface Props {
  projectId: string;
}

export function GenerationRunPanel({ projectId }: Props) {
  const [showArtifacts, setShowArtifacts] = useState(false);
  const {
    currentRun,
    progressPercent,
    currentStage,
    artifactCount,
    error,
    events,
    fetchLatestRun,
    pauseRun,
    cancelRun,
    resumeRun,
    reset,
  } = useGenerationStore();

  useEffect(() => {
    fetchLatestRun(projectId);
    return () => {
      useGenerationStore.getState().unsubscribe();
    };
  }, [projectId, fetchLatestRun]);

  useEffect(() => {
    setShowArtifacts(false);
  }, [currentRun?.id]);

  useEffect(() => {
    if (currentRun?.status === 'completed') {
      setShowArtifacts(true);
    }
  }, [currentRun?.status]);

  if (!currentRun) return null;

  const status = currentRun.status;
  const isActive = ACTIVE_STATUSES.includes(status);
  const isPaused = status === 'paused';
  const isDone = status === 'completed';
  const isFailed = status === 'failed';
  const isCancelled = status === 'cancelled';
  const isTerminal = isDone || isFailed || isCancelled;
  const canPause = RUN_STATUS_TRANSITIONS[status]?.includes('paused') ?? false;
  const canCancel = RUN_STATUS_TRANSITIONS[status]?.includes('cancelled') ?? false;
  const canResume = isPaused && Boolean(currentRun.currentStage)
    && (RUN_STATUS_TRANSITIONS.paused?.includes(currentRun.currentStage as RunStatus) ?? false);

  const stageLabel =
    (currentStage ? SUBSTAGE_LABELS[currentStage] : null) ??
    STAGE_LABELS[(currentStage as RunStatus) ?? status] ??
    STAGE_LABELS[status] ??
    status;
  const recentEvents = events.slice(-5);

  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          )}
          {isDone && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {isFailed && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {isPaused && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
          {isCancelled && <span className="w-2 h-2 rounded-full bg-gray-400" />}
          <span className="text-sm font-medium text-gray-700">{stageLabel}</span>
        </div>
        <span className="text-xs text-gray-500">
          {artifactCount} artifact{artifactCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Progress bar */}
      {(isActive || isPaused) && (
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${
              isPaused ? 'bg-yellow-500' : 'bg-purple-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {isDone && (
        <div className="w-full bg-green-200 rounded-full h-1.5 mb-2">
          <div className="bg-green-500 h-1.5 rounded-full w-full" />
        </div>
      )}

      {/* Error message */}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {/* Recent events */}
      {recentEvents.length > 0 && (
        <div className="text-xs text-gray-500 space-y-0.5 mb-2 max-h-20 overflow-y-auto">
          {recentEvents.map((e, i) => {
            const label = formatEvent(e);
            if (!label) return null;
            return (
              <div key={i} className="truncate">
                {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {isActive && canPause && (
          <>
            <button
              onClick={() => pauseRun(projectId, currentRun.id)}
              className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
            >
              Pause
            </button>
          </>
        )}
        {(isActive || isPaused) && canCancel && (
          <button
            onClick={() => cancelRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
          >
            Cancel
          </button>
        )}
        {canResume && (
          <>
            <button
              onClick={() => resumeRun(projectId, currentRun.id)}
              className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
            >
              Resume
            </button>
          </>
        )}
        {isTerminal && (
          <button
            onClick={() => setShowArtifacts((value) => !value)}
            className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
          >
            {showArtifacts ? 'Hide Review' : 'Review Output'}
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

      {showArtifacts && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <ArtifactReviewPanel projectId={projectId} runId={currentRun.id} />
        </div>
      )}
    </div>
  );
}
