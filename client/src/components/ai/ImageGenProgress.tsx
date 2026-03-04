import type { ImageGenBatch } from '@dnd-booker/shared';

interface Props {
  batch: ImageGenBatch;
  onDismiss: () => void;
}

export function ImageGenProgress({ batch, onDismiss }: Props) {
  const { jobs, completedCount, totalCount } = batch;
  const isComplete = completedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-lg px-3 py-2.5 text-sm bg-white border border-gray-200 text-gray-800 w-full">
        {/* Title */}
        <div className="mb-2">
          <p className="font-semibold text-purple-700 text-sm">Generating Images</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isComplete
              ? `${completedCount} of ${totalCount} image${totalCount > 1 ? 's' : ''} complete`
              : `Generating ${completedCount + 1} of ${totalCount}...`}
          </p>
        </div>

        {/* Progress bar */}
        {!isComplete && (
          <div className="mb-2">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Per-image rows */}
        <div className="space-y-1">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-2 text-xs py-1">
              {/* Status indicator */}
              {job.status === 'generating' && (
                <div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin flex-shrink-0" />
              )}
              {job.status === 'completed' && (
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {job.status === 'failed' && (
                <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {job.status === 'pending' && (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />
              )}

              {/* Prompt preview */}
              <span
                className={`truncate ${job.status === 'failed' ? 'text-red-600' : 'text-gray-700'}`}
                title={job.prompt}
              >
                {job.prompt.length > 60 ? job.prompt.slice(0, 60) + '\u2026' : job.prompt}
              </span>
            </div>
          ))}
        </div>

        {/* Error details */}
        {jobs.some((j) => j.status === 'failed') && (
          <div className="mt-2 px-2 py-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
            {jobs.filter((j) => j.status === 'failed').map((j) => j.error || 'Generation failed').join('; ')}
          </div>
        )}

        {/* Dismiss button when complete */}
        {isComplete && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <button
              onClick={onDismiss}
              className="w-full py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
