import type { WizardGeneratedSection } from '@dnd-booker/shared';

interface Props {
  sections: WizardGeneratedSection[];
  progress: number;
  isStreaming: boolean;
  onStop: () => void;
}

export function WizardGenerating({ sections, progress, isStreaming, onStop }: Props) {
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h4 className="text-sm font-semibold text-gray-700">Generating Adventure</h4>
        <p className="text-xs text-gray-500 mt-1">Creating each section of your adventure...</p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-purple-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 text-center">{progress}% complete</p>

      {/* Section status list */}
      <div className="space-y-1.5">
        {sections.map((section) => (
          <div
            key={section.sectionId}
            className="flex items-center gap-2 bg-white rounded-md border border-gray-200 px-3 py-2"
          >
            {/* Status icon */}
            {section.status === 'generating' && (
              <div className="w-4 h-4 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin flex-shrink-0" />
            )}
            {section.status === 'completed' && (
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {section.status === 'failed' && (
              <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {section.status === 'pending' && (
              <div className="w-4 h-4 border-2 border-gray-200 rounded-full flex-shrink-0" />
            )}

            <span className={`text-xs truncate ${
              section.status === 'completed' ? 'text-gray-700' :
              section.status === 'failed' ? 'text-red-600' :
              section.status === 'generating' ? 'text-purple-600 font-medium' :
              'text-gray-400'
            }`}>
              {section.title}
            </span>
          </div>
        ))}
      </div>

      {isStreaming && (
        <button
          onClick={onStop}
          className="w-full py-2 text-sm font-medium bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
          Stop Generation
        </button>
      )}
    </div>
  );
}
