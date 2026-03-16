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
}

export interface PageModelPage {
  index: number;
  recipe: LayoutRecipe | null;
  fragments: PageModelFragment[];
}

export interface PageModel {
  preset: PagePreset;
  pages: PageModelPage[];
  fragments: PageModelFragment[];
  metrics: {
    fragmentCount: number;
    heroFragmentCount: number;
    groupedFragmentCount: number;
    keepTogetherCount: number;
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
}
