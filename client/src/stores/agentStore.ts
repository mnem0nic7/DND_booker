import { create } from 'zustand';
import api, { getAccessToken, v1Client } from '../lib/api';
import { useProjectStore } from './projectStore';
import type {
  AgentAction,
  AgentCheckpoint,
  AgentEvent,
  AgentRun,
  AgentRunMode,
  AgentRunStatus,
  CreateAgentRunRequest,
  GraphInterruptResolutionAction,
} from '@dnd-booker/shared';

const ACTIVE_STATUSES: AgentRunStatus[] = [
  'queued',
  'seeding',
  'observing',
  'planning',
  'acting',
  'evaluating',
  'checkpointing',
];

interface AgentState {
  currentRun: AgentRun | null;
  isStarting: boolean;
  error: string | null;
  progressPercent: number;
  currentStage: string | null;
  events: AgentEvent[];
  checkpoints: AgentCheckpoint[];
  actions: AgentAction[];
  _eventSource: AbortController | null;

  startRun: (projectId: string, input: CreateAgentRunRequest) => Promise<void>;
  fetchRun: (projectId: string, runId: string) => Promise<void>;
  fetchLatestRun: (projectId: string) => Promise<void>;
  pauseRun: (projectId: string, runId: string) => Promise<void>;
  cancelRun: (projectId: string, runId: string) => Promise<void>;
  resumeRun: (projectId: string, runId: string) => Promise<void>;
  subscribeToRun: (projectId: string, runId: string) => void;
  unsubscribe: () => void;
  fetchCheckpoints: (projectId: string, runId: string) => Promise<void>;
  fetchActions: (projectId: string, runId: string) => Promise<void>;
  restoreCheckpoint: (projectId: string, runId: string, checkpointId: string) => Promise<void>;
  resolveInterrupt: (
    projectId: string,
    runId: string,
    interruptId: string,
    action: GraphInterruptResolutionAction,
    payload?: unknown,
  ) => Promise<void>;
  reset: () => void;
}

function toErrorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'response' in err
    ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback)
    : fallback;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  currentRun: null,
  isStarting: false,
  error: null,
  progressPercent: 0,
  currentStage: null,
  events: [],
  checkpoints: [],
  actions: [],
  _eventSource: null,

  startRun: async (projectId, input) => {
    set({
      isStarting: true,
      error: null,
      events: [],
      progressPercent: 0,
      currentStage: null,
      checkpoints: [],
      actions: [],
    });
    try {
      const data = await v1Client.agentRuns.createAgentRun({ projectId }, input);
      set({ currentRun: data, isStarting: false });
      get().subscribeToRun(projectId, data.id);
      await Promise.all([
        get().fetchCheckpoints(projectId, data.id),
        get().fetchActions(projectId, data.id),
      ]);
    } catch (err: unknown) {
      set({ isStarting: false, error: toErrorMessage(err, 'Failed to start creative director') });
    }
  },

  fetchRun: async (projectId, runId) => {
    try {
      const data = await v1Client.agentRuns.getAgentRun({ projectId, runId });
      const isTerminal = ['completed', 'failed', 'cancelled'].includes(data.status);
      set({
        currentRun: data,
        progressPercent: isTerminal && data.status === 'completed' ? 100 : data.progressPercent ?? 0,
        currentStage: isTerminal ? null : data.currentStage,
      });
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to fetch creative director run') });
    }
  },

  fetchLatestRun: async (projectId) => {
    try {
      const data = await v1Client.agentRuns.listAgentRuns({ projectId });
      if (data.length > 0) {
        const latest = data[0];
        await get().fetchRun(projectId, latest.id);
        if (ACTIVE_STATUSES.includes(latest.status)) {
          get().subscribeToRun(projectId, latest.id);
        } else {
          await Promise.all([
            get().fetchCheckpoints(projectId, latest.id),
            get().fetchActions(projectId, latest.id),
          ]);
        }
      }
    } catch {
      // No run yet is normal.
    }
  },

  pauseRun: async (projectId, runId) => {
    try {
      const data = await v1Client.agentRuns.pauseAgentRun({ projectId, runId });
      set({ currentRun: data });
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to pause creative director') });
    }
  },

  cancelRun: async (projectId, runId) => {
    try {
      const data = await v1Client.agentRuns.cancelAgentRun({ projectId, runId });
      set({ currentRun: data });
      get().unsubscribe();
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to cancel creative director') });
    }
  },

  resumeRun: async (projectId, runId) => {
    try {
      const data = await v1Client.agentRuns.resumeAgentRun({ projectId, runId });
      set({ currentRun: data });
      get().subscribeToRun(projectId, data.id);
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to resume creative director') });
    }
  },

  subscribeToRun: (projectId, runId) => {
    get().unsubscribe();
    const controller = new AbortController();
    set({ _eventSource: controller });

    const reconcile = async () => {
      if (controller.signal.aborted) return;
      await get().fetchRun(projectId, runId);
      await Promise.all([
        get().fetchCheckpoints(projectId, runId),
        get().fetchActions(projectId, runId),
      ]);
    };

    const token = getAccessToken();
    const url = `/api/v1/projects/${projectId}/agent-runs/${runId}/events`;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          await reconcile();
          return;
        }

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
              const event: AgentEvent = JSON.parse(line.slice(6));
              set((state) => {
                const updates: Partial<AgentState> = {
                  events: [...state.events, event].slice(-50),
                };
                if (event.type === 'run_status') {
                  updates.progressPercent = event.progressPercent;
                  updates.currentStage = event.stage;
                  if (state.currentRun) {
                    updates.currentRun = {
                      ...state.currentRun,
                      status: event.status,
                      currentStage: event.stage,
                      progressPercent: event.progressPercent,
                    };
                  }
                }
                return updates as AgentState;
              });

              if (event.type === 'run_status' && event.status === 'paused') {
                void get().fetchRun(projectId, runId);
              }

              if (event.type === 'checkpoint_created' || event.type === 'checkpoint_restored') {
                void get().fetchCheckpoints(projectId, runId);
              }
              if (event.type === 'action_started' || event.type === 'action_completed') {
                void get().fetchActions(projectId, runId);
              }
              if (event.type === 'run_completed' || event.type === 'run_failed') {
                void reconcile();
              }
            } catch {
              // Ignore malformed SSE payloads.
            }
          }
        }

        await reconcile();
      })
      .catch(async (err) => {
        if ((err as Error)?.name === 'AbortError') return;
        await reconcile();
      });
  },

  unsubscribe: () => {
    const source = get()._eventSource;
    if (source) {
      source.abort();
    }
    set({ _eventSource: null });
  },

  fetchCheckpoints: async (projectId, runId) => {
    try {
      const data = await v1Client.agentRuns.listAgentCheckpoints({ projectId, runId });
      set({ checkpoints: data });
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to load checkpoints') });
    }
  },

  fetchActions: async (projectId, runId) => {
    try {
      const data = await v1Client.agentRuns.listAgentActions({ projectId, runId });
      set({ actions: data });
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to load action log') });
    }
  },

  restoreCheckpoint: async (projectId, runId, checkpointId) => {
    try {
      await v1Client.agentRuns.restoreAgentCheckpoint({ projectId, runId, checkpointId });
      await Promise.all([
        get().fetchCheckpoints(projectId, runId),
        get().fetchRun(projectId, runId),
      ]);
      await useProjectStore.getState().fetchProject(projectId);
      await useProjectStore.getState().fetchDocuments(projectId);
      const activeDocId = useProjectStore.getState().activeDocument?.id ?? null;
      if (activeDocId) {
        await useProjectStore.getState().loadDocument(projectId, activeDocId);
      }
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to restore checkpoint') });
    }
  },

  resolveInterrupt: async (projectId, runId, interruptId, action, payload) => {
    try {
      await v1Client.agentRuns.resolveAgentRunInterrupt({
        projectId,
        runId,
        interruptId,
      }, {
        action,
        payload,
      });

      const currentRun = get().currentRun;
      if (action === 'approve' && currentRun?.status === 'paused') {
        await get().resumeRun(projectId, runId);
        return;
      }

      await Promise.all([
        get().fetchRun(projectId, runId),
        get().fetchCheckpoints(projectId, runId),
        get().fetchActions(projectId, runId),
      ]);
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to resolve approval gate') });
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
      checkpoints: [],
      actions: [],
    });
  },
}));
