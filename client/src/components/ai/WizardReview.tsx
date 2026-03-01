import { useState } from 'react';
import type { WizardGeneratedSection } from '@dnd-booker/shared';

interface Props {
  sections: WizardGeneratedSection[];
  onApply: (sectionIds: string[]) => void;
  onCancel: () => void;
}

export function WizardReview({ sections, onApply, onCancel }: Props) {
  const completedSections = sections.filter((s) => s.status === 'completed');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(completedSections.map((s) => s.sectionId)),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleSection(sectionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }

  function handleApply() {
    const ids = completedSections
      .filter((s) => selectedIds.has(s.sectionId))
      .map((s) => s.sectionId);
    if (ids.length > 0) {
      onApply(ids);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-center mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Review Generated Content</h4>
        <p className="text-xs text-gray-500 mt-1">
          Select the sections you want to add to your project
        </p>
      </div>

      <div className="space-y-2">
        {sections.map((section) => {
          const isCompleted = section.status === 'completed';
          const isSelected = selectedIds.has(section.sectionId);
          const isExpanded = expandedId === section.sectionId;

          return (
            <div
              key={section.sectionId}
              className={`rounded-lg border transition-colors ${
                isCompleted
                  ? isSelected
                    ? 'border-purple-300 bg-purple-50/50'
                    : 'border-gray-200 bg-white'
                  : 'border-red-200 bg-red-50/50'
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                {isCompleted ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSection(section.sectionId)}
                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                  />
                ) : (
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}

                <span className={`text-sm flex-1 ${isCompleted ? 'text-gray-700' : 'text-red-600'}`}>
                  {section.title}
                </span>

                {isCompleted && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : section.sectionId)}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {isExpanded ? 'Collapse' : 'Preview'}
                  </button>
                )}

                {!isCompleted && (
                  <span className="text-xs text-red-500">Failed</span>
                )}
              </div>

              {isExpanded && section.markdown && (
                <div className="border-t border-gray-200 px-3 py-2 max-h-48 overflow-y-auto">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
                    {section.markdown.slice(0, 2000)}
                    {section.markdown.length > 2000 ? '\n...(truncated)' : ''}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Discard All
        </button>
        <button
          onClick={handleApply}
          disabled={selectedIds.size === 0}
          className="flex-1 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          Insert {selectedIds.size} Section{selectedIds.size !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}
