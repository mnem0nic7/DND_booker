import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { useAiStore } from '../../stores/aiStore';
import { useDocumentStore } from '../../stores/documentStore';
import { AiMessageBubble } from './AiMessageBubble';
import { AiPlanPanel } from './AiPlanPanel';
import { WizardChatProgress } from './WizardChatProgress';
import type { WizardOutline } from '@dnd-booker/shared';

/**
 * Extract a wizardGenerate outline from an assistant message.
 * The AI outputs it as a ```json block containing { "_wizardGenerate": true, ... }
 */
function extractWizardOutline(content: string): WizardOutline | null {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && parsed._wizardGenerate === true && parsed.adventureTitle && Array.isArray(parsed.sections)) {
        return {
          adventureTitle: parsed.adventureTitle,
          summary: parsed.summary || '',
          sections: parsed.sections.map((s: Record<string, unknown>, idx: number) => ({
            id: String(s.id || `section-${idx + 1}`),
            title: String(s.title || `Section ${idx + 1}`),
            description: String(s.description || ''),
            blockHints: Array.isArray(s.blockHints) ? s.blockHints.map(String) : [],
            sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : idx,
          })),
        };
      }
    } catch { /* not valid JSON */ }
  }
  return null;
}

/** Strip the wizardGenerate JSON block from the visible message text */
function stripWizardBlock(content: string): string {
  // Use the same fence regex as extractWizardOutline — match full ```json...``` blocks
  // and remove any that parse as a _wizardGenerate object
  return content.replace(/```(?:json)?\s*([\s\S]*?)```/g, (match, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim());
      if (parsed && parsed._wizardGenerate === true) return '';
    } catch { /* not valid JSON, keep it */ }
    return match;
  }).trim();
}

/** Strip planning control blocks (_memoryUpdate, _planUpdate, _remember) from display */
function stripPlanningBlocks(content: string): string {
  return content.replace(/```(?:json)?\s*([\s\S]*?)```/g, (match, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim());
      if (parsed && typeof parsed === 'object' && (
        parsed._memoryUpdate || parsed._planUpdate || parsed._remember
      )) {
        return '';
      }
    } catch { /* not valid JSON, keep it */ }
    return match;
  }).trim();
}

interface AiChatPanelProps {
  projectId: string;
  editor: Editor | null;
}

