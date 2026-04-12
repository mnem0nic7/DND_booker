import { create } from 'zustand';
import { getAccessToken, v1Client } from '../lib/api';
import type {
  CreateImprovementLoopAndProjectRequest,
  CreateImprovementLoopRequest,
  ImprovementLoopDefaultEngineeringTarget,
  ImprovementLoopArtifact,
  ImprovementLoopRun,
  ImprovementLoopRunStatus,
  ProjectGitHubRepoBinding,
  ProjectGitHubRepoBindingInput,
  ProjectGitHubRepoBindingValidation,
} from '@dnd-booker/shared';

const ACTIVE_STATUSES: ImprovementLoopRunStatus[] = [
  'queued',
  'bootstrapping_project',
  'creator',
  'designer',
  'editor',
  'engineering',
];

interface ImprovementLoopState {
  currentRun: ImprovementLoopRun | null;
  isStarting: boolean;
  error: string | null;
  progressPercent: number;
  currentStage: string | null;
  artifacts: ImprovementLoopArtifact[];
  isLoadingArtifacts: boolean;
  binding: ProjectGitHubRepoBinding | null;
  validation: ProjectGitHubRepoBindingValidation | null;
  defaultEngineeringTarget: ImprovementLoopDefaultEngineeringTarget | null;
  isLoadingDefaultEngineeringTarget: boolean;
  isSavingBinding: boolean;
  isValidatingBinding: boolean;
  _eventSource: AbortController | null;

  startRun: (projectId: string, body: CreateImprovementLoopRequest) => Promise<ImprovementLoopRun | null>;
  startRunWithProject: (body: CreateImprovementLoopAndProjectRequest) => Promise<ImprovementLoopRun | null>;
  fetchRun: (projectId: string, runId: string) => Promise<void>;
  fetchLatestRun: (projectId: string) => Promise<void>;
  fetchArtifacts: (projectId: string, runId: string) => Promise<void>;
  subscribeToRun: (projectId: string, runId: string) => void;
  unsubscribe: () => void;
  pauseRun: (projectId: string, runId: string) => Promise<void>;
  resumeRun: (projectId: string, runId: string) => Promise<void>;
  cancelRun: (projectId: string, runId: string) => Promise<void>;
  fetchBinding: (projectId: string) => Promise<void>;
  fetchDefaultEngineeringTarget: () => Promise<ImprovementLoopDefaultEngineeringTarget | null>;
  saveBinding: (projectId: string, body: ProjectGitHubRepoBindingInput) => Promise<ProjectGitHubRepoBinding | null>;
  validateBinding: (projectId: string) => Promise<ProjectGitHubRepoBindingValidation | null>;
  reset: () => void;
}

function toErrorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'response' in err
    ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback)
    : fallback;
}

