export type ExportFormat = 'pdf' | 'epub' | 'print_pdf';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface ExportJob {
  id: string;
  projectId: string;
  userId: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ExportRequest {
  format: ExportFormat;
}
