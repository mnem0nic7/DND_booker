import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { useAiStore } from '../../stores/aiStore';
import { useProjectStore } from '../../stores/projectStore';
import { AiMessageBubble } from './AiMessageBubble';
import { AiPlanPanel } from './AiPlanPanel';
import { WizardChatProgress } from './WizardChatProgress';
import { ImageGenProgress } from './ImageGenProgress';
import { collectPageMetrics } from '../../lib/collectPageMetrics';
import type { WizardOutline, DocumentEditOperation, ImageGenerationRequest, ImageTargetInsert, ImageGenJobProgress } from '@dnd-booker/shared';

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

/** Strip planning control blocks (_memoryUpdate, _planUpdate, _remember, _documentEdit) from display */
function stripPlanningBlocks(content: string): string {
  return content.replace(/```(?:json)?\s*([\s\S]*?)```/g, (match, inner: string) => {
    try {
      const parsed = JSON.parse(inner.trim());
      if (parsed && typeof parsed === 'object' && (
        parsed._memoryUpdate || parsed._planUpdate || parsed._remember || parsed._documentEdit || parsed._evaluation || parsed._generateImage
      )) {
        return '';
      }
    } catch { /* not valid JSON, keep it */ }
    return match;
  }).trim();
}

/** Extract a _documentEdit control block from an assistant message. */
function extractDocumentEdit(content: string): { description: string; operations: DocumentEditOperation[] } | null {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && parsed._documentEdit && Array.isArray(parsed.operations)) {
        return {
          description: String(parsed.description || 'Document edited'),
          operations: parsed.operations.filter(
            (op: Record<string, unknown>) =>
              typeof op.op === 'string' && typeof op.nodeIndex === 'number'
          ),
        };
      }
    } catch { /* not valid JSON */ }
  }
  return null;
}

/** Extract a _generateImage control block from an assistant message. */
function extractImageGenBlock(content: string): ImageGenerationRequest[] | null {
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && parsed._generateImage === true && Array.isArray(parsed.images)) {
        return parsed.images
          .filter(
            (img: Record<string, unknown>) =>
              typeof img.id === 'string' &&
              typeof img.prompt === 'string' &&
              typeof img.model === 'string' &&
              typeof img.size === 'string' &&
              img.target && typeof img.target === 'object'
          )
          .slice(0, 4) as ImageGenerationRequest[];
      }
    } catch { /* not valid JSON */ }
  }
  return null;
}

/** Set an image attribute on an existing node by index. */
function applyImageToExistingBlock(editor: Editor, nodeIndex: number, attr: string, url: string): boolean {
  const { state } = editor.view;
  const { doc, tr } = state;
  if (nodeIndex < 0 || nodeIndex >= doc.childCount) return false;

  let pos = 1;
  for (let i = 0; i < nodeIndex; i++) {
    pos += doc.child(i).nodeSize;
  }

  const node = doc.child(nodeIndex);
  tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: url });
  editor.view.dispatch(tr);
  return true;
}

/** Insert a new block with an image after a given node index. */
function insertImageBlock(editor: Editor, target: ImageTargetInsert, url: string): boolean {
  const { state } = editor.view;
  const { doc, schema, tr } = state;
  const refIndex = target.insertAfter;
  if (refIndex < 0 || refIndex >= doc.childCount) return false;

  let pos = 1;
  for (let i = 0; i <= refIndex; i++) {
    pos += doc.child(i).nodeSize;
  }

  try {
    const newNode = schema.nodeFromJSON({
      type: target.blockType,
      attrs: { [target.attr]: url },
    });
    tr.insert(pos, newNode);
    editor.view.dispatch(tr);
    return true;
  } catch (err) {
    console.warn('[AI ImageGen] Failed to insert block:', err);
    return false;
  }
}

/**
 * Execute document edit operations against the TipTap editor.
 * Processes in descending nodeIndex order so earlier indices remain valid.
 * Runs as a single ProseMirror transaction (one undo step).
 */
