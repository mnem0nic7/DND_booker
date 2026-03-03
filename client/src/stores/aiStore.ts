import { create } from 'zustand';
import api, { setAccessToken, getAccessToken } from '../lib/api';
import axios from 'axios';
import type { WizardEvent, WizardGeneratedSection, WizardOutline, PlanningState, PageMetricsSnapshot } from '@dnd-booker/shared';

export type AiProvider = 'anthropic' | 'openai' | 'ollama';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks?: unknown;
  createdAt: string;
}

export interface WizardProgress {
  isGenerating: boolean;
  outline: WizardOutline | null;
  sections: WizardGeneratedSection[];
  progress: number;
  error: string | null;
}

interface AiSettings {
  provider: AiProvider | null;
  model: string | null;
  hasApiKey: boolean;
  baseUrl: string | null;
  supportedModels: Record<AiProvider, string[]>;
}

const STREAM_ERROR_SENTINEL = '\n\n[Response interrupted. Please try again.]';

/** Active stream abort controller — allows cancelling in-flight SSE requests. */
let _streamAbortController: AbortController | null = null;
let _wizardAbortController: AbortController | null = null;

interface AiState {
  // Settings
  settings: AiSettings | null;
  isLoadingSettings: boolean;
  fetchSettings: () => Promise<void>;
  saveSettings: (provider: AiProvider, model: string, apiKey?: string, baseUrl?: string) => Promise<void>;
  removeApiKey: () => Promise<void>;
  validateKey: (provider: AiProvider, apiKey: string) => Promise<boolean>;
  validateOllama: (baseUrl: string) => Promise<{ valid: boolean; models: string[] }>;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  chatError: string | null;
  _chatRequestId: number;
  fetchChatHistory: (projectId: string) => Promise<void>;
  sendMessage: (projectId: string, message: string, pageMetrics?: PageMetricsSnapshot) => Promise<void>;
  cancelStream: () => void;
  clearChat: (projectId: string) => Promise<void>;

  // Block generation
  _generatingCount: number;
  isGeneratingBlock: boolean;
  generateBlock: (blockType: string, prompt: string) => Promise<Record<string, unknown> | null>;

