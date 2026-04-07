import { useState, useEffect } from 'react';
import type { ExportFormat, ExportReview, ExportReviewCode, ExportReviewFinding } from '@dnd-booker/shared';
import { useExportStore } from '../../stores/exportStore';
import { useProjectStore } from '../../stores/projectStore';
import { v1Client } from '../../lib/api';
import {
  formatExportReviewFixChange,
  getExportReviewFindingDocumentTitle,
  getTextLayoutParityScopeLabels,
  splitExportReviewFindings,
} from '../../lib/exportReview';

interface ExportDialogProps {
  projectId: string;
}

const FORMAT_OPTIONS = [
  {
    value: 'pdf',
    label: 'PDF',
    description: 'Standard PDF for digital viewing and sharing',
  },
  {
    value: 'print_pdf',
    label: 'Print-Ready PDF',
    description: 'High-resolution PDF with bleed marks for professional printing',
  },
  {
    value: 'epub',
    label: 'ePub',
    description: 'E-book format for readers like Kindle and Kobo',
  },
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getReviewBadgeClasses(review: ExportReview | null): string {
  if (!review) return 'bg-gray-100 text-gray-600';
  if (review.status === 'passed') return 'bg-green-100 text-green-700';
  if (review.status === 'needs_attention') return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function getReviewLabel(review: ExportReview | null): string {
  if (!review) return 'No review';
  if (review.status === 'passed') return 'Looks good';
  if (review.status === 'needs_attention') return 'Needs attention';
  return 'Review unavailable';
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  return `${Math.round(value * 100)}%`;
}

const SAFE_FIXABLE_CODES = new Set<ExportReviewCode>([
  'EXPORT_CHAPTER_OPENER_LOW',
  'EXPORT_SECTION_TITLE_WRAP',
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_UNUSED_PAGE_REGION',
  'EXPORT_MISSED_ART_OPPORTUNITY',
  'EXPORT_WEAK_HERO_PLACEMENT',
  'EXPORT_SPLIT_SCENE_PACKET',
  'EXPORT_UNBALANCED_COLUMNS',
  'EXPORT_MARGIN_COLLISION',
  'EXPORT_FOOTER_COLLISION',
  'EXPORT_ORPHAN_TAIL_PARAGRAPH',
  'EXPORT_EMPTY_ENCOUNTER_TABLE',
  'EXPORT_EMPTY_RANDOM_TABLE',
  'EXPORT_PLACEHOLDER_STAT_BLOCK',
  'EXPORT_OVERSIZED_DISPLAY_HEADING',
  'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
  'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
]);

function formatSignedDelta(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : String(value);
}

function renderFindingContext(finding: ExportReviewFinding) {
  const title = getExportReviewFindingDocumentTitle(finding);
  const scopeLabels = getTextLayoutParityScopeLabels(finding);

  if (!title && scopeLabels.length === 0) return null;

  return (
    <div className="mt-1 space-y-1 text-[11px] text-amber-900">
      {title && <div>Document: {title}</div>}
      {scopeLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {scopeLabels.slice(0, 3).map((label) => (
            <span key={label} className="rounded-full border border-amber-200 bg-white/80 px-1.5 py-0.5">
              {label}
            </span>
          ))}
          {scopeLabels.length > 3 && (
            <span className="rounded-full border border-amber-200 bg-white/80 px-1.5 py-0.5">
              +{scopeLabels.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function ExportDialog({ projectId }: ExportDialogProps) {
  const {
    isOpen,
    job,
    isExporting,
    isApplyingFixes,
    error,
    fixSummary,
    fixChanges,
    exportHistory,
    closeDialog,
    startExport,
    applyReviewFixes,
    fetchExportHistory,
    reset,
  } = useExportStore();
  const { documents, loadDocument } = useProjectStore();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');

  useEffect(() => {
    if (isOpen && projectId) {
      fetchExportHistory(projectId);
    }
  }, [isOpen, projectId, fetchExportHistory]);

  if (!isOpen) return null;

  const isJobActive = job && (job.status === 'queued' || job.status === 'processing');
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';
  const isBusy = Boolean(isJobActive || isExporting || isApplyingFixes);
  const fixableFindingCount = job?.review
    ? job.review.findings.filter((finding) => SAFE_FIXABLE_CODES.has(finding.code)).length
    : 0;

  const handleExport = () => {
    startExport(projectId, selectedFormat);
  };

  const handleClose = () => {
    reset();
    closeDialog();
  };

  const handleNewExport = () => {
    reset();
  };

  const handleApplyFixes = () => {
    if (!job) return;
    applyReviewFixes(projectId, job.id);
  };

  const handleOpenAffectedDocument = async (finding: ExportReviewFinding) => {
    const title = getExportReviewFindingDocumentTitle(finding);
    if (!title) return;
    const matchingDoc = documents.find((document) => document.title === title);
    if (!matchingDoc) return;
    await loadDocument(projectId, matchingDoc.id);
    handleClose();
  };

  const handleDownload = (e: React.MouseEvent, jobId: string, format: string) => {
    e.preventDefault();
    v1Client.exports.downloadExportJob({ jobId })
      .then((data) => {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export.${format === 'epub' ? 'epub' : 'pdf'}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch((err) => console.error('[Export] Download failed:', err));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={!isJobActive && !isExporting ? handleClose : undefined}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Export Project</h2>
          {!isBusy && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
              aria-label="Close export dialog"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {fixSummary && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-sm text-blue-900">{fixSummary}</p>
              {fixChanges.length > 0 && (
                <div className="mt-2 space-y-1">
                  {fixChanges.slice(0, 4).map((change, index) => (
                    <p key={`${change.action}-${change.title ?? 'none'}-${index}`} className="text-xs text-blue-800">
                      {formatExportReviewFixChange(change)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Format selection (only when no active job) */}
          {!job && !isExporting && (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Choose an export format for your project.
              </p>
              <div className="space-y-2">
                {FORMAT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedFormat === option.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      value={option.value}
                      checked={selectedFormat === option.value}
                      onChange={() => setSelectedFormat(option.value)}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Exporting state (POST in progress) */}
          {(isExporting || isApplyingFixes) && (
            <div className="text-center py-4">
              <div className="inline-block w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-3" />
              <p className="text-sm text-gray-600">{isApplyingFixes ? 'Applying safe fixes...' : 'Starting export...'}</p>
            </div>
          )}

          {/* Job in progress (queued or processing) */}
          {isJobActive && (
            <div className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {job.status === 'queued' ? 'Queued...' : 'Processing...'}
                </span>
                <span className="text-sm text-gray-500">{job.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                This may take a few moments depending on the size of your project.
              </p>
            </div>
          )}

          {/* Completed */}
          {isCompleted && (
            <div className="py-4 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">Export Complete</p>
              <p className="text-xs text-gray-500 mb-4">
                Your {FORMAT_OPTIONS.find((f) => f.value === job.format)?.label || job.format} file is ready.
              </p>
              {job.review && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-left">
                  {(() => {
                    const { parityFindings, generalFindings } = splitExportReviewFindings(job.review!);
                    const parityMetrics = job.review?.metrics.textLayoutParity;
                    return (
                      <>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Export Review</p>
                      <p className="text-xs text-gray-500">{job.review.summary}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{job.review.score}/100</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${getReviewBadgeClasses(job.review)}`}>
                        {getReviewLabel(job.review)}
                      </span>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
                    <span>{job.review.metrics.pageCount} pages</span>
                    <span>Review passes: {job.review.passCount}</span>
                    {formatPercent(job.review.metrics.lastPageFillRatio) && (
                      <span>Last page fill: {formatPercent(job.review.metrics.lastPageFillRatio)}</span>
                    )}
                  </div>
                  {job.review.appliedFixes.length > 0 && (
                    <p className="mb-2 text-[11px] text-gray-500">
                      Auto-fixes applied: {job.review.appliedFixes.join(', ')}
                    </p>
                  )}
                  {parityMetrics && (
                    <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2">
                      <div className="mb-2 text-xs font-semibold text-purple-900">Text layout parity</div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-purple-900">
                        <span>Mode: {parityMetrics.mode}</span>
                        <span>Pages: {parityMetrics.legacyPageCount} legacy / {parityMetrics.enginePageCount} engine</span>
                        <span>Supported units: {parityMetrics.supportedUnitCount}</span>
                        <span>Unsupported units: {parityMetrics.unsupportedUnitCount}</span>
                        <span>Height delta: {formatSignedDelta(Math.round(parityMetrics.totalHeightDeltaPx))} px</span>
                        <span>Drift scopes: {parityMetrics.driftScopeIds.length}</span>
                      </div>
                      {(parityMetrics.unsupportedScopeIds.length > 0 || parityMetrics.driftScopeIds.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                          {parityMetrics.driftScopeIds.length > 0 && (
                            <span className="rounded-full border border-purple-200 bg-white/80 px-1.5 py-0.5 text-purple-900">
                              {parityMetrics.driftScopeIds.length} attributed scope{parityMetrics.driftScopeIds.length === 1 ? '' : 's'}
                            </span>
                          )}
                          {parityMetrics.unsupportedScopeIds.length > 0 && (
                            <span className="rounded-full border border-purple-200 bg-white/80 px-1.5 py-0.5 text-purple-900">
                              {parityMetrics.unsupportedScopeIds.length} unsupported scope{parityMetrics.unsupportedScopeIds.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {parityFindings.length > 0 && (
                    <div className="mb-3">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-purple-700">Text layout parity findings</div>
                      <div className="space-y-1.5">
                        {parityFindings.slice(0, 4).map((finding, index) => (
                          <div key={`${finding.code}-${finding.page ?? 'none'}-${index}`} className="rounded border border-purple-200 bg-purple-50 px-2 py-1.5">
                            <p className="text-xs font-medium text-purple-900">{finding.code}</p>
                            <p className="text-xs text-purple-800">{finding.message}</p>
                            {renderFindingContext(finding)}
                            {getExportReviewFindingDocumentTitle(finding) && documents.some((document) => document.title === getExportReviewFindingDocumentTitle(finding)) && (
                              <button
                                onClick={() => handleOpenAffectedDocument(finding)}
                                className="mt-2 text-[11px] font-medium text-purple-900 underline underline-offset-2 hover:text-purple-700"
                              >
                                Open affected document
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {generalFindings.length > 0 ? (
                    <div className="space-y-1.5">
                      {generalFindings.slice(0, 4).map((finding, index) => (
                        <div key={`${finding.code}-${finding.page ?? 'none'}-${index}`} className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
                          <p className="text-xs font-medium text-amber-900">
                            {finding.page ? `Page ${finding.page}` : 'Export'}
                          </p>
                          <p className="text-xs text-amber-800">{finding.message}</p>
                          {getExportReviewFindingDocumentTitle(finding) && documents.some((document) => document.title === getExportReviewFindingDocumentTitle(finding)) && (
                            <button
                              onClick={() => handleOpenAffectedDocument(finding)}
                              className="mt-2 text-[11px] font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700"
                            >
                              Open affected document
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-green-700">
                      {parityFindings.length > 0
                        ? 'No non-parity export-layout issues were detected in the final PDF.'
                        : 'No export-layout issues were detected in the final PDF.'}
                    </p>
                  )}
                  {job.review.findings.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {fixableFindingCount > 0 && (
                        <button
                          onClick={handleApplyFixes}
                          disabled={isApplyingFixes}
                          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isApplyingFixes ? 'Applying fixes...' : 'Apply Safe Fixes & Re-export'}
                        </button>
                      )}
                      {job.review.findings.length > fixableFindingCount && (
                        <p className="text-[11px] text-gray-500">
                          Some issues still require manual editing in the affected document.
                        </p>
                      )}
                    </div>
                  )}
                      </>
                    );
                  })()}
                </div>
              )}
              {job.outputUrl && (
                <a
                  href={`/api/v1/export-jobs/${job.id}/download`}
                  onClick={(e) => handleDownload(e, job.id, job.format)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </a>
              )}
            </div>
          )}

          {/* Failed */}
          {isFailed && (
            <div className="py-4 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1">Export Failed</p>
              <p className="text-xs text-red-500 mb-4">
                {error || 'An unexpected error occurred during export.'}
              </p>
            </div>
          )}

          {/* Error from starting export (not a job failure) */}
          {error && !job && !isExporting && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Export history */}
          {!job && !isExporting && exportHistory.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Exports</h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {exportHistory.slice(0, 5).map((historyJob) => (
                  <div key={historyJob.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">
                        {FORMAT_OPTIONS.find((f) => f.value === historyJob.format)?.label || historyJob.format}
                      </span>
                      <span className="text-gray-400">{formatDate(historyJob.createdAt)}</span>
                      {historyJob.review && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getReviewBadgeClasses(historyJob.review)}`}>
                          {getReviewLabel(historyJob.review)}
                        </span>
                      )}
                    </div>
                    {historyJob.status === 'completed' ? (
                      <a
                        href={`/api/v1/export-jobs/${historyJob.id}/download`}
                        onClick={(e) => handleDownload(e, historyJob.id, historyJob.format)}
                        className="text-purple-600 hover:text-purple-800 font-medium"
                      >
                        Download
                      </a>
                    ) : (
                      <span className={`${historyJob.status === 'failed' ? 'text-red-500' : 'text-gray-400'}`}>
                        {historyJob.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
          {/* Initial state: Cancel + Export */}
          {!job && !isExporting && !isApplyingFixes && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                Export
              </button>
            </>
          )}

          {/* Active job: no actions (can't close while exporting) */}
          {(isJobActive || isExporting || isApplyingFixes) && (
            <p className="text-xs text-gray-400">Please wait while your export is being generated.</p>
          )}

          {/* Completed or failed: Close + optionally Export Again */}
          {(isCompleted || isFailed) && (
            <>
              <button
                onClick={handleNewExport}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
              >
                Export Again
              </button>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