export function AiChatPanel({ projectId, editor }: AiChatPanelProps) {
  const {
    messages,
    isStreaming,
    streamingContent,
    fetchChatHistory,
    sendMessage,
    cancelStream,
    clearChat,
    chatError,
    settings,
    fetchSettings,
    setSettingsModalOpen,
    wizardProgress,
    startWizardFromOutline,
    applyWizardSections,
    cancelWizardGeneration,
    clearWizard,
    planningState,
    forgetFact,
    resetPlan,
    resetWorkingMemory,
    rememberFact,
  } = useAiStore();

  const [input, setInput] = useState('');
  const [insertError, setInsertError] = useState<string | null>(null);
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track which wizard outlines we've already triggered generation for
  const triggeredOutlinesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetchSettings();
    fetchChatHistory(projectId);
  }, [projectId, fetchSettings, fetchChatHistory]);

  // Abort any in-flight AI stream when the panel unmounts
  useEffect(() => {
    return () => {
      const store = useAiStore.getState();
      if (store.isStreaming) {
        store.cancelStream();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, wizardProgress]);

  // Detect wizardGenerate blocks in completed messages and auto-trigger generation
  useEffect(() => {
    if (isStreaming || wizardProgress?.isGenerating) return;

    // Look at the last assistant message for a wizard outline
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    const outline = extractWizardOutline(lastMsg.content);
    if (!outline) return;

    // Don't re-trigger if we already started this one
    const outlineKey = `${outline.adventureTitle}-${outline.sections.length}`;
    if (triggeredOutlinesRef.current.has(outlineKey)) return;
    triggeredOutlinesRef.current.add(outlineKey);

    // Auto-trigger generation from the outline
    startWizardFromOutline(projectId, outline);
  }, [messages, isStreaming, wizardProgress, projectId, startWizardFromOutline]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming || wizardProgress?.isGenerating) return;

    setInput('');
    // All messages go through the normal chat — the AI's system prompt
    // handles creation requests by asking questions first, then outputting
    // a _wizardGenerate block when ready
    await sendMessage(projectId, text);
  }

  function handleInsertBlock(blockType: string, attrs: Record<string, unknown>) {
    if (!editor) return;
    setInsertError(null);
    try {
      editor.chain().focus().insertContent({ type: blockType, attrs }).run();
    } catch (err) {
      console.error('[AI] Failed to insert block:', err);
      setInsertError(`Failed to insert ${blockType}. The generated data may be invalid.`);
    }
  }

  const fetchDocuments = useDocumentStore((s) => s.fetchDocuments);

  const handleApplyWizard = useCallback(async (sectionIds: string[]) => {
    const result = await applyWizardSections(projectId, sectionIds);
    if (result) {
      // Refresh document list so generated content appears in the sidebar/editor
      await fetchDocuments(projectId);
    }
  }, [projectId, applyWizardSections, fetchDocuments]);

  const handleCancelWizard = useCallback(() => {
    if (wizardProgress?.isGenerating) {
      cancelWizardGeneration();
    } else {
      clearWizard();
    }
  }, [wizardProgress, cancelWizardGeneration, clearWizard]);

  const isConfigured = settings?.provider === 'ollama' ? !!settings?.baseUrl : settings?.hasApiKey;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI Assistant
        </h3>
        <div className="flex items-center gap-2">
          {planningState && (planningState.workingMemory.length > 0 || planningState.taskPlan.length > 0 || planningState.longTermMemory.length > 0) && (
            <button
              onClick={() => setShowPlanPanel(!showPlanPanel)}
              className={`text-xs transition-colors ${showPlanPanel ? 'text-purple-600 font-medium' : 'text-gray-400 hover:text-purple-500'}`}
              title="Toggle planning panel"
              aria-label="Toggle planning panel"
            >
              Plan
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Clear all chat history? This cannot be undone.')) {
                  clearChat(projectId);
                  clearWizard();
                  triggeredOutlinesRef.current.clear();
                }
              }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Clear chat history"
              aria-label="Clear chat history"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Plan panel (collapsible) */}
      {showPlanPanel && planningState && (
        <AiPlanPanel
          planningState={planningState}
          onForgetFact={(itemId) => forgetFact(projectId, itemId)}
          onResetPlan={() => resetPlan(projectId)}
          onResetWorkingMemory={() => resetWorkingMemory(projectId)}
          onRememberFact={(type, content) => rememberFact(projectId, type, content)}
        />
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!isConfigured ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Set Up AI Assistant</h4>
            <p className="text-xs text-gray-500 mb-3">
              Add your API key to start chatting about your campaign, generate stat blocks, spells, and more.
            </p>
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Configure AI
            </button>
          </div>
        ) : messages.length === 0 && !isStreaming && !wizardProgress ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-sm text-gray-500 mb-2">Ask me anything about your campaign!</p>
            <div className="space-y-1.5 w-full">
              {[
                'Create a one shot adventure for level 3 players',
                'Create an orc war chief stat block',
                'Design a fire spell for level 3',
                'Generate an NPC tavern keeper',
              ].map((suggestion, i) => (
                <button
                  key={suggestion}
                  onClick={() => sendMessage(projectId, suggestion)}
                  className="block w-full text-left text-xs text-gray-500 bg-white border border-gray-200 rounded-md px-3 py-2 hover:border-purple-300 hover:text-purple-600 hover:shadow-sm transition-all animate-[fadeSlideIn_0.3s_ease-out_both]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              // Strip wizard and planning JSON blocks from display
              const displayContent = msg.role === 'assistant'
                ? stripPlanningBlocks(stripWizardBlock(msg.content))
                : msg.content;

              // Skip rendering if the message was only a wizard block with no other text
              if (msg.role === 'assistant' && !displayContent.trim()) return null;

              return (
                <AiMessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={displayContent}
                  rawContent={msg.role === 'assistant' ? msg.content : undefined}
                  onInsertBlock={handleInsertBlock}
                />
              );
            })}
            {isStreaming && streamingContent && (
              <AiMessageBubble
                role="assistant"
                content={stripPlanningBlocks(streamingContent)}
                isStreaming
                onInsertBlock={handleInsertBlock}
              />
            )}
            {/* Wizard generation progress — shows inline in the chat */}
            {wizardProgress && (
              <WizardChatProgress
                wizardProgress={wizardProgress}
                onApply={handleApplyWizard}
                onCancel={handleCancelWizard}
              />
            )}
          </>
        )}
        {(chatError || insertError) && (
          <div className="mx-1 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
            {chatError || insertError}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {isConfigured && (
        <div className="border-t bg-white px-4 py-3">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your campaign..."
              rows={2}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:ring-purple-500 focus:border-purple-500"
            />
            {isStreaming ? (
              <button
                onClick={cancelStream}
                className="self-end px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                title="Stop generating"
                aria-label="Stop generating"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || wizardProgress?.isGenerating}
                className="self-end px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
