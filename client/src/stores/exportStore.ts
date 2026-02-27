import { create } from 'zustand';
import { AxiosError } from 'axios';
import api from '../lib/api';

interface ExportJob {
  id: string;
  projectId: string;
  format: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface ExportState {
  isOpen: boolean;
  job: ExportJob | null;
  isExporting: boolean;
  error: string | null;
  exportHistory: ExportJob[];
  openDialog: () => void;
  closeDialog: () => void;
  startExport: (projectId: string, format: string) => Promise<void>;
  pollJobStatus: (jobId: string) => Promise<void>;
  fetchExportHistory: (projectId: string) => Promise<void>;
  reset: () => void;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

function clearPollTimer() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export const useExportStore = create<ExportState>((set, get) => ({
  isOpen: false,
  job: null,
  isExporting: false,
  error: null,
  exportHistory: [],

  openDialog: () => set({ isOpen: true }),

  closeDialog: () => {
    clearPollTimer();
    set({ isOpen: false });
  },

  startExport: async (projectId: string, format: string) => {
    clearPollTimer();
    set({ isExporting: true, error: null, job: null });

    try {
      const { data } = await api.post(`/projects/${projectId}/export`, { format });
      set({ job: data, isExporting: false });
      // Start polling for status updates
      get().pollJobStatus(data.id);
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.error : null;
      set({ isExporting: false, error: message || 'Failed to start export' });
    }
  },

  pollJobStatus: async (jobId: string) => {
    try {
      const { data } = await api.get(`/export-jobs/${jobId}`);
      set({ job: data });

      if (data.status === 'completed' || data.status === 'failed') {
        clearPollTimer();
        if (data.status === 'failed') {
          set({ error: data.errorMessage || 'Export failed' });
        }
        return;
      }

      // Continue polling every 2 seconds while queued or processing
      pollTimer = setTimeout(() => {
        get().pollJobStatus(jobId);
      }, 2000);
    } catch {
      clearPollTimer();
      set({ error: 'Failed to check export status' });
    }
  },

  fetchExportHistory: async (projectId: string) => {
    try {
      const { data } = await api.get(`/projects/${projectId}/export-jobs`);
      set({ exportHistory: data });
    } catch {
      // Non-critical: history fetch failure doesn't block export flow
    }
  },

  reset: () => {
    clearPollTimer();
    set({ job: null, isExporting: false, error: null });
  },
}));