export const useImprovementLoopStore = create<ImprovementLoopState>((set, get) => ({
  currentRun: null,
  isStarting: false,
  error: null,
  progressPercent: 0,
  currentStage: null,
  artifacts: [],
  isLoadingArtifacts: false,
  binding: null,
  validation: null,
  defaultEngineeringTarget: null,
  isLoadingDefaultEngineeringTarget: false,
  isSavingBinding: false,
  isValidatingBinding: false,
  _eventSource: null,

  startRun: async (projectId, body) => {
    set({
      isStarting: true,
      error: null,
      artifacts: [],
      progressPercent: 0,
      currentStage: null,
    });
    try {
      const data = await v1Client.improvementLoops.createImprovementLoop({ projectId }, body);
      set({
        currentRun: data,
        isStarting: false,
        progressPercent: data.progressPercent ?? 0,
        currentStage: data.currentStage,
      });
      get().subscribeToRun(projectId, data.id);
      return data;
    } catch (err: unknown) {
      set({ isStarting: false, error: toErrorMessage(err, 'Failed to start improvement loop') });
      return null;
    }
  },

  startRunWithProject: async (body) => {
    set({
      isStarting: true,
      error: null,
      artifacts: [],
      progressPercent: 0,
      currentStage: null,
    });
    try {
      const data = await v1Client.improvementLoops.createImprovementLoopAndProject(body);
      set({
        currentRun: data,
        isStarting: false,
        progressPercent: data.progressPercent ?? 0,
        currentStage: data.currentStage,
      });
      get().subscribeToRun(data.projectId, data.id);
      return data;
    } catch (err: unknown) {
      set({ isStarting: false, error: toErrorMessage(err, 'Failed to create project and start improvement loop') });
      return null;
    }
  },

  fetchRun: async (projectId, runId) => {
    try {
      const data = await v1Client.improvementLoops.getImprovementLoop({ projectId, runId });
      const isTerminal = ['completed', 'failed', 'cancelled'].includes(data.status);
      set({
        currentRun: data,
        progressPercent: isTerminal && data.status === 'completed' ? 100 : data.progressPercent ?? 0,
        currentStage: isTerminal ? null : data.currentStage,
      });
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to fetch improvement loop') });
    }
  },

  fetchLatestRun: async (projectId) => {
    try {
      const data = await v1Client.improvementLoops.listImprovementLoops({ projectId });
      if (data.length > 0) {
        const latest = data[0];
        await get().fetchRun(projectId, latest.id);
        if (ACTIVE_STATUSES.includes(latest.status)) {
          get().subscribeToRun(projectId, latest.id);
        } else {
          await get().fetchArtifacts(projectId, latest.id);
        }
      } else {
        set({
          currentRun: null,
          artifacts: [],
          progressPercent: 0,
          currentStage: null,
        });
      }
    } catch {
      // No loop yet is normal.
    }
  },

  fetchArtifacts: async (projectId, runId) => {
    set({ isLoadingArtifacts: true });
    try {
      const data = await v1Client.improvementLoops.listImprovementLoopArtifacts({ projectId, runId });
      set({ artifacts: data, isLoadingArtifacts: false });
    } catch (err: unknown) {
      set({
        isLoadingArtifacts: false,
        error: toErrorMessage(err, 'Failed to load improvement loop artifacts'),
      });
    }
  },

  subscribeToRun: (projectId, runId) => {
    get().unsubscribe();
    const controller = new AbortController();
    set({ _eventSource: controller });

    const reconcile = async () => {
      if (controller.signal.aborted) return;
      await get().fetchRun(projectId, runId);
      await get().fetchArtifacts(projectId, runId);
    };

    const token = getAccessToken();
    fetch(`/api/v1/projects/${projectId}/improvement-loops/${runId}/events`, {
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
              const event = JSON.parse(line.slice(6)) as {
                type: string;
                status?: ImprovementLoopRunStatus;
                stage?: string | null;
                progressPercent?: number;
              };

              if (event.type === 'run_status') {
                set((state) => ({
                  progressPercent: event.progressPercent ?? state.progressPercent,
                  currentStage: event.stage ?? state.currentStage,
                  currentRun: state.currentRun
                    ? {
                      ...state.currentRun,
                      status: event.status ?? state.currentRun.status,
                      currentStage: event.stage ?? state.currentRun.currentStage,
                      progressPercent: event.progressPercent ?? state.currentRun.progressPercent,
                    }
                    : state.currentRun,
                }));
              }

              if (event.type === 'artifact_created' || event.type === 'engineering_applied') {
                void get().fetchArtifacts(projectId, runId);
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

  pauseRun: async (projectId, runId) => {
    try {
      const data = await v1Client.improvementLoops.pauseImprovementLoop({ projectId, runId });
      set({ currentRun: data });
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to pause improvement loop') });
    }
  },

  resumeRun: async (projectId, runId) => {
    try {
      const data = await v1Client.improvementLoops.resumeImprovementLoop({ projectId, runId });
      set({ currentRun: data });
      get().subscribeToRun(projectId, runId);
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to resume improvement loop') });
    }
  },

  cancelRun: async (projectId, runId) => {
    try {
      const data = await v1Client.improvementLoops.cancelImprovementLoop({ projectId, runId });
      set({ currentRun: data });
      get().unsubscribe();
    } catch (err: unknown) {
      set({ error: toErrorMessage(err, 'Failed to cancel improvement loop') });
    }
  },

  fetchBinding: async (projectId) => {
    try {
      const binding = await v1Client.projects.getProjectGitHubRepoBinding({ projectId });
      set({ binding });
    } catch {
      set({ binding: null });
    }
  },

  fetchDefaultEngineeringTarget: async () => {
    set({ isLoadingDefaultEngineeringTarget: true, error: null });
    try {
      const target = await v1Client.improvementLoops.getDefaultImprovementLoopEngineeringTarget();
      set({
        defaultEngineeringTarget: target,
        isLoadingDefaultEngineeringTarget: false,
      });
      return target;
    } catch (err: unknown) {
      set({
        isLoadingDefaultEngineeringTarget: false,
        error: toErrorMessage(err, 'Failed to load the default engineering target'),
      });
      return null;
    }
  },

  saveBinding: async (projectId, body) => {
    set({ isSavingBinding: true, error: null });
    try {
      const binding = await v1Client.projects.upsertProjectGitHubRepoBinding({ projectId }, body);
      set({ binding, isSavingBinding: false });
      return binding;
    } catch (err: unknown) {
      set({ isSavingBinding: false, error: toErrorMessage(err, 'Failed to save GitHub repo binding') });
      return null;
    }
  },

  validateBinding: async (projectId) => {
    set({ isValidatingBinding: true, error: null });
    try {
      const validation = await v1Client.projects.validateProjectGitHubRepoBinding({ projectId });
      set({ validation, isValidatingBinding: false });
      await get().fetchBinding(projectId);
      return validation;
    } catch (err: unknown) {
      set({ isValidatingBinding: false, error: toErrorMessage(err, 'Failed to validate GitHub repo binding') });
      return null;
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
      artifacts: [],
      isLoadingArtifacts: false,
      binding: null,
      validation: null,
      defaultEngineeringTarget: null,
      isLoadingDefaultEngineeringTarget: false,
      isSavingBinding: false,
      isValidatingBinding: false,
    });
  },
}));
