import { useState } from 'react';
import type { WizardProgress } from '../../stores/aiStore';

interface Props {
  wizardProgress: WizardProgress;
  onApply: (sectionIds: string[]) => void;
  onCancel: () => void;
}

export function WizardChatProgress({ wizardProgress, onApply, onCancel }: Props) {
  const { isGenerating, outline, sections, progress, error } = wizardProgress;
  const completedSections = sections.filter((s) => s.status === 'completed');
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);

  // Initialize selected IDs once generation completes
  const effectiveSelected = selectedIds ?? new Set(completedSections.map((s) => s.sectionId));

  function toggleSection(sectionId: string) {
    const prev = effectiveSelected;
    const next = new Set(prev);
    if (next.has(sectionId)) {
      next.delete(sectionId);
    } else {
      next.add(sectionId);
    }
    setSelectedIds(next);
  }

  function handleApply() {
    const ids = completedSections
      .filter((s) => effectiveSelected.has(s.sectionId))
      .map((s) => s.sectionId);
    if (ids.length > 0) {
      onApply(ids);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-lg px-3 py-2.5 text-sm bg-white border border-gray-200 text-gray-800 w-full">
        {/* Title */}
        {outline && (
          <div className="mb-2">
            <p className="font-semibold text-purple-700 text-sm">{outline.adventureTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5">{outline.summary}</p>
          </div>
        )}

        {/* Progress bar */}
        {isGenerating && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Generating sections...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Section list */}
        <div className="space-y-1">
          {sections.map((section) => {
            const isCompleted = section.status === 'completed';
            const isFailed = section.status === 'failed';
            const isInProgress = section.status === 'generating';

            return (
              <div
                key={section.sectionId}
                className="flex items-center gap-2 text-xs py-1"
              >
                {/* Status indicator */}
                {isInProgress && (
                  <div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin flex-shrink-0" />
                )}
                {isCompleted && !isGenerating && (
                  <input
                    type="checkbox"
                    checked={effectiveSelected.has(section.sectionId)}
                    onChange={() => toggleSection(section.sectionId)}
                    className="w-3.5 h-3.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 flex-shrink-0"
                  />
                )}
                {isCompleted && isGenerating && (
                  <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {isFailed && (
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}

                <span className={`${isFailed ? 'text-red-600' : 'text-gray-700'}`}>
                  {section.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-2 px-2 py-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded">
            {error}
          </div>
        )}

        {/* Actions — show after generation completes */}
        {!isGenerating && completedSections.length > 0 && (
          <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
            <button
              onClick={onCancel}
              className="flex-1 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition-colors"
            >
              Dismiss
            </button>
            <button
              onClick={handleApply}
              disabled={effectiveSelected.size === 0}
              className="flex-1 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              Insert {effectiveSelected.size} Section{effectiveSelected.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Stop button during generation */}
        {isGenerating && (
          <div className="mt-2">
            <button
              onClick={onCancel}
              className="w-full py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
            >
              Stop Generating
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
