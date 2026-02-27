import { create } from 'zustand';
import api, { setAccessToken, getAccessToken } from '../lib/api';
import axios from 'axios';

export type AiProvider = 'anthropic' | 'openai';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks?: unknown;
  createdAt: string;
}

interface AiSettings {
  provider: AiProvider | null;
  model: string | null;
  hasApiKey: boolean;
  supportedModels: Record<AiProvider, string[]>;
}

const STREAM_ERROR_SENTINEL = '\n\n[Response interrupted. Please try again.]';

interface AiState {
  // Settings
  settings: AiSettings | null;
  isLoadingSettings: boolean;
  fetchSettings: () => Promise<void>;
  saveSettings: (provider: AiProvider, model: string, apiKey?: string) => Promise<void>;
  removeApiKey: () => Promise<void>;
  validateKey: (provider: AiProvider, apiKey: string) => Promise<boolean>;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  chatError: string | null;
  isChatPanelOpen: boolean;
  _chatRequestId: number;
  fetchChatHistory: (projectId: string) => Promise<void>;
  sendMessage: (projectId: string, message: string) => Promise<void>;
  clearChat: (projectId: string) => Promise<void>;
  toggleChatPanel: () => void;
  setChatPanelOpen: (open: boolean) => void;

  // Block generation
  isGeneratingBlock: boolean;
  generateBlock: (blockType: string, prompt: string) => Promise<Record<string, unknown> | null>;

  // Auto-fill
  isAutoFilling: boolean;
  autoFillBlock: (blockType: string, currentAttrs: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

  // Settings modal
  isSettingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  // Settings
  settings: null,
  isLoadingSettings: false,

  fetchSettings: async () => {
    set({ isLoadingSettings: true });
    try {
      const { data } = await api.get('/ai/settings');
      set({ settings: data, isLoadingSettings: false });
    } catch (err) {
      console.error('[AI] Failed to fetch settings:', err);
      set({ isLoadingSettings: false });
    }
  },

  saveSettings: async (provider, model, apiKey?) => {
    await api.post('/ai/settings', { provider, model, apiKey });
    await get().fetchSettings();
  },

  removeApiKey: async () => {
    await api.delete('/ai/settings/key');
    await get().fetchSettings();
  },

  validateKey: async (provider, apiKey) => {
    const { data } = await api.post('/ai/settings/validate', { provider, apiKey });
    return data.valid;
  },

  // Chat
  messages: [],
  isStreaming: false,
  streamingContent: '',
  chatError: null,
  isChatPanelOpen: false,
  _chatRequestId: 0,

  fetchChatHistory: async (projectId) => {
    const requestId = get()._chatRequestId + 1;
    set({ _chatRequestId: requestId, messages: [], streamingContent: '', isStreaming: false, chatError: null });
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/chat`);
      // Ignore stale response if project changed while fetching
      if (get()._chatRequestId !== requestId) return;
      set({ messages: data.messages });
    } catch (err) {
      console.error('[AI] Failed to fetch chat history:', err);
      if (get()._chatRequestId === requestId) {
        set({ messages: [] });
      }
    }
  },

  sendMessage: async (projectId, message) => {
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      messages: [...s.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      chatError: null,
    }));

    let retried = false;

    async function doFetch(): Promise<globalThis.Response> {
      const token = getAccessToken();
      return fetch(`/api/projects/${projectId}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
    }

    try {
      let response = await doFetch();

      // One-shot 401 retry
      if (response.status === 401 && !retried) {
        retried = true;
        try {
          const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
          setAccessToken(data.accessToken);
          response = await doFetch();
        } catch {
          set((s) => ({
            messages: s.messages.filter((m) => m.id !== userMessage.id),
            isStreaming: false,
            chatError: 'Session expired. Please log in again.',
          }));
          return;
        }
      }

      if (!response.ok) {
        let errorMsg = 'Chat failed. Please try again.';
        try {
          const err = await response.json();
          errorMsg = err.error || errorMsg;
        } catch { /* use default */ }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        set({ streamingContent: fullContent });
      }

      // Detect mid-stream error sentinel from server
      if (fullContent.endsWith(STREAM_ERROR_SENTINEL)) {
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== userMessage.id),
          isStreaming: false,
          streamingContent: '',
          chatError: 'Response interrupted. Please try again.',
        }));
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `temp-${Date.now()}-assistant`,
        role: 'assistant',
        content: fullContent,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, assistantMessage],
        isStreaming: false,
        streamingContent: '',
      }));
    } catch (err) {
      console.error('[AI] sendMessage failed:', err);
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== userMessage.id),
        isStreaming: false,
        streamingContent: '',
        chatError: err instanceof Error ? err.message : 'Chat failed. Please try again.',
      }));
    }
  },

  clearChat: async (projectId) => {
    try {
      await api.delete(`/projects/${projectId}/ai/chat`);
      set({ messages: [] });
    } catch (err) {
      console.error('[AI] clearChat failed:', err);
      // Don't clear local state since server still has messages
    }
  },

  toggleChatPanel: () => set((s) => ({ isChatPanelOpen: !s.isChatPanelOpen })),
  setChatPanelOpen: (open) => set({ isChatPanelOpen: open }),

  // Block generation
  isGeneratingBlock: false,

  generateBlock: async (blockType, prompt) => {
    set({ isGeneratingBlock: true });
    try {
      const { data } = await api.post('/ai/generate-block', { blockType, prompt });
      return data.attrs;
    } catch (err) {
      console.error('[AI] generateBlock failed:', err);
      return null;
    } finally {
      set({ isGeneratingBlock: false });
    }
  },

  // Auto-fill
  isAutoFilling: false,

  autoFillBlock: async (blockType, currentAttrs) => {
    set({ isAutoFilling: true });
    try {
      const { data } = await api.post('/ai/autofill', { blockType, currentAttrs });
      return data.suggestions;
    } catch (err) {
      console.error('[AI] autoFillBlock failed:', err);
      return null;
    } finally {
      set({ isAutoFilling: false });
    }
  },

  // Settings modal
  isSettingsModalOpen: false,
  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
}));
