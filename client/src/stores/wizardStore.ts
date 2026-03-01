import { create } from 'zustand';
import api, { getAccessToken } from '../lib/api';
import type {
  WizardPhase,
  WizardQuestion,
  WizardOutline,
  WizardGeneratedSection,
  WizardEvent,
  WizardSession,
} from '@dnd-booker/shared';

let _wizardAbortController: AbortController | null = null;

interface WizardState {
  // Session state
  session: WizardSession | null;
  phase: WizardPhase | null;
  questions: WizardQuestion[];
  outline: WizardOutline | null;
  generatedSections: WizardGeneratedSection[];
  progress: number;
  isActive: boolean;
  isStreaming: boolean;
  error: string | null;

  // Actions
  fetchSession: (projectId: string) => Promise<void>;
  startWizard: (projectId: string, projectType?: string) => Promise<void>;
  submitParameters: (projectId: string, projectType: string, answers: Record<string, string>) => Promise<void>;
  generateSections: (projectId: string, outline: WizardOutline) => Promise<void>;
  applyToProject: (projectId: string, sectionIds: string[]) => Promise<{ documents: unknown[] } | null>;
  cancelWizard: (projectId: string) => Promise<void>;
  stopStreaming: () => void;
  reset: () => void;
}

async function ssePost(
  url: string,
  body: unknown,
  onEvent: (event: WizardEvent) => void,
  abortSignal: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`/api${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    let errorMsg = 'Request failed';
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
          const event = JSON.parse(trimmed) as WizardEvent;
          onEvent(event);
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as WizardEvent;
        onEvent(event);
      } catch { /* skip */ }
    }
  } finally {
    reader.releaseLock();
  }
}

export const useWizardStore = create<WizardState>((set, get) => ({
  session: null,
  phase: null,
  questions: [],
  outline: null,
  generatedSections: [],
  progress: 0,
  isActive: false,
  isStreaming: false,
  error: null,

  fetchSession: async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/wizard`);
      if (data.session) {
        const s = data.session as WizardSession;
        set({
          session: s,
          phase: s.phase as WizardPhase,
          outline: s.outline as WizardOutline | null,
          generatedSections: (s.sections ?? []) as WizardGeneratedSection[],
          progress: s.progress,
          isActive: s.phase !== 'done',
        });
      }
    } catch {
      // No session — that's fine
    }
  },

  startWizard: async (projectId, projectType) => {
    _wizardAbortController?.abort();
    const abortController = new AbortController();
    _wizardAbortController = abortController;

    set({
      isActive: true,
      isStreaming: true,
      phase: 'questionnaire',
      questions: [],
      outline: null,
      generatedSections: [],
      progress: 0,
      error: null,
    });

    try {
      await ssePost(
        `/projects/${projectId}/ai/wizard/start`,
        { projectType },
        (event) => {
          switch (event.type) {
            case 'questions':
              set({ questions: event.questions });
              break;
            case 'error':
              set({ error: event.error, isStreaming: false });
              break;
            case 'done':
              set({ isStreaming: false });
              break;
          }
        },
        abortController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      set({
        error: err instanceof Error ? err.message : 'Failed to start wizard',
        isStreaming: false,
      });
    } finally {
      if (_wizardAbortController === abortController) {
        _wizardAbortController = null;
      }
    }
  },

  submitParameters: async (projectId, projectType, answers) => {
    _wizardAbortController?.abort();
    const abortController = new AbortController();
    _wizardAbortController = abortController;

    set({ isStreaming: true, error: null, phase: 'outline' });

    try {
      await ssePost(
        `/projects/${projectId}/ai/wizard/parameters`,
        { projectType, answers },
        (event) => {
          switch (event.type) {
            case 'outline':
              set({ outline: event.outline });
              break;
            case 'error':
              set({ error: event.error, isStreaming: false });
              break;
            case 'done':
              set({ isStreaming: false });
              break;
          }
        },
        abortController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      set({
        error: err instanceof Error ? err.message : 'Failed to generate outline',
        isStreaming: false,
      });
    } finally {
      if (_wizardAbortController === abortController) {
        _wizardAbortController = null;
      }
    }
  },

  generateSections: async (projectId, outline) => {
    _wizardAbortController?.abort();
    const abortController = new AbortController();
    _wizardAbortController = abortController;

    set({
      isStreaming: true,
      error: null,
      phase: 'generating',
      generatedSections: [],
      progress: 0,
    });

    try {
      await ssePost(
        `/projects/${projectId}/ai/wizard/generate`,
        { outline },
        (event) => {
          switch (event.type) {
            case 'section_start':
              set((s) => ({
                generatedSections: [...s.generatedSections, {
                  sectionId: event.sectionId,
                  title: event.title,
                  status: 'generating' as const,
                  content: null,
                }],
              }));
              break;
            case 'section_done':
              set((s) => ({
                generatedSections: s.generatedSections.map((sec) =>
                  sec.sectionId === event.sectionId
                    ? { ...sec, status: 'completed' as const }
                    : sec,
                ),
              }));
              break;
            case 'section_error':
              set((s) => ({
                generatedSections: s.generatedSections.map((sec) =>
                  sec.sectionId === event.sectionId
                    ? { ...sec, status: 'failed' as const, error: event.error }
                    : sec,
                ),
              }));
              break;
            case 'progress':
              set({ progress: event.percent });
              break;
            case 'error':
              set({ error: event.error, isStreaming: false });
              break;
            case 'done':
              set({ isStreaming: false, phase: 'review' });
              break;
          }
        },
        abortController.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      set({
        error: err instanceof Error ? err.message : 'Generation failed',
        isStreaming: false,
      });
    } finally {
      if (_wizardAbortController === abortController) {
        _wizardAbortController = null;
      }
    }
  },

  applyToProject: async (projectId, sectionIds) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/wizard/apply`, { sectionIds });
      set({ phase: 'done', isActive: false });
      return data;
    } catch (err) {
      console.error('[Wizard] Failed to apply:', err);
      set({ error: 'Failed to create documents. Please try again.' });
      return null;
    }
  },

  cancelWizard: async (projectId) => {
    _wizardAbortController?.abort();
    _wizardAbortController = null;
    try {
      await api.delete(`/projects/${projectId}/ai/wizard`);
    } catch { /* best-effort cleanup */ }
    set({
      session: null,
      phase: null,
      questions: [],
      outline: null,
      generatedSections: [],
      progress: 0,
      isActive: false,
      isStreaming: false,
      error: null,
    });
  },

  stopStreaming: () => {
    _wizardAbortController?.abort();
    _wizardAbortController = null;
    set({ isStreaming: false });
  },

  reset: () => {
    _wizardAbortController?.abort();
    _wizardAbortController = null;
    set({
      session: null,
      phase: null,
      questions: [],
      outline: null,
      generatedSections: [],
      progress: 0,
      isActive: false,
      isStreaming: false,
      error: null,
    });
  },
}));
