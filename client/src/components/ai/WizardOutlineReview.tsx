import { useState } from 'react';
import type { WizardOutline, WizardOutlineSection } from '@dnd-booker/shared';

interface Props {
  outline: WizardOutline;
  isStreaming: boolean;
  onApprove: (editedOutline: WizardOutline) => void;
  onBack: () => void;
}

export function WizardOutlineReview({ outline, isStreaming, onApprove, onBack }: Props) {
  const [editedOutline, setEditedOutline] = useState<WizardOutline>(outline);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500">Generating adventure outline...</p>
      </div>
    );
  }

  function handleRemoveSection(sectionId: string) {
    setEditedOutline((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
  }

  function handleEditSection(sectionId: string, field: keyof WizardOutlineSection, value: string) {
    setEditedOutline((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId ? { ...s, [field]: value } : s,
      ),
    }));
  }

  function handleMoveSection(sectionId: string, direction: -1 | 1) {
    setEditedOutline((prev) => {
      const sections = [...prev.sections];
      const idx = sections.findIndex((s) => s.id === sectionId);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= sections.length) return prev;
      [sections[idx], sections[newIdx]] = [sections[newIdx], sections[idx]];
      return { ...prev, sections: sections.map((s, i) => ({ ...s, sortOrder: i })) };
    });
  }

  return (
    <div className="space-y-3">
      <div className="text-center mb-3">
        <h4 className="text-sm font-semibold text-gray-700">{editedOutline.adventureTitle}</h4>
        <p className="text-xs text-gray-500 mt-1">{editedOutline.summary}</p>
      </div>

      <p className="text-xs text-gray-400 text-center">Review and edit the outline. Reorder or remove sections as needed.</p>

      <div className="space-y-2">
        {editedOutline.sections.map((section, idx) => (
          <div key={section.id} className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {editingId === section.id ? (
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => handleEditSection(section.id, 'title', e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
                    autoFocus
                    className="w-full text-sm font-medium border border-purple-300 rounded px-2 py-0.5 focus:ring-purple-500 focus:border-purple-500"
                  />
                ) : (
                  <button
                    onClick={() => setEditingId(section.id)}
                    className="text-sm font-medium text-gray-700 hover:text-purple-600 text-left"
                    title="Click to edit"
                  >
                    {idx + 1}. {section.title}
                  </button>
                )}
                <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
                {section.blockHints.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {section.blockHints.map((hint) => (
                      <span
                        key={hint}
                        className="px-1.5 py-0.5 text-[10px] bg-purple-50 text-purple-600 rounded"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => handleMoveSection(section.id, -1)}
                  disabled={idx === 0}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  title="Move up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleMoveSection(section.id, 1)}
                  disabled={idx === editedOutline.sections.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  title="Move down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleRemoveSection(section.id)}
                  className="p-1 text-gray-400 hover:text-red-500"
                  title="Remove section"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onBack}
          className="flex-1 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => onApprove(editedOutline)}
          disabled={editedOutline.sections.length === 0}
          className="flex-1 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          Generate Content
        </button>
      </div>
    </div>
  );
}
