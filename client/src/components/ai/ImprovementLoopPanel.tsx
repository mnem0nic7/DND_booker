import { useEffect, useMemo, useState } from 'react';
import type { ImprovementLoopArtifact, ImprovementLoopWorkspaceRunSummary } from '@dnd-booker/shared';
import { useImprovementLoopStore } from '../../stores/improvementLoopStore';
import { formatRelativeTime } from '../../lib/formatRelativeTime';

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

const ROLE_LABELS = {
  creator: 'Creator',
  designer: 'Designer',
  editor: 'Editor',
  engineer: 'Engineer',
} as const;

const ARTIFACT_GROUPS: Array<{
  key: string;
  label: string;
  types: ImprovementLoopArtifact['artifactType'][];
}> = [
  { key: 'creator', label: 'Creator Outputs', types: ['creator_report'] },
  { key: 'designer', label: 'Designer Outputs', types: ['designer_ux_notes'] },
  { key: 'editor', label: 'Editor Outputs', types: ['editor_final_report'] },
  { key: 'engineer', label: 'Engineer Outputs', types: ['engineering_report', 'engineering_apply_result'] },
];

interface Props {
  title?: string;
  projectId?: string;
  projectTitle?: string;
  previousRun?: ImprovementLoopWorkspaceRunSummary | null;
  onSelectRun?: (run: ImprovementLoopWorkspaceRunSummary) => void;
}

function roleStatusTone(status: string) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  if (status === 'skipped') return 'bg-stone-200 text-stone-600';
  if (status === 'running') return 'bg-sky-100 text-sky-700';
  return 'bg-stone-100 text-stone-600';
}