function executeDocumentEdits(editor: Editor, operations: DocumentEditOperation[]): number {
  if (operations.length === 0) return 0;

  const { state } = editor.view;
  const { doc, schema, tr } = state;
  let applied = 0;

  // Sort by nodeIndex descending so later ops don't shift earlier positions
  const sorted = [...operations].sort((a, b) => b.nodeIndex - a.nodeIndex);

  for (const op of sorted) {
    let resolvedIndex = op.nodeIndex;

    // Bounds check with type-based fallback
    if (resolvedIndex < 0 || resolvedIndex >= doc.childCount) {
      // Try to find the node by targetType if provided
      if (op.targetType) {
        let found = -1;
        for (let i = 0; i < doc.childCount; i++) {
          if (doc.child(i).type.name === op.targetType) {
            found = i;
            break;
          }
        }
        if (found >= 0) {
          console.debug(`[AI DocumentEdit] nodeIndex ${op.nodeIndex} out of bounds, resolved ${op.targetType} to index ${found}`);
          resolvedIndex = found;
        } else {
          console.warn(`[AI DocumentEdit] nodeIndex ${op.nodeIndex} out of bounds and targetType "${op.targetType}" not found (doc has ${doc.childCount} children)`);
          continue;
        }
      } else {
        // No targetType hint — try to infer from node/attrs for updateAttrs/replace ops
        const inferredType = op.node?.type || (op.attrs && op.op === 'updateAttrs' ? undefined : undefined);
        if (!inferredType) {
          console.warn(`[AI DocumentEdit] nodeIndex ${op.nodeIndex} out of bounds (doc has ${doc.childCount} children)`);
          continue;
        }
        let found = -1;
        for (let i = 0; i < doc.childCount; i++) {
          if (doc.child(i).type.name === inferredType) {
            found = i;
            break;
          }
        }
        if (found >= 0) {
          console.debug(`[AI DocumentEdit] nodeIndex ${op.nodeIndex} out of bounds, inferred type "${inferredType}" at index ${found}`);
          resolvedIndex = found;
        } else {
          console.warn(`[AI DocumentEdit] nodeIndex ${op.nodeIndex} out of bounds (doc has ${doc.childCount} children)`);
          continue;
        }
      }
    }

    // Calculate the position of the node at this index.
    // ProseMirror: top-level children start at position 0 in doc.descendants().
    let pos = 0;
    for (let i = 0; i < resolvedIndex; i++) {
      pos += doc.child(i).nodeSize;
    }

    const targetNode = doc.child(resolvedIndex);

    try {
      console.debug(`[AI DocumentEdit] op=${op.op} nodeIndex=${resolvedIndex} type=${targetNode.type.name} pos=${pos}`);
      if (op.op === 'remove') {
        tr.delete(pos, pos + targetNode.nodeSize);
        applied++;
      } else if (op.op === 'replace' && op.node) {
        const newNode = schema.nodeFromJSON(op.node);
        tr.replaceWith(pos, pos + targetNode.nodeSize, newNode);
        applied++;
      } else if (op.op === 'updateAttrs' && op.attrs) {
        // Auto-stringify non-primitive attr values (e.g. entries arrays → JSON strings)
        // Atom blocks store complex data as JSON strings, but AI may send parsed objects
        const normalizedAttrs: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(op.attrs)) {
          normalizedAttrs[key] =
            typeof value === 'object' && value !== null
              ? JSON.stringify(value)
              : value;
        }
        console.debug('[AI DocumentEdit] updateAttrs on', targetNode.type.name, 'at nodeIndex', resolvedIndex, normalizedAttrs);
        tr.setNodeMarkup(pos, undefined, { ...targetNode.attrs, ...normalizedAttrs });
        applied++;
      } else if (op.op === 'insertBefore' && op.node) {
        const newNode = schema.nodeFromJSON(op.node);
        tr.insert(pos, newNode);
        applied++;
      } else if (op.op === 'insertAfter' && op.node) {
        const newNode = schema.nodeFromJSON(op.node);
        tr.insert(pos + targetNode.nodeSize, newNode);
        applied++;
      } else {
        console.warn('[AI DocumentEdit] Unhandled operation:', JSON.stringify(op));
      }
    } catch (err) {
      console.warn('[AI] Skipping invalid document edit operation:', op, err);
    }
  }

  if (applied > 0) {
    editor.view.dispatch(tr);
  }

  return applied;
}

// --- Module-level tracking sets (persist across component unmount/remount) ---
// Keyed by projectId so switching projects resets correctly.
let _trackedProjectId = '';
const _triggeredOutlines = new Set<string>();
const _appliedEdits = new Set<number>();
const _processedImageGens = new Set<number>();

