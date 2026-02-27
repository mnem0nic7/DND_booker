import { create } from 'zustand';
import api from '../lib/api';

export interface Project {
  id: string;
  title: string;
  description: string;
  type: 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
  status: 'draft' | 'in_progress' | 'review' | 'published';
  coverImageUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: { documents: number };
}

interface ProjectState {
  projects: Project[];
  isLoading: boolean;
  fetchProjects: () => Promise<void>;
  createProject: (data: { title: string; description?: string; type: string; templateId?: string }) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  isLoading: false,

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/projects');
      set({ projects: data, isLoading: false });
    } catch {
      set({ isLoading: false });
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
}));
