import { create } from 'zustand';
import axios from 'axios';
import type {
  DocumentContent,
  LayoutPlan,
  ProjectDocument,
  ProjectSettings,
  PublicationDocumentDetail,
  PublicationDocumentSummary,
} from '@dnd-booker/shared';
import api, { v1Client } from '../lib/api';
import {
  clearDocumentTextLayoutFallbacks as clearDocumentTextLayoutFallbacksInSettings,
} from '../lib/projectSettings';

export interface Project {
  id: string;
  title: string;
  description: string;
  type: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  status: 'draft' | 'in_progress' | 'review' | 'published';
  coverImageUrl: string | null;
  settings: ProjectSettings;
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
  updateProjectSettings: (settings: Partial<ProjectSettings>) => Promise<void>;
  clearDocumentTextLayoutFallbacks: (documentId: string) => Promise<void>;

  // Per-document editing
  documents: ProjectDocument[];
  activeDocument: ProjectDocument | null;
  isLoadingDocuments: boolean;
  isLoadingDocument: boolean;
  fetchDocuments: (projectId: string) => Promise<void>;
  loadDocument: (projectId: string, docId: string) => Promise<void>;
  updateDocumentContent: (content: DocumentContent) => void;
  updateDocumentLayoutPlan: (layoutPlan: LayoutPlan) => Promise<void>;
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
  expectedUpdatedAt?: string,
  maxAttempts = 3,
): Promise<PublicationDocumentDetail> {
  const backoffMs = [1000, 2000, 4000];
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await v1Client.documents.updateDocument(
        { projectId, docId },
        {
          editorProjectionJson: content,
          ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
        },
      );
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
    }
  }
  throw lastError;
}