function resetTrackingSets(projectId: string) {
  if (projectId !== _trackedProjectId) {
    _trackedProjectId = projectId;
    _triggeredOutlines.clear();
    _appliedEdits.clear();
    _processedImageGens.clear();
  }
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
    imageGenBatch,
    clearImageGenBatch,
    generateImage,
  } = useAiStore();

  const [input, setInput] = useState('');
  const [insertError, setInsertError] = useState<string | null>(null);
  const [showPlanPanel, setShowPlanPanel] = useState(false);
  const [editBanner, setEditBanner] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset module-level tracking sets when project changes
  resetTrackingSets(projectId);

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
  }, [messages, streamingContent, wizardProgress, imageGenBatch]);

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
    if (_triggeredOutlines.has(outlineKey)) return;
    _triggeredOutlines.add(outlineKey);

    // Auto-trigger generation from the outline
    startWizardFromOutline(projectId, outline);

    // Strip the wizard block from the stored message so it can't re-trigger
    // (e.g. on panel close/reopen before fetchChatHistory replaces messages)
    const lastIdx = messages.length - 1;
    useAiStore.setState((s) => ({
      messages: s.messages.map((m, i) =>
        i === lastIdx && m.role === 'assistant'
          ? { ...m, content: stripWizardBlock(m.content) }
          : m,
      ),
    }));
  }, [messages, isStreaming, wizardProgress, projectId, startWizardFromOutline]);

  // Auto-execute _documentEdit blocks when streaming completes
  useEffect(() => {
    if (isStreaming || !editor) return;

    const lastIdx = messages.length - 1;
    if (lastIdx < 0) return;
    const lastMsg = messages[lastIdx];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    if (_appliedEdits.has(lastIdx)) return;

    const edit = extractDocumentEdit(lastMsg.content);
    if (!edit || edit.operations.length === 0) {
      console.debug('[AI DocumentEdit] No _documentEdit block found in last assistant message');
      return;
    }

    console.debug('[AI DocumentEdit] Applying', edit.operations.length, 'ops:', edit.description);
    _appliedEdits.add(lastIdx);
    const count = executeDocumentEdits(editor, edit.operations);
    console.debug('[AI DocumentEdit] Applied', count, 'of', edit.operations.length);
    if (count > 0) {
      setEditBanner(`${edit.description} (${count} operation${count > 1 ? 's' : ''} applied)`);
      setTimeout(() => setEditBanner(null), 5000);
    }
  }, [messages, isStreaming, editor]);

  // Auto-process _generateImage blocks when streaming completes
  useEffect(() => {
    if (isStreaming || !editor || !settings?.provider) return;

    const lastIdx = messages.length - 1;
    if (lastIdx < 0) return;
    const lastMsg = messages[lastIdx];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    if (_processedImageGens.has(lastIdx)) return;

    const images = extractImageGenBlock(lastMsg.content);
    if (!images || images.length === 0) return;

    // Only process if user has OpenAI configured (image gen requires it)
    if (settings.provider !== 'openai') return;

    _processedImageGens.add(lastIdx);

    // Initialize batch state
    const initialJobs: ImageGenJobProgress[] = images.map((img) => ({
      id: img.id,
      prompt: img.prompt,
      status: 'pending' as const,
      target: img.target,
    }));

    useAiStore.setState({
      imageGenBatch: { jobs: initialJobs, completedCount: 0, totalCount: images.length },
    });

    // Process images sequentially
    (async () => {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];

        // Mark as generating
        useAiStore.setState((s) => {
          if (!s.imageGenBatch) return {};
          const jobs = s.imageGenBatch.jobs.map((j) =>
            j.id === img.id ? { ...j, status: 'generating' as const } : j
          );
          return { imageGenBatch: { ...s.imageGenBatch, jobs } };
        });

        try {
          const url = await generateImage(projectId, img.prompt, img.model, img.size);

          if (url && editor) {
            // Apply to editor
            const isInsert = 'insertAfter' in img.target;
            if (isInsert) {
              insertImageBlock(editor, img.target as ImageTargetInsert, url);
            } else {
              const t = img.target as { nodeIndex: number; attr: string };
              applyImageToExistingBlock(editor, t.nodeIndex, t.attr, url);
            }
          }

          // Mark completed or failed
          useAiStore.setState((s) => {
            if (!s.imageGenBatch) return {};
            const jobs = s.imageGenBatch.jobs.map((j) =>
              j.id === img.id
                ? { ...j, status: (url ? 'completed' : 'failed') as 'completed' | 'failed', url: url || undefined, error: url ? undefined : 'Generation failed' }
                : j
            );
            const completedCount = jobs.filter((j) => j.status === 'completed' || j.status === 'failed').length;
            return { imageGenBatch: { ...s.imageGenBatch, jobs, completedCount } };
          });
        } catch (err) {
          useAiStore.setState((s) => {
            if (!s.imageGenBatch) return {};
            const jobs = s.imageGenBatch.jobs.map((j) =>
              j.id === img.id
                ? { ...j, status: 'failed' as const, error: err instanceof Error ? err.message : 'Generation failed' }
                : j
            );
            const completedCount = jobs.filter((j) => j.status === 'completed' || j.status === 'failed').length;
            return { imageGenBatch: { ...s.imageGenBatch, jobs, completedCount } };
          });
        }
      }
    })();
  }, [messages, isStreaming, editor, settings, projectId, generateImage]);

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

  const fetchProject = useProjectStore((s) => s.fetchProject);

  const handleApplyWizard = useCallback(async (sectionIds: string[]) => {
    const result = await applyWizardSections(projectId, sectionIds);
    if (result) {
      // Refresh project so generated content appears in the editor
      await fetchProject(projectId);
    }
  }, [projectId, applyWizardSections, fetchProject]);

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
                  clearImageGenBatch();
                  _triggeredOutlines.clear();
                  _processedImageGens.clear();
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
            {imageGenBatch && (
              <ImageGenProgress
                batch={imageGenBatch}
                onDismiss={clearImageGenBatch}
              />
            )}
          </>
        )}
        {editBanner && (
          <div className="mx-1 px-3 py-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {editBanner}
          </div>
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
          {messages.length > 0 && !isStreaming && !wizardProgress?.isGenerating && (
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => {
                  const metrics = editor ? collectPageMetrics(editor) : undefined;
                  sendMessage(
                    projectId,
                    'Please evaluate my entire document for content quality and formatting. Review pacing, completeness, D&D best practices, block placement, and page balance.',
                    metrics,
                  );
                }}
                className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition-all"
              >
                Evaluate Document
              </button>
            </div>
          )}
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
