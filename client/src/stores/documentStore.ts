import { create } from 'zustand';
import type { DocumentContent } from '@dnd-booker/shared';
import api from '../lib/api';

interface Document {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  content: DocumentContent;
  createdAt: string;
  updatedAt: string;
}

interface DocumentState {
  documents: Document[];
  activeDocumentId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  hasPendingChanges: boolean;
  saveError: string | null;
  fetchDocuments: (projectId: string) => Promise<void>;
  setActiveDocument: (id: string) => void;
  updateDocumentContent: (id: string, content: DocumentContent) => void;
  createDocument: (projectId: string, title: string) => Promise<Document>;
  deleteDocument: (id: string) => Promise<void>;
  renameDocument: (id: string, title: string) => Promise<void>;
  reorderDocuments: (projectId: string, documentIds: string[]) => Promise<void>;
  /** Immediately flush the pending debounced save (call on unmount). */
  flushPendingSave: () => Promise<void>;
  /** Cancel any pending save without flushing (call on project switch). */
  cancelPendingSave: () => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSaveId: string | null = null;
let pendingSaveContent: DocumentContent | null = null;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  isLoading: false,
  isSaving: false,
  hasPendingChanges: false,
  saveError: null,

  fetchDocuments: async (projectId) => {
    set({ isLoading: true });
    try {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      set({
        documents: data,
        activeDocumentId: data.length > 0 ? data[0].id : null,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveDocument: (id) => set({ activeDocumentId: id }),

  updateDocumentContent: (id, content) => {
    // Update local state immediately
    set({
      documents: get().documents.map((d) =>
        d.id === id ? { ...d, content } : d,
      ),
    });

    // Track what needs saving
    pendingSaveId = id;
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
        await api.put(`/documents/${saveId}`, { content: saveContent });
        set({ isSaving: false, hasPendingChanges: false });
      } catch {
        set({ isSaving: false, saveError: 'Failed to save. Your changes may be lost.' });
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
      await api.put(`/documents/${saveId}`, { content: saveContent });
      set({ isSaving: false, hasPendingChanges: false });
    } catch {
      set({ isSaving: false, saveError: 'Failed to save. Your changes may be lost.' });
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

  createDocument: async (projectId, title) => {
    const { data } = await api.post(`/projects/${projectId}/documents`, {
      title,
    });
    set({ documents: [...get().documents, data], activeDocumentId: data.id });
    return data;
  },

  deleteDocument: async (id) => {
    const prev = get().documents;
    const prevActive = get().activeDocumentId;
    const remaining = prev.filter((d) => d.id !== id);
    set({
      documents: remaining,
      activeDocumentId: remaining.length > 0 ? remaining[0].id : null,
    });
    try {
      await api.delete(`/documents/${id}`);
    } catch (err) {
      set({ documents: prev, activeDocumentId: prevActive });
      throw err;
    }
  },

  renameDocument: async (id, title) => {
    const prev = get().documents;
    // Optimistic update
    set({
      documents: prev.map((d) => (d.id === id ? { ...d, title } : d)),
    });
    try {
      await api.patch(`/documents/${id}`, { title });
    } catch (err) {
      set({ documents: prev });
      throw err;
    }
  },

  reorderDocuments: async (projectId, documentIds) => {
    // Optimistically reorder local state
    const docMap = new Map(get().documents.map((d) => [d.id, d]));
    const reordered = documentIds
      .map((id, index) => {
        const doc = docMap.get(id);
        return doc ? { ...doc, sortOrder: index } : null;
      })
      .filter((d): d is Document => d !== null);
    set({ documents: reordered });

    try {
      await api.patch('/documents/reorder', { projectId, documentIds });
    } catch {
      // Revert on failure by re-fetching
      const { data } = await api.get(`/projects/${projectId}/documents`);
      set({ documents: data });
    }
  },
}));
