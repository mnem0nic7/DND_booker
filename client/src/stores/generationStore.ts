import { create } from 'zustand';
import api from '../lib/api';
import { getAccessToken } from '../lib/api';
import type {
  GenerationRunSummary,
  GenerationEvent,
  RunStatus,
} from '@dnd-booker/shared';

// Active statuses that indicate a run is still in progress
const ACTIVE_STATUSES: RunStatus[] = [
  'queued',
  'planning',
  'generating_assets',
  'generating_prose',
  'evaluating',
  'revising',
  'assembling',
];

interface GenerationState {
  currentRun: GenerationRunSummary | null;
  isStarting: boolean;
  error: string | null;
  progressPercent: number;
  currentStage: string | null;
  events: GenerationEvent[];
  artifactCount: number;
  _eventSource: AbortController | null;

  startRun: (
    projectId: string,
    prompt: string,
    mode?: string,
    quality?: string,
    pageTarget?: number,
  ) => Promise<void>;
  fetchRun: (projectId: string, runId: string) => Promise<void>;
  fetchLatestRun: (projectId: string) => Promise<void>;
  pauseRun: (projectId: string, runId: string) => Promise<void>;
  cancelRun: (projectId: string, runId: string) => Promise<void>;
  resumeRun: (projectId: string, runId: string) => Promise<void>;
  subscribeToRun: (projectId: string, runId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  currentRun: null,
  isStarting: false,
  error: null,
  progressPercent: 0,
  currentStage: null,
  events: [],
  artifactCount: 0,
  _eventSource: null,

  startRun: async (projectId, prompt, mode = 'one_shot', quality = 'quick', pageTarget) => {
    set({
      isStarting: true,
      error: null,
      events: [],
      progressPercent: 0,
      currentStage: null,
      artifactCount: 0,
    });
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/generation-runs`, {
        prompt,
        mode,
        quality,
        pageTarget,
      });
      set({ currentRun: data, isStarting: false });
      get().subscribeToRun(projectId, data.id);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ isStarting: false, error: message || 'Failed to start generation' });
    }
  },

  fetchRun: async (projectId, runId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/generation-runs/${runId}`);
      set({
        currentRun: data,
        progressPercent: data.progressPercent ?? 0,
        currentStage: data.currentStage,
        artifactCount: data.artifactCount ?? 0,
      });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to fetch run' });
    }
  },

  fetchLatestRun: async (projectId) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/ai/generation-runs`);
      if (data.length > 0) {
        const latest = data[0];
        set({
          currentRun: latest,
          progressPercent: latest.progressPercent ?? 0,
          currentStage: latest.currentStage,
        });
        if (ACTIVE_STATUSES.includes(latest.status)) {
          get().subscribeToRun(projectId, latest.id);
        }
      }
    } catch {
      // Silently fail — no runs yet is normal
    }
  },

  pauseRun: async (projectId, runId) => {
    try {
      const { data } = await api.post(
        `/projects/${projectId}/ai/generation-runs/${runId}/pause`,
      );
      set({ currentRun: data });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to pause run' });
    }
  },

  cancelRun: async (projectId, runId) => {
    try {
      const { data } = await api.post(
        `/projects/${projectId}/ai/generation-runs/${runId}/cancel`,
      );
      set({ currentRun: data });
      get().unsubscribe();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to cancel run' });
    }
  },

  resumeRun: async (projectId, runId) => {
    try {
      const { data } = await api.post(
        `/projects/${projectId}/ai/generation-runs/${runId}/resume`,
      );
      set({ currentRun: data });
      get().subscribeToRun(projectId, data.id);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to resume run' });
    }
  },

  subscribeToRun: (projectId, runId) => {
    // Tear down any existing subscription
    get().unsubscribe();

    const controller = new AbortController();
    set({ _eventSource: controller });

    const token = getAccessToken();
    const url = `/api/projects/${projectId}/ai/generation-runs/${runId}/stream`;

    fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event: GenerationEvent = JSON.parse(line.slice(6));
              set((state) => {
                const updates: Partial<GenerationState> = {
                  events: [...state.events, event],
                };

                if (event.type === 'run_status') {
                  updates.progressPercent = event.progressPercent;
                  updates.currentStage = event.stage;
                  updates.currentRun = state.currentRun
                    ? { ...state.currentRun, status: event.status }
                    : state.currentRun;
                }

                if (event.type === 'artifact_created' || event.type === 'artifact_revised') {
                  updates.artifactCount = (state.artifactCount ?? 0) + 1;
                }

                if (event.type === 'run_completed') {
                  updates.currentRun = state.currentRun
                    ? { ...state.currentRun, status: 'completed' as RunStatus }
                    : state.currentRun;
                  updates.progressPercent = 100;
                }

                if (event.type === 'run_failed') {
                  updates.currentRun = state.currentRun
                    ? { ...state.currentRun, status: 'failed' as RunStatus }
                    : state.currentRun;
                  updates.error = event.reason;
                }

                return updates as GenerationState;
              });
            } catch {
              // Skip malformed events
            }
          }
        }
      })
      .catch(() => {
        // Stream ended or aborted — normal on disconnect
      });
  },

  unsubscribe: () => {
    const controller = get()._eventSource;
    if (controller) {
      controller.abort();
      set({ _eventSource: null });
    }
  },

  reset: () => {
    get().unsubscribe();
    set({
      currentRun: null,
      isStarting: false,
      error: null,
      progressPercent: 0,
      currentStage: null,
      events: [],
      artifactCount: 0,
    });
  },
}));
