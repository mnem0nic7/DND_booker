import { useState } from 'react';
import type { WizardQuestion } from '@dnd-booker/shared';

interface Props {
  questions: WizardQuestion[];
  isStreaming: boolean;
  onSubmit: (projectType: string, answers: Record<string, string>) => void;
}

export function WizardQuestionnaire({ questions, isStreaming, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function handleOptionClick(questionId: string, option: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  }

  function handleCustomInput(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function handleSubmit() {
    // Derive projectType from first answer or default
    const projectType = answers[questions[0]?.id] || 'one shot';
    onSubmit(projectType, answers);
  }

  const allAnswered = questions.every((q) => answers[q.id]?.trim());

  if (isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500">Generating questions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h4 className="text-sm font-semibold text-gray-700">Tell me about your adventure</h4>
        <p className="text-xs text-gray-500 mt-1">Answer these questions so I can design the perfect adventure for you</p>
      </div>

      {questions.map((q) => (
        <div key={q.id} className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-medium text-gray-700 mb-2">{q.question}</p>

          {q.options && q.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {q.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleOptionClick(q.id, opt)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    answers[q.id] === opt
                      ? 'bg-purple-100 border-purple-300 text-purple-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-purple-200 hover:text-purple-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          <input
            type="text"
            value={answers[q.id] || ''}
            onChange={(e) => handleCustomInput(q.id, e.target.value)}
            placeholder="Or type your own answer..."
            className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered}
        className="w-full py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Generate Outline
      </button>
    </div>
  );
}
