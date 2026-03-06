import { useEffect, useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';
import type {
  GeneratedArtifact,
  ArtifactCategory,
  ArtifactStatus,
  ArtifactEvaluation,
  FindingSeverity,
} from '@dnd-booker/shared';
import { ARTIFACT_CATEGORY_MAP } from '@dnd-booker/shared';

const CATEGORY_LABELS: Record<ArtifactCategory, string> = {
  planning: 'Planning',
  reference: 'Reference Assets',
  written: 'Written Content',
  evaluation: 'Evaluations',
  assembly: 'Assembly',
};

const STATUS_STYLES: Record<ArtifactStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-gray-100 text-gray-600' },
  generating: { label: 'Generating', color: 'bg-blue-100 text-blue-700' },
  generated: { label: 'Generated', color: 'bg-blue-100 text-blue-700' },
  evaluating: { label: 'Evaluating', color: 'bg-yellow-100 text-yellow-700' },
  passed: { label: 'Passed', color: 'bg-green-100 text-green-700' },
  failed_evaluation: { label: 'Failed', color: 'bg-red-100 text-red-700' },
  revising: { label: 'Revising', color: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  assembled: { label: 'Assembled', color: 'bg-purple-100 text-purple-700' },
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  major: 'bg-orange-100 text-orange-700 border-orange-200',
  minor: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  informational: 'bg-blue-100 text-blue-700 border-blue-200',
};

interface Props {
  projectId: string;
  runId: string;
}

export function ArtifactReviewPanel({ projectId, runId }: Props) {
  const {
    artifacts,
    isLoadingArtifacts,
    fetchArtifacts,
    artifactDetail,
    selectedArtifactId,
    fetchArtifactDetail,
    selectArtifact,
    evaluations,
    fetchEvaluations,
  } = useGenerationStore();

  const [filterCategory, setFilterCategory] = useState<ArtifactCategory | 'all'>('all');

  useEffect(() => {
    fetchArtifacts(projectId, runId);
    fetchEvaluations(projectId, runId);
  }, [projectId, runId, fetchArtifacts, fetchEvaluations]);

  // Group artifacts by category
  const grouped = artifacts.reduce<Record<string, GeneratedArtifact[]>>((acc, a) => {
    const cat =
      ARTIFACT_CATEGORY_MAP[a.artifactType as keyof typeof ARTIFACT_CATEGORY_MAP] ?? 'written';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  const filteredGroups =
    filterCategory === 'all' ? grouped : { [filterCategory]: grouped[filterCategory] ?? [] };

  // Build evaluation lookup: latest evaluation per artifact
  const evalByArtifact = new Map<string, ArtifactEvaluation>();
  for (const ev of evaluations) {
    const existing = evalByArtifact.get(ev.artifactId);
    if (!existing || ev.artifactVersion > existing.artifactVersion) {
      evalByArtifact.set(ev.artifactId, ev);
    }
  }

  if (isLoadingArtifacts && artifacts.length === 0) {
    return <div className="text-sm text-gray-500 p-3">Loading artifacts...</div>;
  }

  if (artifacts.length === 0) {
    return <div className="text-sm text-gray-500 p-3">No artifacts generated yet.</div>;
  }

  // ── Detail view ──
  if (selectedArtifactId && artifactDetail) {
    const detail = artifactDetail;
    const evaluation =
      detail.evaluations?.[0] ?? evalByArtifact.get(detail.id) ?? null;
    const statusStyle = STATUS_STYLES[detail.status] ?? STATUS_STYLES.queued;

    return (
      <div className="p-3">
        {/* Back button */}
        <button
          onClick={() => selectArtifact(null)}
          className="text-xs text-purple-600 hover:text-purple-800 mb-2 flex items-center gap-1 transition-colors"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to list
        </button>

        {/* Title + status */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{detail.title}</h3>
            <span className="text-xs text-gray-500">
              {detail.artifactType} v{detail.version}
            </span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle.color}`}>
            {statusStyle.label}
          </span>
        </div>

        {/* Summary */}
        {detail.summary && <p className="text-xs text-gray-600 mb-3">{detail.summary}</p>}

        {/* Evaluation card */}
        {evaluation && (
          <div className="border border-gray-200 rounded-lg p-2 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  evaluation.overallScore >= 85
                    ? 'bg-green-500'
                    : evaluation.overallScore >= 70
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
              >
                {Math.round(evaluation.overallScore)}
              </div>
              <span className="text-xs font-medium text-gray-700">
                {evaluation.passed ? 'Passed' : 'Failed'}
              </span>
            </div>

            {/* 5 dimension scores */}
            <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500 mb-2">
              {evaluation.structuralCompleteness != null && (
                <span>Structure: {evaluation.structuralCompleteness}</span>
              )}
              {evaluation.continuityScore != null && (
                <span>Continuity: {evaluation.continuityScore}</span>
              )}
              {evaluation.dndSanity != null && (
                <span>D&D Sanity: {evaluation.dndSanity}</span>
              )}
              {evaluation.editorialQuality != null && (
                <span>Editorial: {evaluation.editorialQuality}</span>
              )}
              {evaluation.publicationFit != null && (
                <span>Pub Fit: {evaluation.publicationFit}</span>
              )}
            </div>

            {/* Findings by severity */}
            {evaluation.findings.length > 0 && (
              <div className="space-y-1">
                {evaluation.findings.map((f, i) => (
                  <div
                    key={i}
                    className={`text-xs px-2 py-1 rounded border ${SEVERITY_COLORS[f.severity]}`}
                  >
                    <span className="font-medium">{f.code}:</span> {f.message}
                    {f.suggestedFix && (
                      <div className="text-[10px] mt-0.5 opacity-80">Fix: {f.suggestedFix}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content preview: markdown */}
        {detail.markdownContent && (
          <div className="border border-gray-200 rounded-lg p-2">
            <div className="text-[10px] font-medium text-gray-500 mb-1">Content Preview</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
              {detail.markdownContent.slice(0, 2000)}
              {detail.markdownContent.length > 2000 && '...'}
            </pre>
          </div>
        )}

        {/* Content preview: JSON fallback */}
        {detail.jsonContent != null && !detail.markdownContent && (
          <div className="border border-gray-200 rounded-lg p-2">
            <div className="text-[10px] font-medium text-gray-500 mb-1">Structured Data</div>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
              {JSON.stringify(detail.jsonContent, null, 2).slice(0, 2000)}
            </pre>
          </div>
        )}

        {/* Metadata footer */}
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
          {detail.pageEstimate != null && <span>{detail.pageEstimate} pages</span>}
          {detail.tokenCount != null && <span>{detail.tokenCount.toLocaleString()} tokens</span>}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Artifacts</h3>
        <span className="text-xs text-gray-500">{artifacts.length} total</span>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1 mb-3 flex-wrap">
        <button
          onClick={() => setFilterCategory('all')}
          className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
            filterCategory === 'all'
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          All
        </button>
        {(['planning', 'reference', 'written'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${
              filterCategory === cat
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {CATEGORY_LABELS[cat]} ({grouped[cat]?.length ?? 0})
          </button>
        ))}
      </div>

      {/* Grouped artifact rows */}
      {Object.entries(filteredGroups).map(([cat, items]) => {
        if (!items || items.length === 0) return null;
        return (
          <div key={cat} className="mb-3">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
              {CATEGORY_LABELS[cat as ArtifactCategory] ?? cat}
            </div>
            <div className="space-y-1">
              {items.map((a) => {
                const statusStyle = STATUS_STYLES[a.status] ?? STATUS_STYLES.queued;
                const ev = evalByArtifact.get(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      selectArtifact(a.id);
                      fetchArtifactDetail(projectId, runId, a.id);
                    }}
                    className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-100 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-gray-700 truncate group-hover:text-purple-700">
                        {a.title}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {a.artifactType} v{a.version}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {ev && (
                        <span
                          className={`text-[10px] font-medium ${
                            ev.overallScore >= 85
                              ? 'text-green-600'
                              : ev.overallScore >= 70
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {Math.round(ev.overallScore)}
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle.color}`}
                      >
                        {statusStyle.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
