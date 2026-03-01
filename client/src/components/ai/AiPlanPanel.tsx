import { useState } from 'react';
import type { PlanningState, MemoryItem } from '@dnd-booker/shared';

interface AiPlanPanelProps {
  planningState: PlanningState;
  onForgetFact: (itemId: string) => void;
  onResetPlan: () => void;
  onResetWorkingMemory: () => void;
  onRememberFact: (type: string, content: string) => void;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  in_progress: '◑',
  done: '●',
  blocked: '✕',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-purple-500',
  done: 'text-green-500',
  blocked: 'text-red-400',
};

const TYPE_LABELS: Record<string, string> = {
  preference: 'Pref',
  project_fact: 'Fact',
  constraint: 'Rule',
  decision: 'Dec',
  glossary: 'Term',
};

export function AiPlanPanel({
  planningState,
  onForgetFact,
  onResetPlan,
  onResetWorkingMemory,
  onRememberFact,
}: AiPlanPanelProps) {
  const [rememberInput, setRememberInput] = useState('');
  const [rememberType, setRememberType] = useState<MemoryItem['type']>('project_fact');

  const hasMemory = planningState.workingMemory.length > 0;
  const hasPlan = planningState.taskPlan.length > 0;
  const hasLongTerm = planningState.longTermMemory.length > 0;

  function handleRemember() {
    const text = rememberInput.trim();
    if (!text) return;
    onRememberFact(rememberType, text);
    setRememberInput('');
  }

  return (
    <div className="border-b bg-white max-h-64 overflow-y-auto">
      <div className="px-4 py-2 space-y-3 text-xs">

        {/* Working Memory */}
        {hasMemory && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-gray-600 uppercase tracking-wide" style={{ fontSize: '0.65rem' }}>
                Working Memory
              </span>
              <button
                onClick={onResetWorkingMemory}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Reset working memory"
                aria-label="Reset working memory"
              >
                Reset
              </button>
            </div>
            <ol className="list-decimal list-inside text-gray-600 space-y-0.5">
              {planningState.workingMemory.map((bullet, i) => (
                <li key={i} className="truncate">{bullet}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Task Plan */}
        {hasPlan && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-gray-600 uppercase tracking-wide" style={{ fontSize: '0.65rem' }}>
                Task Plan
              </span>
              <button
                onClick={onResetPlan}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Reset task plan"
                aria-label="Reset task plan"
              >
                Reset
              </button>
            </div>
            <ul className="space-y-0.5">
              {planningState.taskPlan.map((task) => (
                <li key={task.id} className="flex items-start gap-1.5">
                  <span className={`${STATUS_COLORS[task.status]} flex-shrink-0 mt-0.5`}>
                    {STATUS_ICONS[task.status]}
                  </span>
                  <span className={`${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Long-Term Memory */}
        {hasLongTerm && (
          <div>
            <span className="font-semibold text-gray-600 uppercase tracking-wide block mb-1" style={{ fontSize: '0.65rem' }}>
              Remembered Facts
            </span>
            <ul className="space-y-0.5">
              {planningState.longTermMemory.map((item) => (
                <li key={item.id} className="flex items-start gap-1.5 group">
                  <span className="text-purple-400 flex-shrink-0 bg-purple-50 px-1 rounded" style={{ fontSize: '0.6rem' }}>
                    {TYPE_LABELS[item.type] || item.type}
                  </span>
                  <span className="text-gray-700 flex-1 truncate">{item.content}</span>
                  <button
                    onClick={() => onForgetFact(item.id)}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    title="Forget this fact"
                    aria-label="Forget this fact"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Remember input */}
        <div className="flex gap-1.5">
          <select
            value={rememberType}
            onChange={(e) => setRememberType(e.target.value as MemoryItem['type'])}
            className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white text-gray-600"
            aria-label="Memory type"
          >
            <option value="project_fact">Fact</option>
            <option value="preference">Preference</option>
            <option value="constraint">Constraint</option>
            <option value="decision">Decision</option>
            <option value="glossary">Term</option>
          </select>
          <input
            value={rememberInput}
            onChange={(e) => setRememberInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRemember(); }}
            placeholder="Remember a fact..."
            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:ring-purple-500 focus:border-purple-500"
          />
          <button
            onClick={handleRemember}
            disabled={!rememberInput.trim()}
            className="px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50 transition-colors"
            aria-label="Remember fact"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