  // Auto-fill
  _autoFillCount: number;
  isAutoFilling: boolean;
  autoFillBlock: (blockType: string, currentAttrs: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

  // Wizard (autonomous creation)
  wizardProgress: WizardProgress | null;
  startWizardFromOutline: (projectId: string, outline: WizardOutline) => Promise<void>;
  applyWizardSections: (projectId: string, sectionIds: string[]) => Promise<{ project: unknown } | null>;
  cancelWizardGeneration: () => void;
  clearWizard: () => void;

  // Planning state
  planningState: PlanningState | null;
  fetchPlanningState: (projectId: string) => Promise<void>;
  rememberFact: (projectId: string, type: string, content: string) => Promise<void>;
  forgetFact: (projectId: string, itemId: string) => Promise<void>;
  resetPlan: (projectId: string) => Promise<void>;
  resetWorkingMemory: (projectId: string) => Promise<void>;

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
      set({ isLoadingSettings: false, chatError: 'Failed to load AI settings.' });
    }
  },

  saveSettings: async (provider, model, apiKey?, baseUrl?) => {
    try {
      await api.post('/ai/settings', { provider, model, apiKey, baseUrl });
      await get().fetchSettings();
    } catch (err) {
      console.error('[AI] Failed to save settings:', err);
      throw err; // Re-throw so the modal can show the error
    }
  },

  removeApiKey: async () => {
    try {
      await api.delete('/ai/settings/key');
      await get().fetchSettings();
    } catch (err) {
      console.error('[AI] Failed to remove API key:', err);
      throw err; // Re-throw so the modal can show the error
    }
  },

  validateKey: async (provider, apiKey) => {
    const { data } = await api.post('/ai/settings/validate', { provider, apiKey });
    return data.valid;
  },

  validateOllama: async (baseUrl) => {
    const { data } = await api.post('/ai/settings/validate-ollama', { baseUrl });
    return data;
  },

  // Chat
  messages: [],
  isStreaming: false,
  streamingContent: '',
  chatError: null,
  _chatRequestId: 0,

  fetchChatHistory: async (projectId) => {
    // Atomic increment via updater to prevent race when called rapidly
    let requestId = 0;
    set((s) => {
      requestId = s._chatRequestId + 1;
      return { _chatRequestId: requestId, messages: [], streamingContent: '', isStreaming: false, chatError: null };
    });
    try {
      const [chatRes, stateRes] = await Promise.all([
        api.get(`/projects/${projectId}/ai/chat`),
        api.get(`/projects/${projectId}/ai/state`).catch(() => null),
      ]);
      // Ignore stale response if project changed while fetching
      if (get()._chatRequestId !== requestId) return;
      set({
        messages: chatRes.data.messages,
        planningState: stateRes?.data ?? null,
      });
    } catch (err) {
      console.error('[AI] Failed to fetch chat history:', err);
      if (get()._chatRequestId === requestId) {
        set({ messages: [], chatError: 'Failed to load chat history.' });
      }
    }
  },

  sendMessage: async (projectId, message, pageMetrics?) => {
    // Abort any in-flight stream before starting a new one
    _streamAbortController?.abort();
    const abortController = new AbortController();
    _streamAbortController = abortController;

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
        body: JSON.stringify({ message, ...(pageMetrics ? { pageMetrics } : {}) }),
        signal: abortController.signal,
      });
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

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

      reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      const MAX_STREAM_SIZE = 2 * 1024 * 1024; // 2MB safety limit

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullContent += chunk;
          if (fullContent.length > MAX_STREAM_SIZE) {
            console.warn('[AI] Stream exceeded max size, truncating');
            break;
          }
          set({ streamingContent: fullContent });
        }
      } finally {
        reader.releaseLock();
      }

      // Detect mid-stream error sentinel from server
      if (fullContent.trimEnd().endsWith(STREAM_ERROR_SENTINEL.trimEnd())) {
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

      // Refresh planning state (control blocks may have updated it server-side)
      void get().fetchPlanningState(projectId);
    } catch (err) {
      // Don't show error for intentional aborts (user navigated away or sent new message)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('[AI] sendMessage failed:', err);
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== userMessage.id),
        isStreaming: false,
        streamingContent: '',
        chatError: err instanceof Error ? err.message : 'Chat failed. Please try again.',
      }));
    } finally {
      if (_streamAbortController === abortController) {
        _streamAbortController = null;
      }
    }
  },

  cancelStream: () => {
    _streamAbortController?.abort();
    _streamAbortController = null;
    set({ isStreaming: false, streamingContent: '' });
  },

  clearChat: async (projectId) => {
    try {
      await Promise.all([
        api.delete(`/projects/${projectId}/ai/chat`),
        api.post(`/projects/${projectId}/ai/memory/reset`).catch(() => {}),
        api.post(`/projects/${projectId}/ai/plan/reset`).catch(() => {}),
      ]);
      set({ messages: [], chatError: null, planningState: null });
    } catch (err) {
      console.error('[AI] clearChat failed:', err);
      set({ chatError: 'Failed to clear chat history.' });
    }
  },

  // Block generation
  _generatingCount: 0,
  isGeneratingBlock: false,

  generateBlock: async (blockType, prompt) => {
    set((s) => ({ _generatingCount: s._generatingCount + 1, isGeneratingBlock: true }));
    try {
      const { data } = await api.post('/ai/generate-block', { blockType, prompt });
      return data.attrs;
    } catch (err) {
      console.error('[AI] generateBlock failed:', err);
      return null;
    } finally {
      set((s) => {
        const count = s._generatingCount - 1;
        return { _generatingCount: count, isGeneratingBlock: count > 0 };
      });
    }
  },

  // Auto-fill
  _autoFillCount: 0,
  isAutoFilling: false,

  autoFillBlock: async (blockType, currentAttrs) => {
    set((s) => ({ _autoFillCount: s._autoFillCount + 1, isAutoFilling: true }));
    try {
      const { data } = await api.post('/ai/autofill', { blockType, currentAttrs });
      return data.suggestions;
    } catch (err) {
      console.error('[AI] autoFillBlock failed:', err);
      return null;
    } finally {
      set((s) => {
        const count = s._autoFillCount - 1;
        return { _autoFillCount: count, isAutoFilling: count > 0 };
      });
    }
  },

  // Wizard (autonomous creation)
  wizardProgress: null,

  startWizardFromOutline: async (projectId, outline) => {
    _wizardAbortController?.abort();
    const abortController = new AbortController();
    _wizardAbortController = abortController;

    set({
      wizardProgress: {
        isGenerating: true,
        outline,
        sections: [],
        progress: 0,
        error: null,
      },
    });

    try {
      const token = getAccessToken();
      const response = await fetch(`/api/projects/${projectId}/ai/wizard/chat-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(outline),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorMsg = 'Generation failed';
        try {
          const err = await response.json();
          errorMsg = err.error || errorMsg;
        } catch { /* use default */ }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              if (!event || typeof event !== 'object' || typeof event.type !== 'string') continue;
              switch ((event as WizardEvent).type) {
                case 'outline':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      outline: event.outline,
                    } : null,
                  }));
                  break;
                case 'section_start':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      sections: [...s.wizardProgress.sections, {
                        sectionId: event.sectionId,
                        title: event.title,
                        status: 'generating' as const,
                        content: null,
                      }],
                    } : null,
                  }));
                  break;
                case 'section_done':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      sections: s.wizardProgress.sections.map((sec) =>
                        sec.sectionId === event.sectionId
                          ? { ...sec, status: 'completed' as const }
                          : sec,
                      ),
                    } : null,
                  }));
                  break;
                case 'section_error':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      sections: s.wizardProgress.sections.map((sec) =>
                        sec.sectionId === event.sectionId
                          ? { ...sec, status: 'failed' as const, error: event.error }
                          : sec,
                      ),
                    } : null,
                  }));
                  break;
                case 'progress':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      progress: event.percent,
                    } : null,
                  }));
                  break;
                case 'error':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      error: event.error,
                      isGenerating: false,
                    } : null,
                  }));
                  break;
                case 'done':
                  set((s) => ({
                    wizardProgress: s.wizardProgress ? {
                      ...s.wizardProgress,
                      isGenerating: false,
                    } : null,
                  }));
                  break;
              }
            } catch { /* skip unparseable */ }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim()) as WizardEvent;
            if (event.type === 'done') {
              set((s) => ({
                wizardProgress: s.wizardProgress ? {
                  ...s.wizardProgress,
                  isGenerating: false,
                } : null,
              }));
            }
          } catch { /* skip */ }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[AI Wizard] Generation failed:', err);
      set((s) => ({
        wizardProgress: s.wizardProgress ? {
          ...s.wizardProgress,
          error: err instanceof Error ? err.message : 'Generation failed',
          isGenerating: false,
        } : null,
      }));
    } finally {
      if (_wizardAbortController === abortController) {
        _wizardAbortController = null;
      }
    }
  },

  applyWizardSections: async (projectId, sectionIds) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/wizard/apply`, { sectionIds });
      set({ wizardProgress: null });
      return data;
    } catch (err) {
      console.error('[AI Wizard] Failed to apply:', err);
      set((s) => ({
        wizardProgress: s.wizardProgress ? {
          ...s.wizardProgress,
          error: 'Failed to apply sections. Please try again.',
        } : null,
      }));
      return null;
    }
  },

  cancelWizardGeneration: () => {
    _wizardAbortController?.abort();
    _wizardAbortController = null;
    set((s) => ({
      wizardProgress: s.wizardProgress ? {
        ...s.wizardProgress,
        isGenerating: false,
      } : null,
    }));
  },

  clearWizard: () => {
    _wizardAbortController?.abort();
    _wizardAbortController = null;
    set({ wizardProgress: null });
  },

  // Planning state
  planningState: null,

  fetchPlanningState: async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/state`);
      set({ planningState: data });
    } catch {
      // Non-critical — silently fail
    }
  },

  rememberFact: async (projectId, type, content) => {
    try {
      await api.post(`/projects/${projectId}/ai/memory/remember`, { type, content });
      await get().fetchPlanningState(projectId);
    } catch (err) {
      console.error('[AI] rememberFact failed:', err);
    }
  },

  forgetFact: async (projectId, itemId) => {
    try {
      await api.post(`/projects/${projectId}/ai/memory/forget`, { itemId });
      await get().fetchPlanningState(projectId);
    } catch (err) {
      console.error('[AI] forgetFact failed:', err);
    }
  },

  resetPlan: async (projectId) => {
    try {
      await api.post(`/projects/${projectId}/ai/plan/reset`);
      await get().fetchPlanningState(projectId);
    } catch (err) {
      console.error('[AI] resetPlan failed:', err);
    }
  },

  resetWorkingMemory: async (projectId) => {
    try {
      await api.post(`/projects/${projectId}/ai/memory/reset`);
      await get().fetchPlanningState(projectId);
    } catch (err) {
      console.error('[AI] resetWorkingMemory failed:', err);
    }
  },

  // Settings modal
  isSettingsModalOpen: false,
  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
}));