export function ImprovementLoopPanel({
  title = 'AI Team Run',
  projectId,
  projectTitle,
  previousRun = null,
  onSelectRun,
}: Props) {
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
    if (!projectId) return;
    void fetchLatestRun(projectId);
  }, [projectId, fetchLatestRun]);

  const groupedArtifacts = useMemo(() => {
    const grouped = new Map<string, ImprovementLoopArtifact[]>();
    for (const group of ARTIFACT_GROUPS) {
      grouped.set(group.key, artifacts.filter((artifact) => group.types.includes(artifact.artifactType)));
    }
    return grouped;
  }, [artifacts]);

  if (!currentRun) return null;

  const status = currentRun.status;
  const isActive = ACTIVE_STATUSES.has(status);
  const selectedArtifact = artifacts.find((artifact) => artifact.id === expandedArtifactId) ?? null;

  return (
    <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {isActive && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
            {status === 'completed' && <span className="h-2 w-2 rounded-full bg-green-500" />}
            {status === 'failed' && <span className="h-2 w-2 rounded-full bg-red-500" />}
            {status === 'paused' && <span className="h-2 w-2 rounded-full bg-yellow-500" />}
            <span className="text-sm font-medium text-gray-800">
              {title}: {STAGE_LABELS[currentStage ?? status] ?? currentStage ?? status}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-600">
            {projectTitle ?? currentRun.input.projectTitle ?? 'Selected project'} • {currentRun.mode === 'create_campaign' ? 'Create campaign run' : 'Current project run'}
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>Updated {formatRelativeTime(currentRun.updatedAt)}</div>
          {currentRun.githubPullRequestUrl && (
            <a
              href={currentRun.githubPullRequestUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-medium text-emerald-700 underline hover:text-emerald-900"
            >
              Engineering PR #{currentRun.githubPullRequestNumber}
            </a>
          )}
        </div>
      </div>

      {(isActive || status === 'paused') && (
        <div className="mb-4 h-1.5 w-full rounded-full bg-emerald-100">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${status === 'paused' ? 'bg-yellow-500' : 'bg-emerald-600'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Creator</div>
          <div className="mt-1 text-sm text-gray-800">{currentRun.creatorReport?.summary ?? 'Creator summary pending.'}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Designer</div>
          <div className="mt-1 text-sm text-gray-800">{currentRun.designerUxNotes?.summary ?? 'Designer notes pending.'}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Editor</div>
          <div className="mt-1 text-sm text-gray-800">
            {currentRun.editorFinalReport
              ? `${currentRun.editorFinalReport.overallScore}/100 • ${currentRun.editorFinalReport.recommendation}`
              : 'Editor review pending.'}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Engineer</div>
          <div className="mt-1 text-sm text-gray-800">
            {currentRun.engineeringApplyResult?.message ?? currentRun.engineeringReport?.summary ?? 'Engineering follow-through pending.'}
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Role Lineage</div>
          <div className="grid gap-2">
            {currentRun.roles.map((roleRun) => (
              <div key={roleRun.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-gray-800">{ROLE_LABELS[roleRun.role]}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${roleStatusTone(roleRun.status)}`}>
                    {roleRun.status}
                  </span>
                </div>
                <div className="text-xs text-gray-700">{roleRun.summary ?? roleRun.objective}</div>
                {roleRun.linkedGenerationRunId && (
                  <div className="mt-1 text-[11px] text-gray-500">Generation: {roleRun.linkedGenerationRunId}</div>
                )}
                {roleRun.linkedAgentRunId && (
                  <div className="mt-1 text-[11px] text-gray-500">Agent: {roleRun.linkedAgentRunId}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Editor Final Report</div>
            {currentRun.editorFinalReport ? (
              <>
                <div className="text-sm font-medium text-gray-800">{currentRun.editorFinalReport.summary}</div>
                {currentRun.editorFinalReport.issues.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    {currentRun.editorFinalReport.issues[0]}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600">No editor report yet.</div>
            )}
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Engineering Follow-Through</div>
            {currentRun.engineeringApplyResult ? (
              <>
                <div className="text-sm font-medium text-gray-800">{currentRun.engineeringApplyResult.status}</div>
                <div className="mt-1 text-xs text-gray-600">{currentRun.engineeringApplyResult.message}</div>
              </>
            ) : currentRun.engineeringReport ? (
              <div className="text-sm text-gray-700">{currentRun.engineeringReport.summary}</div>
            ) : (
              <div className="text-sm text-gray-600">No engineering follow-through yet.</div>
            )}
          </div>

          {previousRun && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Previous Run For This Project</div>
              <div className="text-sm font-medium text-stone-900">
                {previousRun.editorScore != null
                  ? `${previousRun.editorScore}/100 • ${previousRun.editorRecommendation ?? 'pending'}`
                  : 'No editor rating recorded'}
              </div>
              <div className="mt-1 text-xs text-stone-500">
                Updated {formatRelativeTime(previousRun.updatedAt)}
              </div>
              {onSelectRun && (
                <button
                  onClick={() => onSelectRun(previousRun)}
                  className="mt-3 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100"
                >
                  View Previous Run
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {isActive && (
          <button
            onClick={() => void pauseRun(currentRun.projectId, currentRun.id)}
            className="rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-200"
          >
            Pause
          </button>
        )}
        {status === 'paused' && (
          <button
            onClick={() => void resumeRun(currentRun.projectId, currentRun.id)}
            className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
          >
            Resume
          </button>
        )}
        {(isActive || status === 'paused') && (
          <button
            onClick={() => void cancelRun(currentRun.projectId, currentRun.id)}
            className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
          >
            Cancel
          </button>
        )}
      </div>

      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-600">Grouped Artifacts</div>
        {isLoadingArtifacts && artifacts.length === 0 ? (
          <div className="text-xs text-gray-500">Loading artifacts...</div>
        ) : artifacts.length === 0 ? (
          <div className="text-xs text-gray-500">No loop artifacts yet.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              {ARTIFACT_GROUPS.map((group) => {
                const groupArtifacts = groupedArtifacts.get(group.key) ?? [];
                return (
                  <div key={group.key} className="rounded-2xl border border-emerald-200 bg-white px-3 py-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      {group.label}
                    </div>
                    {groupArtifacts.length === 0 ? (
                      <div className="text-xs text-gray-500">No artifacts in this group yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {groupArtifacts.map((artifact) => (
                          <button
                            key={artifact.id}
                            onClick={() => setExpandedArtifactId((current) => current === artifact.id ? null : artifact.id)}
                            className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                              expandedArtifactId === artifact.id
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-emerald-100 bg-white hover:bg-emerald-50/50'
                            }`}
                          >
                            <div className="text-xs font-medium text-gray-800">{artifact.title}</div>
                            {artifact.summary && (
                              <div className="mt-1 text-[11px] text-gray-500">{artifact.summary}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
              {selectedArtifact ? (
                <>
                  <div className="mb-2 text-sm font-semibold text-gray-800">{selectedArtifact.title}</div>
                  {selectedArtifact.markdownContent ? (
                    <pre className="max-h-[28rem] whitespace-pre-wrap overflow-y-auto text-[11px] text-gray-600">
                      {selectedArtifact.markdownContent}
                    </pre>
                  ) : selectedArtifact.jsonContent ? (
                    <pre className="max-h-[28rem] whitespace-pre-wrap overflow-y-auto text-[11px] text-gray-600">
                      {JSON.stringify(selectedArtifact.jsonContent, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-[11px] text-gray-500">This artifact has no previewable content.</div>
                  )}
                </>
              ) : (
                <div className="flex h-full min-h-[14rem] items-center justify-center text-center text-sm text-gray-500">
                  Pick an artifact to inspect the creator, designer, editor, or engineer output in detail.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
