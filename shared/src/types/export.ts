import type { DocumentKind } from './project-document.js';

export type ExportFormat = 'pdf' | 'epub' | 'print_pdf';
export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ExportReviewStatus = 'passed' | 'needs_attention' | 'unavailable';
export type ExportReviewSeverity = 'info' | 'warning' | 'error';
export type ExportReviewCode =
  | 'EXPORT_CHAPTER_OPENER_LOW'
  | 'EXPORT_SECTION_TITLE_WRAP'
  | 'EXPORT_LAST_PAGE_UNDERFILLED'
  | 'EXPORT_UNUSED_PAGE_REGION'
  | 'EXPORT_MISSED_ART_OPPORTUNITY'
  | 'EXPORT_WEAK_HERO_PLACEMENT'
  | 'EXPORT_SPLIT_SCENE_PACKET'
  | 'EXPORT_UNBALANCED_COLUMNS'
  | 'EXPORT_MARGIN_COLLISION'
  | 'EXPORT_FOOTER_COLLISION'
  | 'EXPORT_ORPHAN_TAIL_PARAGRAPH'
  | 'EXPORT_EMPTY_ENCOUNTER_TABLE'
  | 'EXPORT_INCOMPLETE_ENCOUNTER_PACKET'
  | 'EXPORT_EMPTY_RANDOM_TABLE'
  | 'EXPORT_THIN_RANDOM_TABLE'
  | 'EXPORT_PLACEHOLDER_STAT_BLOCK'
  | 'EXPORT_INCOMPLETE_STAT_BLOCK'
  | 'EXPORT_SUSPICIOUS_STAT_BLOCK'
  | 'EXPORT_OVERSIZED_DISPLAY_HEADING'
  | 'EXPORT_LOW_UTILITY_DENSITY'
  | 'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT'
  | 'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT'
  | 'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT'
  | 'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED'
  | 'EXPORT_REVIEW_UNAVAILABLE';
export type ExportReviewAutoFix =
  | 'shrink_h1_headings'
  | 'dedicated_end_page'
  | 'dedicated_chapter_openers'
  | 'refresh_layout_plan';
export type ExportReviewSafeFixAction =
  | 'remove_empty_encounter_tables'
  | 'remove_empty_random_tables'
  | 'remove_placeholder_stat_blocks'
  | 'demote_oversized_display_headings'
  | 'generate_spot_art'
  | 'normalize_page_breaks'
  | 'configure_text_layout_fallbacks'
  | 'refresh_layout_plan';

export interface ExportReviewTextLayoutParityMetrics {
  mode: 'legacy' | 'shadow' | 'pretext';
  legacyPageCount: number;
  enginePageCount: number;
  supportedUnitCount: number;
  unsupportedUnitCount: number;
  totalHeightDeltaPx: number;
  driftScopeIds: string[];
  unsupportedScopeIds: string[];
}

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

export interface ExportUtilityReviewMetric {
  title: string;
  kind: DocumentKind | null;
  utilityBlockCount: number;
  referenceBlockCount: number;
  proseParagraphCount: number;
  utilityDensity: number;
}

export interface ExportReviewMetrics {
  pageCount: number;
  pageWidthPts: number | null;
  pageHeightPts: number | null;
  lastPageFillRatio: number | null;
  sectionStarts: ExportSectionReviewMetric[];
  utilityCoverage: ExportUtilityReviewMetric[];
  textLayoutParity?: ExportReviewTextLayoutParityMetrics | null;
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

export interface ExportReviewFixChange {
  code: ExportReviewCode;
  action: ExportReviewSafeFixAction;
  title: string | null;
  count: number;
}

export interface ExportReviewFixResult {
  status: 'started' | 'no_review' | 'no_fixes';
  summary: string;
  appliedFixCount: number;
  documentsUpdated: number;
  changes: ExportReviewFixChange[];
  unsupportedFindingCount: number;
  exportJob: ExportJob | null;
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
