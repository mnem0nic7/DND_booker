# Phase 12: Client — Run Progress UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Users can start autonomous generation runs, see live progress via SSE, and pause/cancel runs — all from within the existing AI chat panel.

**Architecture:** A `generationStore` (Zustand) manages run state, SSE subscriptions, and API calls. `GenerationRunPanel` shows progress stages, artifact counts, and controls. `AutonomousGenerationDialog` is a modal for configuring and starting a new run. The SSE endpoint is already built (`GET /ai/generation-runs/:runId/stream`), and the server API routes for runs/tasks/artifacts already exist.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS 4, SSE via fetch + ReadableStream

---

### Task 1: Generation Store

**Files:**
- Create: `client/src/stores/generationStore.ts`

**Step 1: Create the store**

Follows the same pattern as `exportStore.ts` — Zustand store with API calls and SSE subscription.

```typescript
// client/src/stores/generationStore.ts
import { create } from 'zustand';
import api from '../lib/api';
import { getAccessToken } from '../lib/api';
import type { GenerationRunSummary, RunStatus } from '@dnd-booker/shared';

interface GenerationEvent {
  type: string;
  runId: string;
  status?: string;
  stage?: string;
  progressPercent?: number;
  artifactId?: string;
  artifactType?: string;
  title?: string;
  message?: string;
  [key: string]: unknown;
}

interface GenerationState {
  // Current run
  currentRun: GenerationRunSummary | null;
  isStarting: boolean;
  error: string | null;

  // Progress
  progressPercent: number;
  currentStage: string | null;
  events: GenerationEvent[];
  artifactCount: number;

  // SSE
  _eventSource: AbortController | null;

  // Actions
  startRun: (projectId: string, prompt: string, mode?: string, quality?: string, pageTarget?: number) => Promise<void>;
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
    set({ isStarting: true, error: null, events: [], progressPercent: 0, currentStage: null, artifactCount: 0 });
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/generation-runs`, {
        prompt, mode, quality, pageTarget,
      });
      set({ currentRun: data, isStarting: false });
      // Auto-subscribe to progress
      get().subscribeToRun(projectId, data.id);
    } catch (err: any) {
      set({ isStarting: false, error: err?.response?.data?.error || 'Failed to start generation' });
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
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to fetch run' });
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
        // Auto-subscribe if still active
        const activeStatuses: RunStatus[] = ['queued', 'planning', 'generating_assets', 'generating_prose', 'evaluating', 'revising', 'assembling'];
        if (activeStatuses.includes(latest.status)) {
          get().subscribeToRun(projectId, latest.id);
        }
      }
    } catch {
      // Silently fail — no runs yet is normal
    }
  },

  pauseRun: async (projectId, runId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/generation-runs/${runId}/pause`);
      set({ currentRun: data });
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to pause run' });
    }
  },

  cancelRun: async (projectId, runId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/generation-runs/${runId}/cancel`);
      set({ currentRun: data });
      get().unsubscribe();
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to cancel run' });
    }
  },

  resumeRun: async (projectId, runId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/ai/generation-runs/${runId}/resume`);
      set({ currentRun: data });
      get().subscribeToRun(projectId, data.id);
    } catch (err: any) {
      set({ error: err?.response?.data?.error || 'Failed to resume run' });
    }
  },

  subscribeToRun: (projectId, runId) => {
    // Unsubscribe from any existing stream
    get().unsubscribe();

    const controller = new AbortController();
    set({ _eventSource: controller });

    const token = getAccessToken();
    const url = `/api/projects/${projectId}/ai/generation-runs/${runId}/stream`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
                updates.progressPercent = event.progressPercent ?? state.progressPercent;
                updates.currentStage = (event.stage as string) ?? state.currentStage;
                if (event.status) {
                  updates.currentRun = state.currentRun
                    ? { ...state.currentRun, status: event.status as RunStatus }
                    : state.currentRun;
                }
              }

              if (event.type === 'artifact_created' || event.type === 'artifact_revised') {
                updates.artifactCount = (state.artifactCount ?? 0) + 1;
              }

              if (event.type === 'run_completed' || event.type === 'run_failed') {
                updates.currentRun = state.currentRun
                  ? { ...state.currentRun, status: event.type === 'run_completed' ? 'completed' : 'failed' }
                  : state.currentRun;
              }

              return updates;
            });
          } catch {
            // Skip malformed events
          }
        }
      }
    }).catch(() => {
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
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/stores/generationStore.ts
git commit -m "feat: add generation store with SSE progress subscription"
```

---

### Task 2: GenerationRunPanel Component

**Files:**
- Create: `client/src/components/ai/GenerationRunPanel.tsx`

**Step 1: Create the progress panel component**

This panel shows when there's an active or recent generation run. Displays: stage indicator, progress bar, artifact count, pause/cancel/resume controls, and event log.

```tsx
// client/src/components/ai/GenerationRunPanel.tsx
import { useEffect } from 'react';
import { useGenerationStore } from '../../stores/generationStore';

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  planning: 'Planning Campaign',
  generating_assets: 'Creating Assets',
  generating_prose: 'Writing Chapters',
  evaluating: 'Quality Review',
  revising: 'Revising Content',
  assembling: 'Assembling Documents',
  completed: 'Complete',
  failed: 'Failed',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

interface Props {
  projectId: string;
}

export function GenerationRunPanel({ projectId }: Props) {
  const {
    currentRun, progressPercent, currentStage, artifactCount, error, events,
    fetchLatestRun, pauseRun, cancelRun, resumeRun, reset,
  } = useGenerationStore();

  useEffect(() => {
    fetchLatestRun(projectId);
    return () => {
      useGenerationStore.getState().unsubscribe();
    };
  }, [projectId, fetchLatestRun]);

  if (!currentRun) return null;

  const status = currentRun.status;
  const isActive = ['queued', 'planning', 'generating_assets', 'generating_prose', 'evaluating', 'revising', 'assembling'].includes(status);
  const isPaused = status === 'paused';
  const isDone = status === 'completed';
  const isFailed = status === 'failed';

  const stageLabel = STAGE_LABELS[currentStage ?? status] ?? status;
  const recentEvents = events.slice(-5);

  return (
    <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          )}
          {isDone && <span className="w-2 h-2 rounded-full bg-green-500" />}
          {isFailed && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {isPaused && <span className="w-2 h-2 rounded-full bg-yellow-500" />}
          <span className="text-sm font-medium text-gray-700">{stageLabel}</span>
        </div>
        <span className="text-xs text-gray-500">{artifactCount} artifacts</span>
      </div>

      {/* Progress bar */}
      {(isActive || isPaused) && (
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
          <div
            className="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {isDone && (
        <div className="w-full bg-green-200 rounded-full h-1.5 mb-2">
          <div className="bg-green-500 h-1.5 rounded-full w-full" />
        </div>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      {/* Recent events */}
      {recentEvents.length > 0 && (
        <div className="text-xs text-gray-500 space-y-0.5 mb-2 max-h-20 overflow-y-auto">
          {recentEvents.map((e, i) => (
            <div key={i} className="truncate">
              {e.type === 'artifact_created' && `Created: ${e.title}`}
              {e.type === 'artifact_evaluated' && `Evaluated: ${e.passed ? 'Passed' : 'Needs revision'}`}
              {e.type === 'artifact_revised' && `Revised: ${e.title} v${e.version}`}
              {e.type === 'run_warning' && `Warning: ${e.message}`}
              {e.type === 'run_status' && `${STAGE_LABELS[e.stage as string] ?? e.stage}`}
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {isActive && (
          <>
            <button
              onClick={() => pauseRun(projectId, currentRun.id)}
              className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={() => cancelRun(projectId, currentRun.id)}
              className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
        {isPaused && (
          <button
            onClick={() => resumeRun(projectId, currentRun.id)}
            className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
          >
            Resume
          </button>
        )}
        {(isDone || isFailed || status === 'cancelled') && (
          <button
            onClick={() => reset()}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/components/ai/GenerationRunPanel.tsx
git commit -m "feat: add GenerationRunPanel component with SSE progress and controls"
```

---

### Task 3: AutonomousGenerationDialog Component

**Files:**
- Create: `client/src/components/ai/AutonomousGenerationDialog.tsx`

**Step 1: Create the dialog component**

A modal for configuring and starting a new autonomous generation run.

```tsx
// client/src/components/ai/AutonomousGenerationDialog.tsx
import { useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AutonomousGenerationDialog({ projectId, isOpen, onClose }: Props) {
  const { startRun, isStarting, error } = useGenerationStore();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'one_shot' | 'module' | 'campaign' | 'sourcebook'>('one_shot');
  const [quality, setQuality] = useState<'quick' | 'polished'>('quick');
  const [pageTarget, setPageTarget] = useState<number | ''>('');

  if (!isOpen) return null;

  async function handleStart() {
    if (!prompt.trim()) return;
    await startRun(projectId, prompt.trim(), mode, quality, pageTarget || undefined);
    if (!useGenerationStore.getState().error) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Generate Content</h2>

        {/* Prompt */}
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Describe your adventure
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A dark forest adventure where goblins have stolen a sacred artifact..."
          className="w-full border border-gray-300 rounded-md p-2 text-sm h-24 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />

        {/* Mode */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div className="flex gap-2">
            {(['one_shot', 'module', 'campaign', 'sourcebook'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  mode === m
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quality</label>
          <div className="flex gap-2">
            <button
              onClick={() => setQuality('quick')}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                quality === 'quick'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Quick Draft
            </button>
            <button
              onClick={() => setQuality('polished')}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                quality === 'polished'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Polished
            </button>
          </div>
        </div>

        {/* Page target */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Pages <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="number"
            value={pageTarget}
            onChange={(e) => setPageTarget(e.target.value ? Number(e.target.value) : '')}
            min={5}
            max={500}
            placeholder="e.g. 30"
            className="w-24 border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!prompt.trim() || isStarting}
            className="text-sm px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? 'Starting...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add client/src/components/ai/AutonomousGenerationDialog.tsx
git commit -m "feat: add AutonomousGenerationDialog for starting generation runs"
```

---

### Task 4: Integration Verification

**Files:**
- No new files

**Step 1: Run client type check**

Run: `cd /home/gallison/workspace/DND_booker/client && npx tsc --noEmit`
Expected: PASS

**Step 2: Run server type check (regression)**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS
