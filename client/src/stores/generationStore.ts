import { create } from 'zustand';
import { getAccessToken, v1Client } from '../lib/api';
import type {
  GenerationRunSummary,
  GenerationEvent,
  RunStatus,
  GeneratedArtifact,
  ArtifactEvaluation,
  CanonEntity,
  AssemblyManifest,
  GraphInterruptResolutionAction,
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

  // Artifacts
  artifacts: GeneratedArtifact[];
  selectedArtifactId: string | null;
  artifactDetail: (GeneratedArtifact & { evaluations?: ArtifactEvaluation[] }) | null;
  isLoadingArtifacts: boolean;

  // Canon
  canonEntities: CanonEntity[];
  isLoadingCanon: boolean;

  // Evaluations
  evaluations: ArtifactEvaluation[];
  isLoadingEvaluations: boolean;

  // Assembly
  assemblyManifest: AssemblyManifest | null;
  isLoadingAssembly: boolean;

  startRun: (
    projectId: string,
    prompt: string,
    mode?: 'one_shot' | 'module' | 'campaign' | 'sourcebook',
    quality?: 'quick' | 'polished',
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
  fetchArtifacts: (projectId: string, runId: string) => Promise<void>;
  fetchArtifactDetail: (projectId: string, runId: string, artifactId: string) => Promise<void>;
  fetchCanonEntities: (projectId: string, runId: string) => Promise<void>;
  fetchEvaluations: (projectId: string, runId: string) => Promise<void>;
  fetchAssemblyManifest: (projectId: string, runId: string) => Promise<void>;
  selectArtifact: (artifactId: string | null) => void;
  resolveInterrupt: (
    projectId: string,
    runId: string,
    interruptId: string,
    action: GraphInterruptResolutionAction,
    payload?: unknown,
  ) => Promise<void>;
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
  artifacts: [],
  selectedArtifactId: null,
  artifactDetail: null,
  isLoadingArtifacts: false,
  canonEntities: [],
  isLoadingCanon: false,
  evaluations: [],
  isLoadingEvaluations: false,
  assemblyManifest: null,
  isLoadingAssembly: false,

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
      const data = await v1Client.generationRuns.createGenerationRun({ projectId }, {
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
      const data = await v1Client.generationRuns.getGenerationRun({ projectId, runId });
      const isTerminal = ['completed', 'failed', 'cancelled'].includes(data.status);
      set({
        currentRun: data,
        progressPercent: isTerminal && data.status === 'completed'
          ? 100
          : data.progressPercent ?? 0,
        currentStage: isTerminal ? null : data.currentStage,
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
      const data = await v1Client.generationRuns.listGenerationRuns({ projectId });
      if (data.length > 0) {
        const latest = data[0];
        await get().fetchRun(projectId, latest.id);
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
      const data = await v1Client.generationRuns.pauseGenerationRun({ projectId, runId });
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
      const data = await v1Client.generationRuns.cancelGenerationRun({ projectId, runId });
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
      const data = await v1Client.generationRuns.resumeGenerationRun({ projectId, runId });
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
    const reconcileLatestRun = async () => {
      if (controller.signal.aborted) return;
      await get().fetchLatestRun(projectId);
    };

    const token = getAccessToken();
    const url = `/api/v1/projects/${projectId}/generation-runs/${runId}/events`;

    fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          await reconcileLatestRun();
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
                  updates.currentStage = null;
                }

                if (event.type === 'run_failed') {
                  updates.currentRun = state.currentRun
                    ? { ...state.currentRun, status: 'failed' as RunStatus }
                    : state.currentRun;
                  updates.error = event.reason;
                  updates.currentStage = null;
                }

                return updates as GenerationState;
              });

              if (event.type === 'run_status' && event.status === 'paused') {
                void get().fetchRun(projectId, runId);
              }
            } catch {
              // Skip malformed events
            }
          }
        }

        await reconcileLatestRun();
      })
      .catch(async (err: unknown) => {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        ) {
          return;
        }

        await reconcileLatestRun();
      });
  },

  unsubscribe: () => {
    const controller = get()._eventSource;
    if (controller) {
      controller.abort();
      set({ _eventSource: null });
    }
  },

  fetchArtifacts: async (projectId, runId) => {
    set({ isLoadingArtifacts: true });
    try {
      const data = await v1Client.generationRuns.listGenerationArtifacts({ projectId, runId });
      set({ artifacts: data, isLoadingArtifacts: false });
    } catch {
      set({ isLoadingArtifacts: false });
    }
  },

  fetchArtifactDetail: async (projectId, runId, artifactId) => {
    try {
      const data = await v1Client.generationRuns.getGenerationArtifact({ projectId, runId, artifactId });
      set({ artifactDetail: data, selectedArtifactId: artifactId });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to fetch artifact detail' });
    }
  },

  fetchCanonEntities: async (projectId, runId) => {
    set({ isLoadingCanon: true });
    try {
      const data = await v1Client.generationRuns.listGenerationCanonEntities({ projectId, runId });
      set({ canonEntities: data, isLoadingCanon: false });
    } catch {
      set({ isLoadingCanon: false });
    }
  },

  fetchEvaluations: async (projectId, runId) => {
    set({ isLoadingEvaluations: true });
    try {
      const data = await v1Client.generationRuns.listGenerationEvaluations({ projectId, runId });
      set({ evaluations: data, isLoadingEvaluations: false });
    } catch {
      set({ isLoadingEvaluations: false });
    }
  },

  fetchAssemblyManifest: async (projectId, runId) => {
    set({ isLoadingAssembly: true });
    try {
      const data = await v1Client.generationRuns.getGenerationAssemblyManifest({ projectId, runId });
      set({ assemblyManifest: data, isLoadingAssembly: false });
    } catch {
      set({ isLoadingAssembly: false, assemblyManifest: null });
    }
  },

  selectArtifact: (artifactId) => {
    set({ selectedArtifactId: artifactId, artifactDetail: null });
  },

  resolveInterrupt: async (projectId, runId, interruptId, action, payload) => {
    try {
      await v1Client.generationRuns.resolveGenerationRunInterrupt({
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

      await get().fetchRun(projectId, runId);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      set({ error: message || 'Failed to resolve review gate' });
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
      artifacts: [],
      selectedArtifactId: null,
      artifactDetail: null,
      isLoadingArtifacts: false,
      canonEntities: [],
      isLoadingCanon: false,
      evaluations: [],
      isLoadingEvaluations: false,
      assemblyManifest: null,
      isLoadingAssembly: false,
    });
  },
}));
