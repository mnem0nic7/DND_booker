import type { DocumentContent } from './document.js';

export type LayoutSpan = 'column' | 'both_columns' | 'full_page';
export type LayoutPlacement =
  | 'inline'
  | 'hero_top'
  | 'side_panel'
  | 'bottom_panel'
  | 'full_page_insert';
export type LayoutRecipe =
  | 'chapter_hero_split'
  | 'intro_split_spread'
  | 'npc_roster_grid'
  | 'encounter_packet_spread'
  | 'utility_table_spread'
  | 'full_page_insert';
export type LayoutColumnBalanceTarget = 'balanced' | 'dense_left' | 'dense_right';
export type PagePreset = 'standard_pdf' | 'print_pdf' | 'editor_preview' | 'epub';
export type PageRegionKind = 'hero' | 'full_width' | 'column_left' | 'column_right' | 'full_page';
export type PageBoundaryType = 'pageBreak' | 'autoGap' | 'end';

export interface LayoutPlanBlock {
  nodeId: string;
  presentationOrder: number;
  span: LayoutSpan;
  placement: LayoutPlacement;
  groupId: string | null;
  keepTogether: boolean;
  allowWrapBelow: boolean;
}

export interface LayoutPlan {
  version: 1;
  sectionRecipe: LayoutRecipe | null;
  columnBalanceTarget: LayoutColumnBalanceTarget;
  blocks: LayoutPlanBlock[];
}

export interface LayoutFlowFragment {
  nodeId: string;
  sourceIndex: number;
  presentationOrder: number;
  span: LayoutSpan;
  placement: LayoutPlacement;
  groupId: string | null;
  keepTogether: boolean;
  allowWrapBelow: boolean;
  nodeType: string;
  content: DocumentContent;
  unitId: string;
  isHero: boolean;
  isOpener: boolean;
}

export interface LayoutFlowUnit {
  id: string;
  fragmentNodeIds: string[];
  fragmentIndexes: number[];
  span: LayoutSpan;
  placement: LayoutPlacement;
  groupId: string | null;
  keepTogether: boolean;
  allowWrapBelow: boolean;
  isHero: boolean;
  isOpener: boolean;
}

export interface LayoutFlowModel {
  preset: PagePreset;
  sectionRecipe: LayoutRecipe | null;
  columnBalanceTarget: LayoutColumnBalanceTarget;
  fragments: LayoutFlowFragment[];
  units: LayoutFlowUnit[];
}

export interface MeasuredLayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MeasuredLayoutUnitMetric {
  unitId: string;
  heightPx: number;
}

export interface LayoutMeasurementFrame {
  pageWidthPx: number;
  pageHeightPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  columnWidthPx: number;
  columnCount: number;
  columnGapPx: number;
}

export interface PageModelFragment {
  nodeId: string;
  sourceIndex: number;
  presentationOrder: number;
  span: LayoutSpan;
  placement: LayoutPlacement;
  groupId: string | null;
  keepTogether: boolean;
  allowWrapBelow: boolean;
  nodeType: string;
  content: DocumentContent;
  unitId: string;
  pageIndex: number;
  columnIndex: number | null;
  region: PageRegionKind;
  bounds: MeasuredLayoutBounds;
  isHero: boolean;
  isOpener: boolean;
}

export interface PageModelColumnMetrics {
  leftFillRatio: number | null;
  rightFillRatio: number | null;
  deltaRatio: number | null;
}

export interface PageModelPage {
  index: number;
  preset: PagePreset;
  recipe: LayoutRecipe | null;
  fragments: PageModelFragment[];
  contentHeightPx: number;
  fillRatio: number;
  columnMetrics: PageModelColumnMetrics;
  nodeIds: string[];
  documentIds: string[];
  openerDocumentId: string | null;
  boundaryType: PageBoundaryType;
  boundaryNodeId: string | null;
  boundarySourceIndex: number | null;
}

export interface PageModel {
  preset: PagePreset;
  pages: PageModelPage[];
  fragments: PageModelFragment[];
  flow: LayoutFlowModel;
  metrics: {
    fragmentCount: number;
    heroFragmentCount: number;
    groupedFragmentCount: number;
    keepTogetherCount: number;
    pageCount: number;
  };
}

export interface LayoutPlanValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ResolveLayoutPlanOptions {
  documentKind?: string | null;
  documentTitle?: string | null;
  preferRecipe?: LayoutRecipe | null;
  respectManualPageBreaks?: boolean;
}
