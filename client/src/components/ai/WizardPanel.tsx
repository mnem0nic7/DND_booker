import { useEffect } from 'react';
import { useWizardStore } from '../../stores/wizardStore';
import { WizardQuestionnaire } from './WizardQuestionnaire';
import { WizardGenerating } from './WizardGenerating';
import { WizardReview } from './WizardReview';

interface Props {
  projectId: string;
  onClose: () => void;
  onDocumentsCreated?: () => void;
}

export function WizardPanel({ projectId, onClose, onDocumentsCreated }: Props) {
  const {
    phase,
    questions,
    outline,
    generatedSections,
    progress,
    isStreaming,
    error,
    fetchSession,
    startWizard,
    submitAndGenerate,
    applyToProject,
    cancelWizard,
    stopStreaming,
  } = useWizardStore();

  // Check for existing session on mount
  useEffect(() => {
    fetchSession(projectId);
  }, [projectId, fetchSession]);

  // Start wizard if no phase is set
  useEffect(() => {
    if (phase === null && !isStreaming) {
      startWizard(projectId);
    }
  }, [phase, isStreaming, projectId, startWizard]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      const store = useWizardStore.getState();
      if (store.isStreaming) {
        store.stopStreaming();
      }
    };
  }, []);

  function handleSubmitParameters(projectType: string, answers: Record<string, string>) {
    // Autonomous: submit answers → generate outline → generate all sections → review
    submitAndGenerate(projectId, projectType, answers);
  }

  async function handleApply(sectionIds: string[]) {
    const result = await applyToProject(projectId, sectionIds);
    if (result) {
      onDocumentsCreated?.();
      onClose();
    }
  }

  async function handleCancel() {
    await cancelWizard(projectId);
    onClose();
  }

  // Determine which step indicator is active
  const phaseIndex = phase
    ? ['questionnaire', 'outline', 'generating', 'review'].indexOf(phase)
    : -1;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI Creation Wizard
        </h3>
        <button
          onClick={handleCancel}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          title="Cancel wizard"
        >
          Cancel
        </button>
      </div>

      {/* Phase steps indicator */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 bg-white border-b">
        {(['Questions', 'Outline', 'Generate', 'Review'] as const).map((label, idx) => (
          <div key={label} className="flex items-center gap-1">
            {idx > 0 && (
              <div className={`w-4 h-px ${phaseIndex >= idx ? 'bg-purple-300' : 'bg-gray-200'}`} />
            )}
            <div
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                phaseIndex === idx
                  ? 'bg-purple-600 text-white font-medium'
                  : phaseIndex > idx
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <div className="mb-3 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        {/* Phase: Questionnaire — the only step requiring user input */}
        {phase === 'questionnaire' && (
          <WizardQuestionnaire
            questions={questions}
            isStreaming={isStreaming}
            onSubmit={handleSubmitParameters}
          />
        )}

        {/* Phase: Outline (auto-generated, shown briefly as progress) */}
        {phase === 'outline' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">Designing adventure outline...</p>
            {outline && (
              <div className="mt-4 w-full">
                <p className="text-xs font-medium text-gray-700 text-center mb-1">
                  {outline.adventureTitle}
                </p>
                <p className="text-xs text-gray-500 text-center">{outline.summary}</p>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                  {outline.sections.length} sections planned — generating content...
                </p>
              </div>
            )}
          </div>
        )}

        {/* Phase: Generating — autonomous section generation with progress */}
        {phase === 'generating' && (
          <div className="space-y-4">
            {/* Show outline context during generation */}
            {outline && (
              <div className="bg-white rounded-lg border border-gray-200 p-3 mb-2">
                <p className="text-sm font-medium text-gray-700">{outline.adventureTitle}</p>
                <p className="text-xs text-gray-500 mt-0.5">{outline.summary}</p>
              </div>
            )}
            <WizardGenerating
              sections={generatedSections}
              progress={progress}
              isStreaming={isStreaming}
              onStop={stopStreaming}
            />
          </div>
        )}

        {/* Phase: Review — user reviews and selects sections to insert */}
        {phase === 'review' && (
          <WizardReview
            sections={generatedSections}
            onApply={handleApply}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}
