import { useState, useEffect } from 'react';
import { useExportStore } from '../../stores/exportStore';

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

export function ExportDialog({ projectId }: ExportDialogProps) {
  const { isOpen, job, isExporting, error, exportHistory, closeDialog, startExport, fetchExportHistory, reset } = useExportStore();
  const [selectedFormat, setSelectedFormat] = useState<string>('pdf');

  useEffect(() => {
    if (isOpen && projectId) {
      fetchExportHistory(projectId);
    }
  }, [isOpen, projectId, fetchExportHistory]);

  if (!isOpen) return null;

  const isJobActive = job && (job.status === 'queued' || job.status === 'processing');
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

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
          {!isJobActive && !isExporting && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4">
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
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="exportFormat"
                      value={option.value}
                      checked={selectedFormat === option.value}
                      onChange={(e) => setSelectedFormat(e.target.value)}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
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
          {isExporting && (
            <div className="text-center py-4">
              <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
              <p className="text-sm text-gray-600">Starting export...</p>
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
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
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
              {job.outputUrl && (
                <a
                  href={`/api/export-jobs/${job.id}/download`}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
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
                    </div>
                    {historyJob.status === 'completed' ? (
                      <a
                        href={`/api/export-jobs/${historyJob.id}/download`}
                        download
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
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
          {!job && !isExporting && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Export
              </button>
            </>
          )}

          {/* Active job: no actions (can't close while exporting) */}
          {(isJobActive || isExporting) && (
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
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
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