function toProjectDocumentFromV1(
  document: PublicationDocumentDetail | PublicationDocumentSummary,
): ProjectDocument {
  const documentId = 'documentId' in document ? document.documentId : document.id;
  const content = 'editorProjectionJson' in document ? document.editorProjectionJson : null;
  const canonicalDocJson = 'canonicalDocJson' in document ? document.canonicalDocJson : null;
  const editorProjectionJson = 'editorProjectionJson' in document ? document.editorProjectionJson : null;
  const typstSource = 'typstSource' in document ? document.typstSource : null;

  return {
    id: documentId,
    projectId: document.projectId,
    runId: 'runId' in document ? document.runId ?? null : null,
    kind: document.kind,
    title: document.title,
    slug: document.slug,
    sortOrder: document.sortOrder,
    targetPageCount: document.targetPageCount,
    outlineJson: null,
    layoutPlan: null,
    content,
    canonicalDocJson,
    editorProjectionJson,
    typstSource,
    canonicalVersion: document.canonicalVersion,
    editorProjectionVersion: document.editorProjectionVersion,
    typstVersion: document.typstVersion,
    status: document.status,
    sourceArtifactId: document.sourceArtifactId,
    createdAt: 'createdAt' in document && typeof document.createdAt === 'string'
      ? document.createdAt
      : document.updatedAt,
    updatedAt: document.updatedAt,
  };
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
let pendingSaveDocUpdatedAt: string | null = null;
let failedSaveId: string | null = null;
let failedSaveContent: DocumentContent | null = null;
let failedSaveDocId: string | null = null;
let failedSaveDocUpdatedAt: string | null = null;

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
      pendingSaveDocUpdatedAt = null;
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
    const saveDocUpdatedAt = pendingSaveDocUpdatedAt;
    pendingSaveDocUpdatedAt = null;

    if (!saveId || !saveContent) return;
    set({ isSaving: true, saveError: null });
    try {
      if (saveDocId) {
        const updatedDoc = await saveDocContentWithRetry(saveId, saveDocId, saveContent, saveDocUpdatedAt ?? undefined);
        clearDocBackup(saveDocId);
        const nextDoc = toProjectDocumentFromV1(updatedDoc);
        set((state) => ({
          activeDocument: state.activeDocument?.id === nextDoc.id ? nextDoc : state.activeDocument,
          documents: state.documents.map((item) => item.id === nextDoc.id ? { ...item, ...nextDoc } : item),
        }));
      } else {
        await saveContentWithRetry(saveId, saveContent);
        clearBackup(saveId);
      }
      failedSaveId = null;
      failedSaveContent = null;
      failedSaveDocId = null;
      failedSaveDocUpdatedAt = null;
      set({ isSaving: false, hasPendingChanges: false });
    } catch (err) {
      if (saveDocId) {
        saveDocBackup(saveDocId, saveContent);
        failedSaveId = saveId;
        failedSaveContent = saveContent;
        failedSaveDocId = saveDocId;
        failedSaveDocUpdatedAt = saveDocUpdatedAt;
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
    pendingSaveDocUpdatedAt = null;
    set({ hasPendingChanges: false });
  },

  retrySave: async () => {
    const saveId = failedSaveId;
    const saveContent = failedSaveContent;
    const saveDocId = failedSaveDocId;
    const saveDocUpdatedAt = failedSaveDocUpdatedAt;
    if (!saveId || !saveContent) return;

    set({ isSaving: true, saveError: null });
    try {
      if (saveDocId) {
        const updatedDoc = await saveDocContentWithRetry(saveId, saveDocId, saveContent, saveDocUpdatedAt ?? undefined);
        clearDocBackup(saveDocId);
        const nextDoc = toProjectDocumentFromV1(updatedDoc);
        set((state) => ({
          activeDocument: state.activeDocument?.id === nextDoc.id ? nextDoc : state.activeDocument,
          documents: state.documents.map((item) => item.id === nextDoc.id ? { ...item, ...nextDoc } : item),
        }));
      } else {
        await saveContentWithRetry(saveId, saveContent);
        clearBackup(saveId);
      }
      failedSaveId = null;
      failedSaveContent = null;
      failedSaveDocId = null;
      failedSaveDocUpdatedAt = null;
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

  updateProjectSettings: async (settings) => {
    const project = get().currentProject;
    if (!project) return;

    await get().flushPendingSave();

    const previousProject = project;
    const previousProjects = get().projects;
    const nextSettings: ProjectSettings = {
      ...project.settings,
      ...settings,
    };

    set((state) => ({
      currentProject: state.currentProject ? { ...state.currentProject, settings: nextSettings } : state.currentProject,
      projects: state.projects.map((item) => item.id === project.id ? { ...item, settings: nextSettings } : item),
      isSaving: true,
      saveError: null,
    }));

    try {
      const { data } = await api.put(`/projects/${project.id}`, { settings });
      set((state) => ({
        currentProject: state.currentProject ? {
          ...state.currentProject,
          ...data,
          content: data.content ?? state.currentProject.content,
          settings: data.settings ?? nextSettings,
        } : state.currentProject,
        projects: state.projects.map((item) => item.id === project.id ? {
          ...item,
          ...data,
          settings: data.settings ?? nextSettings,
        } : item),
        isSaving: false,
      }));
    } catch (err) {
      set({
        currentProject: previousProject,
        projects: previousProjects,
        isSaving: false,
        saveError: classifySaveError(err),
      });
      throw err;
    }
  },

  clearDocumentTextLayoutFallbacks: async (documentId) => {
    const project = get().currentProject;
    if (!project) return;
    const nextFallbacks = clearDocumentTextLayoutFallbacksInSettings(project.settings, documentId);
    await get().updateProjectSettings({ textLayoutFallbacks: nextFallbacks });
  },

  // Per-document editing
  documents: [],
  activeDocument: null,
  isLoadingDocuments: false,
  isLoadingDocument: false,

  fetchDocuments: async (projectId) => {
    set({ isLoadingDocuments: true });
    try {
      const data = await v1Client.documents.listDocuments({ projectId });
      set({ documents: data.map((document) => toProjectDocumentFromV1(document)), isLoadingDocuments: false });
    } catch {
      set({ isLoadingDocuments: false });
    }
  },

  loadDocument: async (projectId, docId) => {
    // Flush any pending save first
    await get().flushPendingSave();

    set({ isLoadingDocument: true });
    try {
      const data = await v1Client.documents.getDocument({ projectId, docId });
      set({ activeDocument: toProjectDocumentFromV1(data), isLoadingDocument: false });
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
    pendingSaveDocUpdatedAt = doc.updatedAt;

    // Debounced save to server (1 second)
    if (saveTimeout) clearTimeout(saveTimeout);
    set({ hasPendingChanges: true });
    saveTimeout = setTimeout(async () => {
      const saveProjectId = pendingSaveId;
      const saveContent = pendingSaveContent;
      const saveDocId = pendingSaveDocId;
      const saveDocUpdatedAt = pendingSaveDocUpdatedAt;
      pendingSaveId = null;
      pendingSaveContent = null;
      pendingSaveDocId = null;
      pendingSaveDocUpdatedAt = null;
      saveTimeout = null;

      if (!saveProjectId || !saveContent || !saveDocId) return;
      set({ isSaving: true, saveError: null });
      try {
        const updatedDoc = await saveDocContentWithRetry(
          saveProjectId,
          saveDocId,
          saveContent,
          saveDocUpdatedAt ?? undefined,
        );
        clearDocBackup(saveDocId);
        failedSaveId = null;
        failedSaveContent = null;
        failedSaveDocId = null;
        failedSaveDocUpdatedAt = null;
        const nextDoc = toProjectDocumentFromV1(updatedDoc);
        set((state) => ({
          activeDocument: state.activeDocument?.id === nextDoc.id ? nextDoc : state.activeDocument,
          documents: state.documents.map((item) => item.id === nextDoc.id ? { ...item, ...nextDoc } : item),
          isSaving: false,
          hasPendingChanges: false,
        }));
      } catch (err) {
        saveDocBackup(saveDocId, saveContent);
        failedSaveId = saveProjectId;
        failedSaveContent = saveContent;
        failedSaveDocId = saveDocId;
        failedSaveDocUpdatedAt = saveDocUpdatedAt;
        set({ isSaving: false, saveError: classifySaveError(err) });
      }
    }, 1000);
  },

  updateDocumentLayoutPlan: async (layoutPlan) => {
    const doc = get().activeDocument;
    const project = get().currentProject;
    if (!doc || !project) return;

    set((state) => ({
      activeDocument: state.activeDocument ? { ...state.activeDocument, layoutPlan } : state.activeDocument,
      documents: state.documents.map((item) => item.id === doc.id ? { ...item, layoutPlan } : item),
      isSaving: true,
      saveError: null,
    }));

    try {
      const { data } = await api.put(`/projects/${project.id}/documents/${doc.id}/layout`, layoutPlan);
      set((state) => ({
        activeDocument: state.activeDocument?.id === data.id ? data : state.activeDocument,
        documents: state.documents.map((item) => item.id === data.id ? { ...item, layoutPlan: data.layoutPlan } : item),
        isSaving: false,
      }));
    } catch (err) {
      set((state) => ({
        activeDocument: state.activeDocument?.id === doc.id ? { ...state.activeDocument, layoutPlan: doc.layoutPlan } : state.activeDocument,
        documents: state.documents.map((item) => item.id === doc.id ? { ...item, layoutPlan: doc.layoutPlan } : item),
        isSaving: false,
        saveError: classifySaveError(err),
      }));
      throw err;
    }
  },

  clearActiveDocument: async () => {
    // Flush any pending save first
    await get().flushPendingSave();
    set({ activeDocument: null });
  },
}));
