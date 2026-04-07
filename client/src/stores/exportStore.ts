import { create } from 'zustand';
import { AxiosError } from 'axios';
import type { ExportFormat, ExportJob, ExportReviewFixChange } from '@dnd-booker/shared';
import { v1Client } from '../lib/api';

interface ExportState {
  isOpen: boolean;
  job: ExportJob | null;
  isExporting: boolean;
  isApplyingFixes: boolean;
  error: string | null;
  fixSummary: string | null;
  fixChanges: ExportReviewFixChange[];
  exportHistory: ExportJob[];
  openDialog: () => void;
  closeDialog: () => void;
  startExport: (projectId: string, format: ExportFormat) => Promise<void>;
  applyReviewFixes: (projectId: string, exportJobId: string) => Promise<void>;
  pollJobStatus: (jobId: string) => Promise<void>;
  fetchExportHistory: (projectId: string) => Promise<void>;
  reset: () => void;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollCount = 0;
const MAX_POLL_COUNT = 150; // 150 * 2s = 5 minutes max

function clearPollTimer() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollCount = 0;
}

export const useExportStore = create<ExportState>((set, get) => ({
  isOpen: false,
  job: null,
  isExporting: false,
  isApplyingFixes: false,
  error: null,
  fixSummary: null,
  fixChanges: [],
  exportHistory: [],

  openDialog: () => set({ isOpen: true }),

  closeDialog: () => {
    clearPollTimer();
    set({ isOpen: false });
  },

  startExport: async (projectId: string, format: ExportFormat) => {
    clearPollTimer();
    set({ isExporting: true, isApplyingFixes: false, error: null, fixSummary: null, fixChanges: [], job: null });

    try {
      const data = await v1Client.exports.createExportJob({ projectId }, { format });
      set({ job: data, isExporting: false });
      get().pollJobStatus(data.id);
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.error : null;
      set({ isExporting: false, error: message || 'Failed to start export' });
    }
  },

  applyReviewFixes: async (projectId, exportJobId) => {
    clearPollTimer();
    set({ isApplyingFixes: true, error: null, fixSummary: null, fixChanges: [] });

    try {
      const data = await v1Client.exports.applyExportJobFixes({ jobId: exportJobId });
      if (!data.exportJob) {
        set({
          isApplyingFixes: false,
          error: data.summary || 'No automatic export fixes were available.',
          fixChanges: data.changes ?? [],
        });
        return;
      }

      set({
        job: data.exportJob,
        isApplyingFixes: false,
        fixSummary: data.summary,
        fixChanges: data.changes ?? [],
      });
      get().pollJobStatus(data.exportJob.id);
      get().fetchExportHistory(projectId);
    } catch (err) {
      const message = err instanceof AxiosError ? err.response?.data?.error : null;
      set({
        isApplyingFixes: false,
        error: message || 'Failed to apply export fixes',
        fixChanges: [],
      });
    }
  },

  pollJobStatus: async (jobId: string) => {
    try {
      const data = await v1Client.exports.getExportJob({ jobId });
      set({ job: data });

      if (data.status === 'completed' || data.status === 'failed') {
        clearPollTimer();
        if (data.status === 'failed') {
          set({ error: data.errorMessage || 'Export failed' });
        }
        if (data.projectId) {
          get().fetchExportHistory(data.projectId).catch(() => {});
        }
        return;
      }

      // Stop after MAX_POLL_COUNT to avoid infinite polling on stuck jobs
      pollCount++;
      if (pollCount >= MAX_POLL_COUNT) {
        clearPollTimer();
        set({ error: 'Export timed out — please try again' });
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
      const data = await v1Client.exports.listExportJobs({ projectId });
      set({ exportHistory: data });
    } catch (err) {
      console.warn('[Export] Failed to load export history:', err);
    }
  },

  reset: () => {
    clearPollTimer();
    set({ job: null, isExporting: false, isApplyingFixes: false, error: null, fixSummary: null, fixChanges: [] });
  },
}));
