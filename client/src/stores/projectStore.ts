import { create } from 'zustand';
import axios from 'axios';
import type { DocumentContent, ProjectDocument } from '@dnd-booker/shared';
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

  // Per-document editing
  documents: ProjectDocument[];
  activeDocument: ProjectDocument | null;
  isLoadingDocuments: boolean;
  isLoadingDocument: boolean;
  fetchDocuments: (projectId: string) => Promise<void>;
  loadDocument: (projectId: string, docId: string) => Promise<void>;
  updateDocumentContent: (content: DocumentContent) => void;
  clearActiveDocument: () => Promise<void>;
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

/* ─── retry helper for document content saves ─── */

async function saveDocContentWithRetry(
  projectId: string,
  docId: string,
  content: DocumentContent,
  maxAttempts = 3,
): Promise<void> {
  const backoffMs = [1000, 2000, 4000];
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await api.put(`/projects/${projectId}/documents/${docId}/content`, content);
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

/* ─── localStorage backup helpers for documents ─── */

function docBackupKey(docId: string): string {
  return `dnd-booker-doc-backup-${docId}`;
}

function saveDocBackup(docId: string, content: DocumentContent): void {
  try {
    localStorage.setItem(docBackupKey(docId), JSON.stringify(content));
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearDocBackup(docId: string): void {
  try {
    localStorage.removeItem(docBackupKey(docId));
  } catch {
    // silently ignore
  }
}

/* ─── module-level pending-save state ─── */

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSaveId: string | null = null;
let pendingSaveContent: DocumentContent | null = null;
let pendingSaveDocId: string | null = null;
let failedSaveId: string | null = null;
let failedSaveContent: DocumentContent | null = null;
let failedSaveDocId: string | null = null;

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

    // Track what needs saving (project-level, clear any document save)
    pendingSaveId = project.id;
    pendingSaveContent = content;
    pendingSaveDocId = null;

    // Debounced save to server (1 second)
    if (saveTimeout) clearTimeout(saveTimeout);
    set({ hasPendingChanges: true });
    saveTimeout = setTimeout(async () => {
      const saveId = pendingSaveId;
      const saveContent = pendingSaveContent;
      pendingSaveId = null;
      pendingSaveContent = null;
      pendingSaveDocId = null;
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
    const saveDocId = pendingSaveDocId;
    pendingSaveId = null;
    pendingSaveContent = null;
    pendingSaveDocId = null;

    if (!saveId || !saveContent) return;
    set({ isSaving: true, saveError: null });
    try {
      if (saveDocId) {
        await saveDocContentWithRetry(saveId, saveDocId, saveContent);
        clearDocBackup(saveDocId);
      } else {
        await saveContentWithRetry(saveId, saveContent);
        clearBackup(saveId);
      }
      failedSaveId = null;
      failedSaveContent = null;
      failedSaveDocId = null;
      set({ isSaving: false, hasPendingChanges: false });
    } catch (err) {
      if (saveDocId) {
        saveDocBackup(saveDocId, saveContent);
        failedSaveId = saveId;
        failedSaveContent = saveContent;
        failedSaveDocId = saveDocId;
      } else {
        saveBackup(saveId, saveContent);
        failedSaveId = saveId;
        failedSaveContent = saveContent;
      }
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
    pendingSaveDocId = null;
    set({ hasPendingChanges: false });
  },

  retrySave: async () => {
    const saveId = failedSaveId;
    const saveContent = failedSaveContent;
    const saveDocId = failedSaveDocId;
    if (!saveId || !saveContent) return;

    set({ isSaving: true, saveError: null });
    try {
      if (saveDocId) {
        await saveDocContentWithRetry(saveId, saveDocId, saveContent);
        clearDocBackup(saveDocId);
      } else {
        await saveContentWithRetry(saveId, saveContent);
        clearBackup(saveId);
      }
      failedSaveId = null;
      failedSaveContent = null;
      failedSaveDocId = null;
      set({ isSaving: false, hasPendingChanges: false });
    } catch (err) {
      if (saveDocId) {
        saveDocBackup(saveDocId, saveContent);
      } else {
        saveBackup(saveId, saveContent);
      }
      set({ isSaving: false, saveError: classifySaveError(err) });
    }
  },

  // Per-document editing
  documents: [],
  activeDocument: null,
  isLoadingDocuments: false,
  isLoadingDocument: false,

  fetchDocuments: async (projectId) => {
    set({ isLoadingDocuments: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      set({ documents: data, isLoadingDocuments: false });
    } catch {
      set({ isLoadingDocuments: false });
    }
  },

  loadDocument: async (projectId, docId) => {
    // Flush any pending save first
    await get().flushPendingSave();

    set({ isLoadingDocument: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/documents/${docId}`);
      set({ activeDocument: data, isLoadingDocument: false });
    } catch {
      set({ isLoadingDocument: false });
    }
  },

  updateDocumentContent: (content) => {
    const doc = get().activeDocument;
    const project = get().currentProject;
    if (!doc || !project) return;

    // Update local state immediately
    set({ activeDocument: { ...doc, content } });

    // Track what needs saving (shared timeout with project content saves)
    pendingSaveId = project.id;
    pendingSaveContent = content;
    pendingSaveDocId = doc.id;

    // Debounced save to server (1 second)
    if (saveTimeout) clearTimeout(saveTimeout);
    set({ hasPendingChanges: true });
    saveTimeout = setTimeout(async () => {
      const saveProjectId = pendingSaveId;
      const saveContent = pendingSaveContent;
      const saveDocId = pendingSaveDocId;
      pendingSaveId = null;
      pendingSaveContent = null;
      pendingSaveDocId = null;
      saveTimeout = null;

      if (!saveProjectId || !saveContent || !saveDocId) return;
      set({ isSaving: true, saveError: null });
      try {
        await saveDocContentWithRetry(saveProjectId, saveDocId, saveContent);
        clearDocBackup(saveDocId);
        failedSaveId = null;
        failedSaveContent = null;
        failedSaveDocId = null;
        set({ isSaving: false, hasPendingChanges: false });
      } catch (err) {
        saveDocBackup(saveDocId, saveContent);
        failedSaveId = saveProjectId;
        failedSaveContent = saveContent;
        failedSaveDocId = saveDocId;
        set({ isSaving: false, saveError: classifySaveError(err) });
      }
    }, 1000);
  },

  clearActiveDocument: async () => {
    // Flush any pending save first
    await get().flushPendingSave();
    set({ activeDocument: null });
  },
}));
