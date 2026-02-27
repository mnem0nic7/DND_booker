import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useAiStore } from '../../stores/aiStore';
import { AiMessageBubble } from './AiMessageBubble';

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
    clearChat,
    chatError,
    settings,
    fetchSettings,
    setSettingsModalOpen,
  } = useAiStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSettings();
    fetchChatHistory(projectId);
  }, [projectId, fetchSettings, fetchChatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    await sendMessage(projectId, text);
  }

  function handleInsertBlock(blockType: string, attrs: Record<string, unknown>) {
    if (!editor) return;
    editor.chain().focus().insertContent({ type: blockType, attrs }).run();
  }

  const isConfigured = settings?.hasApiKey;

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
        {messages.length > 0 && (
          <button
            onClick={() => clearChat(projectId)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            title="Clear chat history"
          >
            Clear
          </button>
        )}
      </div>

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
        ) : messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-sm text-gray-500 mb-2">Ask me anything about your campaign!</p>
            <div className="space-y-1.5 w-full">
              {[
                'Create an orc war chief stat block',
                'Design a fire spell for level 3',
                'Generate an NPC tavern keeper',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); }}
                  className="block w-full text-left text-xs text-gray-500 bg-white border border-gray-200 rounded-md px-3 py-2 hover:border-purple-300 hover:text-purple-600 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <AiMessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                onInsertBlock={handleInsertBlock}
              />
            ))}
            {isStreaming && streamingContent && (
              <AiMessageBubble
                role="assistant"
                content={streamingContent}
                isStreaming
                onInsertBlock={handleInsertBlock}
              />
            )}
          </>
        )}
        {chatError && (
          <div className="mx-1 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
            {chatError}
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
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="self-end px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
