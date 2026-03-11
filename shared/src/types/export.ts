import type { DocumentKind } from './project-document.js';

export type ExportFormat = 'pdf' | 'epub' | 'print_pdf';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ExportReviewStatus = 'passed' | 'needs_attention' | 'unavailable';
export type ExportReviewSeverity = 'info' | 'warning' | 'error';
export type ExportReviewCode =
  | 'EXPORT_CHAPTER_OPENER_LOW'
  | 'EXPORT_SECTION_TITLE_WRAP'
  | 'EXPORT_LAST_PAGE_UNDERFILLED'
  | 'EXPORT_REVIEW_UNAVAILABLE';
export type ExportReviewAutoFix =
  | 'shrink_h1_headings'
  | 'dedicated_end_page'
  | 'dedicated_chapter_openers';

export interface ExportReviewFinding {
  code: ExportReviewCode;
  severity: ExportReviewSeverity;
  page: number | null;
  message: string;
  details: Record<string, unknown> | null;
}

export interface ExportSectionReviewMetric {
  title: string;
  kind: DocumentKind | null;
  page: number | null;
  topRatio: number | null;
  lineCount: number | null;
  hyphenated: boolean;
}

export interface ExportReviewMetrics {
  pageCount: number;
  pageWidthPts: number | null;
  pageHeightPts: number | null;
  lastPageFillRatio: number | null;
  sectionStarts: ExportSectionReviewMetric[];
}

export interface ExportReview {
  status: ExportReviewStatus;
  score: number;
  generatedAt: string;
  summary: string;
  passCount: number;
  appliedFixes: ExportReviewAutoFix[];
  findings: ExportReviewFinding[];
  metrics: ExportReviewMetrics;
}

export interface ExportJob {
  id: string;
  projectId: string;
  userId: string;
  format: ExportFormat;
  status: ExportStatus;
  progress: number;
  outputUrl: string | null;
  errorMessage: string | null;
  review: ExportReview | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ExportRequest {
  format: ExportFormat;
}
