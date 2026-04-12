import { useEffect, useState } from 'react';
import { useImprovementLoopStore } from '../../stores/improvementLoopStore';

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  bootstrapping_project: 'Bootstrapping Project',
  creator: 'Creator',
  designer: 'Designer',
  editor: 'Editor',
  engineering: 'Engineering',
  completed: 'Complete',
  failed: 'Failed',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const ACTIVE_STATUSES = new Set([
  'queued',
  'bootstrapping_project',
  'creator',
  'designer',
  'editor',
  'engineering',
]);

interface Props {
  projectId: string;
}

export function ImprovementLoopPanel({ projectId }: Props) {
  const {
    currentRun,
    progressPercent,
    currentStage,
    artifacts,
    isLoadingArtifacts,
    error,
    fetchLatestRun,
    pauseRun,
    resumeRun,
    cancelRun,
  } = useImprovementLoopStore();
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(null);

  useEffect(() => {
    fetchLatestRun(projectId);
  }, [projectId, fetchLatestRun]);

  if (!currentRun) return null;

  const status = currentRun.status;
  const isActive = ACTIVE_STATUSES.has(status);
  const selectedArtifact = artifacts.find((artifact) => artifact.id === expandedArtifactId) ?? null;

  return (
    <div className="border border-emerald-200 rounded-lg p-3 mb-3 bg-emerald-50/60">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isActive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
          {status === 'completed' && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {status === 'failed' && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {status === 'paused' && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
          <span className="text-sm font-medium text-gray-800">
            Improvement Loop: {STAGE_LABELS[status] ?? currentStage ?? status}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {currentRun.mode === 'create_campaign' ? 'Create campaign and run' : 'Current project'}
        </span>
      </div>

      {(isActive || status === 'paused') && (
        <div className="w-full bg-emerald-100 rounded-full h-1.5 mb-3">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${status === 'paused' ? 'bg-yellow-500' : 'bg-emerald-600'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="text-xs text-gray-600 space-y-1 mb-3">
        <div><span className="font-medium">Objective:</span> {currentRun.input.objective}</div>
        {currentRun.linkedGenerationRunId && (
          <div><span className="font-medium">Creator run:</span> {currentRun.linkedGenerationRunId}</div>
        )}
        {currentRun.linkedAgentRunId && (
          <div><span className="font-medium">Designer run:</span> {currentRun.linkedAgentRunId}</div>
        )}
        {currentRun.editorFinalReport && (
          <div>
            <span className="font-medium">Editor:</span> {currentRun.editorFinalReport.overallScore}/100, {currentRun.editorFinalReport.recommendation}
          </div>
        )}
        {currentRun.githubPullRequestUrl && (
          <div>
            <span className="font-medium">Engineering PR:</span>{' '}
            <a
              href={currentRun.githubPullRequestUrl}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:text-emerald-900 underline"
            >
              #{currentRun.githubPullRequestNumber}
            </a>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {currentRun.designerUxNotes && (
        <div className="mb-3 rounded border border-emerald-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            Designer UX Notes
          </div>
          <div className="text-xs text-gray-700">{currentRun.designerUxNotes.summary}</div>
        </div>
      )}

      {currentRun.engineeringReport && (
        <div className="mb-3 rounded border border-emerald-200 bg-white px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            Engineering Summary
          </div>
          <div className="text-xs text-gray-700">{currentRun.engineeringReport.summary}</div>
          {currentRun.engineeringApplyResult && (
            <div className="mt-1 text-[11px] text-gray-500">{currentRun.engineeringApplyResult.message}</div>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        {isActive && (
          <button
            onClick={() => void pauseRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
          >
            Pause
          </button>
        )}
        {status === 'paused' && (
          <button
            onClick={() => void resumeRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
          >
            Resume
          </button>
        )}
        {(isActive || status === 'paused') && (
          <button
            onClick={() => void cancelRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="mb-2">
        <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1">Loop artifacts</div>
        {isLoadingArtifacts && artifacts.length === 0 ? (
          <div className="text-xs text-gray-500">Loading artifacts...</div>
        ) : artifacts.length === 0 ? (
          <div className="text-xs text-gray-500">No loop artifacts yet.</div>
        ) : (
          <div className="space-y-1">
            {artifacts.map((artifact) => (
              <button
                key={artifact.id}
                onClick={() => setExpandedArtifactId((current) => current === artifact.id ? null : artifact.id)}
                className="w-full text-left text-xs text-gray-600 bg-white/70 border border-emerald-100 rounded px-2 py-1 hover:bg-white"
              >
                <div className="font-medium text-gray-700">{artifact.title}</div>
                {artifact.summary && <div className="text-[11px] text-gray-500">{artifact.summary}</div>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedArtifact && (
        <div className="mt-3 rounded border border-emerald-200 bg-white px-3 py-2">
          <div className="text-xs font-semibold text-gray-800 mb-2">{selectedArtifact.title}</div>
          {selectedArtifact.markdownContent ? (
            <pre className="text-[11px] text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {selectedArtifact.markdownContent}
            </pre>
          ) : selectedArtifact.jsonContent ? (
            <pre className="text-[11px] text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {JSON.stringify(selectedArtifact.jsonContent, null, 2)}
            </pre>
          ) : (
            <div className="text-[11px] text-gray-500">This artifact has no previewable content.</div>
          )}
        </div>
      )}
    </div>
  );
}
