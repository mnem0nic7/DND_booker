import { create } from 'zustand';
import axios from 'axios';
import type { DocumentContent } from '@dnd-booker/shared';
import api from '../lib/api';

export interface Project {
  id: string;
  title: string;
  description: string;
  type: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  status: 'draft' | 'in_progress' | 'review' | 'published';
  coverImageUrl: string | null;
  settings: Record<string, unknown>;
  content?: DocumentContent;
  createdAt: string;
  updatedAt: string;
}

export type SaveErrorCategory = 'network' | 'server';

export interface SaveError {
  message: string;
  category: SaveErrorCategory;
  statusCode?: number;
}

interface ProjectState {
  // Dashboard list
  projects: Project[];
  isLoading: boolean;
  fetchError: string | null;
  fetchProjects: () => Promise<void>;
  createProject: (data: { title: string; description?: string; type: string; templateId?: string }) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;

  // Active project (editor)
  currentProject: Project | null;
  isLoadingProject: boolean;
  isSaving: boolean;
  hasPendingChanges: boolean;
  saveError: SaveError | null;
  fetchProject: (id: string) => Promise<void>;
  updateContent: (content: DocumentContent) => void;
  flushPendingSave: () => Promise<void>;
  cancelPendingSave: () => void;
  retrySave: () => Promise<void>;
}

/* ─── localStorage backup helpers ─── */

function backupKey(projectId: string): string {
  return `dnd-booker-backup-${projectId}`;
}

function saveBackup(projectId: string, content: DocumentContent): void {
  try {
    localStorage.setItem(backupKey(projectId), JSON.stringify(content));
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearBackup(projectId: string): void {
  try {
    localStorage.removeItem(backupKey(projectId));
  } catch {
    // silently ignore
  }
}

/* ─── error classification ─── */

function classifySaveError(err: unknown): SaveError {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const status = err.response.status;
      return {
        message: `Server error (${status}). Your changes have been backed up locally.`,
        category: 'server',
        statusCode: status,
      };
    }
    return {
      message: 'Network error – unable to reach the server. Your changes have been backed up locally.',
      category: 'network',
    };
  }
  return {
    message: 'An unexpected error occurred while saving. Your changes have been backed up locally.',
    category: 'network',
  };
}

/* ─── retry with exponential backoff ─── */

async function saveContentWithRetry(
  projectId: string,
  content: DocumentContent,
  maxAttempts = 3,
): Promise<void> {
  const backoffMs = [1000, 2000, 4000];
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await api.put(`/projects/${projectId}/content`, content);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
    }
  }
  throw lastError;
}

/* ─── module-level pending-save state ─── */

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSaveId: string | null = null;
let pendingSaveContent: DocumentContent | null = null;
let failedSaveId: string | null = null;
let failedSaveContent: DocumentContent | null = null;

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Dashboard list
  projects: [],
  isLoading: false,
  fetchError: null,

  fetchProjects: async () => {
    set({ isLoading: true, fetchError: null });
    try {
      const { data } = await api.get('/projects');
      set({ projects: data, isLoading: false });
    } catch {
      set({ isLoading: false, fetchError: 'Failed to load projects' });
    }
  },

  createProject: async (projectData) => {
    const { data } = await api.post('/projects', projectData);
    set({ projects: [data, ...get().projects] });
    return data;
  },

  deleteProject: async (id) => {
    const prev = get().projects;
    set({ projects: prev.filter((p) => p.id !== id) });
    try {
      await api.delete(`/projects/${id}`);
    } catch (err) {
      set({ projects: prev });
      throw err;
    }
  },

  // Active project (editor)
  currentProject: null,
  isLoadingProject: false,
  isSaving: false,
  hasPendingChanges: false,
  saveError: null,

  fetchProject: async (id) => {
    set({ isLoadingProject: true });
    try {
      const { data } = await api.get(`/projects/${id}`);
      set({ currentProject: data, isLoadingProject: false });
    } catch {
      set({ isLoadingProject: false });
    }
  },

  updateContent: (content) => {
    const project = get().currentProject;
    if (!project) return;

    // Update local state immediately
    set({ currentProject: { ...project, content } });

    // Track what needs saving
    pendingSaveId = project.id;
    pendingSaveContent = content;

    // Debounced save to server (1 second)
    if (saveTimeout) clearTimeout(saveTimeout);
    set({ hasPendingChanges: true });
    saveTimeout = setTimeout(async () => {
      const saveId = pendingSaveId;
      const saveContent = pendingSaveContent;
      pendingSaveId = null;
      pendingSaveContent = null;
      saveTimeout = null;

      if (!saveId || !saveContent) return;
      set({ isSaving: true, saveError: null });
      try {
        await saveContentWithRetry(saveId, saveContent);
        clearBackup(saveId);
        failedSaveId = null;
        failedSaveContent = null;
        set({ isSaving: false, hasPendingChanges: false });
      } catch (err) {
        saveBackup(saveId, saveContent);
        failedSaveId = saveId;
        failedSaveContent = saveContent;
        set({ isSaving: false, saveError: classifySaveError(err) });
      }
    }, 1000);
  },

  flushPendingSave: async () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    const saveId = pendingSaveId;
    const saveContent = pendingSaveContent;
    pendingSaveId = null;
    pendingSaveContent = null;

    if (!saveId || !saveContent) return;
    set({ isSaving: true, saveError: null });
    try {
      await saveContentWithRetry(saveId, saveContent);
      clearBackup(saveId);
      failedSaveId = null;
      failedSaveContent = null;
      set({ isSaving: false, hasPendingChanges: false });
    } catch (err) {
      saveBackup(saveId, saveContent);
      failedSaveId = saveId;
      failedSaveContent = saveContent;
      set({ isSaving: false, saveError: classifySaveError(err) });
    }
  },

  cancelPendingSave: () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    pendingSaveId = null;
    pendingSaveContent = null;
    set({ hasPendingChanges: false });
  },

  retrySave: async () => {
    const saveId = failedSaveId;
    const saveContent = failedSaveContent;
    if (!saveId || !saveContent) return;

    set({ isSaving: true, saveError: null });
    try {
      await saveContentWithRetry(saveId, saveContent);
      clearBackup(saveId);
      failedSaveId = null;
      failedSaveContent = null;
      set({ isSaving: false, hasPendingChanges: false });
    } catch (err) {
      saveBackup(saveId, saveContent);
      set({ isSaving: false, saveError: classifySaveError(err) });
    }
  },
}));
