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
  fetchDocuments: (projectId: string) => Promise<void>;
  setActiveDocument: (id: string) => void;
  updateDocumentContent: (id: string, content: DocumentContent) => void;
  createDocument: (projectId: string, title: string) => Promise<Document>;
  deleteDocument: (id: string) => Promise<void>;
  reorderDocuments: (projectId: string, documentIds: string[]) => Promise<void>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  activeDocumentId: null,
  isLoading: false,
  isSaving: false,
  hasPendingChanges: false,

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

    // Debounced save to server (1 second)
    if (saveTimeout) clearTimeout(saveTimeout);
    set({ hasPendingChanges: true });
    saveTimeout = setTimeout(async () => {
      set({ isSaving: true });
      try {
        await api.put(`/documents/${id}`, { content });
      } finally {
        set({ isSaving: false, hasPendingChanges: false });
        saveTimeout = null;
      }
    }, 1000);
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
