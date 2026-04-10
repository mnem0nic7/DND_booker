import { z } from 'zod';
import { compileFlowModel, compileMeasuredPageModel, getLayoutMeasurementFrame } from './layout-plan.js';
import type { DocumentContent } from './types/document.js';
import type {
  LayoutAnchor,
  LayoutColumnBalanceTarget,
  LayoutDiagnostic,
  LayoutDocumentV2,
  LayoutFlowFragment,
  LayoutFlowUnit,
  LayoutFragment,
  LayoutMeasurementMode,
  LayoutPage,
  LayoutPlan,
  LayoutPlacement,
  LayoutRecipe,
  LayoutSpan,
  LayoutWrapSide,
  MeasuredLayoutUnitMetric,
  PageBoundaryType,
  PageModel,
  PagePreset,
  PageRegionKind,
  ResolveLayoutPlanOptions,
} from './types/layout-plan.js';

export const LAYOUT_ENGINE_VERSION = 2 as const;

const LAYOUT_PLAN_BLOCK_SCHEMA = z.object({
  nodeId: z.string().min(1),
  presentationOrder: z.number().int(),
  span: z.enum(['column', 'both_columns', 'full_page']),
  placement: z.enum(['inline', 'hero_top', 'side_panel', 'bottom_panel', 'full_page_insert']),
  groupId: z.string().min(1).nullable(),
  keepTogether: z.boolean(),
  allowWrapBelow: z.boolean(),
});

const LAYOUT_PLAN_SCHEMA = z.object({
  version: z.literal(1),
  sectionRecipe: z.enum([
    'chapter_hero_split',
    'intro_split_spread',
    'npc_roster_grid',
    'encounter_packet_spread',
    'utility_table_spread',
    'full_page_insert',
  ]).nullable(),
  columnBalanceTarget: z.enum(['balanced', 'dense_left', 'dense_right']),
  blocks: z.array(LAYOUT_PLAN_BLOCK_SCHEMA),
});

const INLINE_MARK_SCHEMA = z.object({
  type: z.string().min(1),
  attrs: z.record(z.unknown()).optional(),
});

type LayoutRuntimeNode = DocumentContent;

const LayoutRuntimeNodeSchema: z.ZodType<LayoutRuntimeNode> = z.lazy(() => z.object({
  type: z.string().min(1),
  content: z.array(LayoutRuntimeNodeSchema).optional(),
  attrs: z.record(z.unknown()).optional(),
  marks: z.array(INLINE_MARK_SCHEMA).optional(),
  text: z.string().optional(),
}));

const MEASURED_LAYOUT_BOUNDS_SCHEMA = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const COLUMN_METRICS_SCHEMA = z.object({
  leftFillRatio: z.number().nullable(),
  rightFillRatio: z.number().nullable(),
  deltaRatio: z.number().nullable(),
});

const MEASUREMENT_FRAME_SCHEMA = z.object({
  pageWidthPx: z.number(),
  pageHeightPx: z.number(),
  contentWidthPx: z.number(),
  contentHeightPx: z.number(),
  columnWidthPx: z.number(),
  columnCount: z.number().int(),
  columnGapPx: z.number(),
});

export const LayoutAnchorSchema = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  fragmentIds: z.array(z.string().min(1)),
  fragmentNodeIds: z.array(z.string().min(1)),
  fragmentIndexes: z.array(z.number().int()),
  span: z.enum(['column', 'both_columns', 'full_page']),
  placement: z.enum(['inline', 'hero_top', 'side_panel', 'bottom_panel', 'full_page_insert']),
  flowBehavior: z.enum(['wrap_start', 'wrap_end', 'wide_block', 'full_page']),
  wrapSide: z.enum(['start', 'end']).nullable(),
  wrapEligible: z.boolean(),
  wrapWidthPx: z.number().nullable(),
  wrapWidthRatio: z.number().nullable(),
  groupId: z.string().min(1).nullable(),
  keepTogether: z.boolean(),
  allowWrapBelow: z.boolean(),
  isHero: z.boolean(),
  isOpener: z.boolean(),
});

export const LayoutFragmentSchema = z.object({
  id: z.string().min(1),
  nodeId: z.string().min(1),
  unitId: z.string().min(1),
  sourceIndex: z.number().int(),
  presentationOrder: z.number().int(),
  span: z.enum(['column', 'both_columns', 'full_page']),
  placement: z.enum(['inline', 'hero_top', 'side_panel', 'bottom_panel', 'full_page_insert']),
  flowBehavior: z.enum(['wrap_start', 'wrap_end', 'wide_block', 'full_page']),
  wrapSide: z.enum(['start', 'end']).nullable(),
  wrapEligible: z.boolean(),
  wrapWidthPx: z.number().nullable(),
  wrapWidthRatio: z.number().nullable(),
  groupId: z.string().min(1).nullable(),
  keepTogether: z.boolean(),
  allowWrapBelow: z.boolean(),
  nodeType: z.string().min(1),
  content: LayoutRuntimeNodeSchema,
  pageIndex: z.number().int().min(1),
  columnIndex: z.number().int().nullable(),
  region: z.enum(['hero', 'full_width', 'column_left', 'column_right', 'full_page']),
  bounds: MEASURED_LAYOUT_BOUNDS_SCHEMA,
  isHero: z.boolean(),
  isOpener: z.boolean(),
});

export const LayoutPageSchema = z.object({
  index: z.number().int().min(1),
  preset: z.enum(['standard_pdf', 'print_pdf', 'editor_preview', 'epub']),
  recipe: z.enum([
    'chapter_hero_split',
    'intro_split_spread',
    'npc_roster_grid',
    'encounter_packet_spread',
    'utility_table_spread',
    'full_page_insert',
  ]).nullable(),
  fragmentIds: z.array(z.string().min(1)),
  contentHeightPx: z.number(),
  fillRatio: z.number(),
  columnMetrics: COLUMN_METRICS_SCHEMA,
  nodeIds: z.array(z.string().min(1)),
  documentIds: z.array(z.string().min(1)),
  openerDocumentId: z.string().min(1).nullable(),
  boundaryType: z.enum(['pageBreak', 'autoGap', 'end']),
  boundaryNodeId: z.string().min(1).nullable(),
  boundarySourceIndex: z.number().int().nullable(),
});

export const LayoutMeasureProfileSchema = z.object({
  preset: z.enum(['standard_pdf', 'print_pdf', 'editor_preview', 'epub']),
  frame: MEASUREMENT_FRAME_SCHEMA,
  theme: z.string().nullable(),
  documentKind: z.string().nullable(),
  documentTitle: z.string().nullable(),
  respectManualPageBreaks: z.boolean(),
  measurementMode: z.enum(['estimated', 'deterministic', 'browser_capture']),
  fallbackScopeIds: z.array(z.string()),
});

export const LayoutDiagnosticSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  code: z.string().min(1),
  message: z.string().min(1),
  nodeId: z.string().min(1).nullable(),
  fragmentId: z.string().min(1).nullable(),
});

export const LayoutDocumentV2Schema = z.object({
  version: z.literal(LAYOUT_ENGINE_VERSION),
  preset: z.enum(['standard_pdf', 'print_pdf', 'editor_preview', 'epub']),
  sectionRecipe: z.enum([
    'chapter_hero_split',
    'intro_split_spread',
    'npc_roster_grid',
    'encounter_packet_spread',
    'utility_table_spread',
    'full_page_insert',
  ]).nullable(),
  columnBalanceTarget: z.enum(['balanced', 'dense_left', 'dense_right']),
  layoutPlan: LAYOUT_PLAN_SCHEMA.nullable(),
  measureProfile: LayoutMeasureProfileSchema,
  pages: z.array(LayoutPageSchema),
  fragments: z.array(LayoutFragmentSchema),
  anchors: z.array(LayoutAnchorSchema),
  diagnostics: z.array(LayoutDiagnosticSchema),
  metrics: z.object({
    fragmentCount: z.number().int(),
    heroFragmentCount: z.number().int(),
    groupedFragmentCount: z.number().int(),
    keepTogetherCount: z.number().int(),
    pageCount: z.number().int(),
  }),
  generatedAt: z.string().datetime(),
});

export interface BuildLayoutDocumentV2Input {
  content: DocumentContent;
  layoutPlan?: LayoutPlan | null;
  preset: PagePreset;
  theme?: string | null;
  measurements?: MeasuredLayoutUnitMetric[] | null;
  fallbackScopeIds?: string[];
  documentKind?: string | null;
  documentTitle?: string | null;
  generatedAt?: Date;
  measurementMode?: LayoutMeasurementMode;
  respectManualPageBreaks?: boolean;
}

function fragmentIdForNode(nodeId: string): string {
  return `fragment:${nodeId}`;
}

function toLayoutAnchor(unit: LayoutFlowUnit): LayoutAnchor {
  return {
    id: unit.id,
    unitId: unit.id,
    fragmentIds: unit.fragmentNodeIds.map(fragmentIdForNode),
    fragmentNodeIds: [...unit.fragmentNodeIds],
    fragmentIndexes: [...unit.fragmentIndexes],
    span: unit.span,
    placement: unit.placement,
    flowBehavior: unit.flowBehavior,
    wrapSide: unit.wrapSide,
    wrapEligible: unit.wrapEligible,
    wrapWidthPx: unit.wrapWidthPx,
    wrapWidthRatio: unit.wrapWidthRatio,
    groupId: unit.groupId,
    keepTogether: unit.keepTogether,
    allowWrapBelow: unit.allowWrapBelow,
    isHero: unit.isHero,
    isOpener: unit.isOpener,
  };
}

function toLayoutFragment(fragment: PageModel['fragments'][number]): LayoutFragment {
  return {
    id: fragmentIdForNode(fragment.nodeId),
    nodeId: fragment.nodeId,
    unitId: fragment.unitId,
    sourceIndex: fragment.sourceIndex,
    presentationOrder: fragment.presentationOrder,
    span: fragment.span,
    placement: fragment.placement,
    flowBehavior: fragment.flowBehavior,
    wrapSide: fragment.wrapSide,
    wrapEligible: fragment.wrapEligible,
    wrapWidthPx: fragment.wrapWidthPx,
    wrapWidthRatio: fragment.wrapWidthRatio,
    groupId: fragment.groupId,
    keepTogether: fragment.keepTogether,
    allowWrapBelow: fragment.allowWrapBelow,
    nodeType: fragment.nodeType,
    content: fragment.content,
    pageIndex: fragment.pageIndex,
    columnIndex: fragment.columnIndex,
    region: fragment.region,
    bounds: fragment.bounds,
    isHero: fragment.isHero,
    isOpener: fragment.isOpener,
  };
}

function toLayoutPage(page: PageModel['pages'][number]): LayoutPage {
  return {
    index: page.index,
    preset: page.preset,
    recipe: page.recipe,
    fragmentIds: page.fragments.map((fragment) => fragmentIdForNode(fragment.nodeId)),
    contentHeightPx: page.contentHeightPx,
    fillRatio: page.fillRatio,
    columnMetrics: page.columnMetrics,
    nodeIds: [...page.nodeIds],
    documentIds: [...page.documentIds],
    openerDocumentId: page.openerDocumentId,
    boundaryType: page.boundaryType,
    boundaryNodeId: page.boundaryNodeId,
    boundarySourceIndex: page.boundarySourceIndex,
  };
}

function toLayoutDiagnostic(error: string): LayoutDiagnostic {
  return {
    severity: 'error',
    code: 'LAYOUT_PLAN_VALIDATION_ERROR',
    message: error,
    nodeId: null,
    fragmentId: null,
  };
}

function toFlowFragment(fragment: LayoutFragment): LayoutFlowFragment {
  return {
    nodeId: fragment.nodeId,
    sourceIndex: fragment.sourceIndex,
    presentationOrder: fragment.presentationOrder,
    span: fragment.span,
    placement: fragment.placement,
    flowBehavior: fragment.flowBehavior,
    wrapSide: fragment.wrapSide,
    wrapEligible: fragment.wrapEligible,
    wrapWidthPx: fragment.wrapWidthPx,
    wrapWidthRatio: fragment.wrapWidthRatio,
    groupId: fragment.groupId,
    keepTogether: fragment.keepTogether,
    allowWrapBelow: fragment.allowWrapBelow,
    nodeType: fragment.nodeType,
    content: fragment.content,
    unitId: fragment.unitId,
    isHero: fragment.isHero,
    isOpener: fragment.isOpener,
  };
}

function toFlowUnit(anchor: LayoutAnchor): LayoutFlowUnit {
  return {
    id: anchor.unitId,
    fragmentNodeIds: [...anchor.fragmentNodeIds],
    fragmentIndexes: [...anchor.fragmentIndexes],
    span: anchor.span,
    placement: anchor.placement,
    flowBehavior: anchor.flowBehavior,
    wrapSide: anchor.wrapSide,
    wrapEligible: anchor.wrapEligible,
    wrapWidthPx: anchor.wrapWidthPx,
    wrapWidthRatio: anchor.wrapWidthRatio,
    groupId: anchor.groupId,
    keepTogether: anchor.keepTogether,
    allowWrapBelow: anchor.allowWrapBelow,
    isHero: anchor.isHero,
    isOpener: anchor.isOpener,
  };
}

export function buildLayoutDocumentV2(input: BuildLayoutDocumentV2Input): LayoutDocumentV2 {
  const respectManualPageBreaks = input.respectManualPageBreaks ?? true;
  const resolved = compileFlowModel(
    input.content,
    input.layoutPlan ?? null,
    input.preset,
    {
      documentKind: input.documentKind ?? null,
      documentTitle: input.documentTitle ?? null,
    },
  );
  const pageModel = compileMeasuredPageModel(
    resolved.flow,
    input.measurements ?? null,
    {
      documentKind: input.documentKind ?? null,
      documentTitle: input.documentTitle ?? null,
      respectManualPageBreaks,
    },
  );
  const generatedAt = input.generatedAt ?? new Date();
  const measurementMode = input.measurementMode
    ?? (input.measurements && input.measurements.length > 0 ? 'browser_capture' : 'deterministic');

  return {
    version: LAYOUT_ENGINE_VERSION,
    preset: pageModel.preset,
    sectionRecipe: pageModel.flow.sectionRecipe,
    columnBalanceTarget: pageModel.flow.columnBalanceTarget,
    layoutPlan: resolved.layoutPlan,
    measureProfile: {
      preset: input.preset,
      frame: getLayoutMeasurementFrame(input.preset, {
        documentKind: input.documentKind ?? null,
        documentTitle: input.documentTitle ?? null,
        respectManualPageBreaks,
      }, resolved.layoutPlan.sectionRecipe),
      theme: input.theme ?? null,
      documentKind: input.documentKind ?? null,
      documentTitle: input.documentTitle ?? null,
      respectManualPageBreaks,
      measurementMode,
      fallbackScopeIds: [...(input.fallbackScopeIds ?? [])],
    },
    pages: pageModel.pages.map(toLayoutPage),
    fragments: pageModel.fragments.map(toLayoutFragment),
    anchors: resolved.flow.units.map(toLayoutAnchor),
    diagnostics: resolved.validation.errors.map(toLayoutDiagnostic),
    metrics: pageModel.metrics,
    generatedAt: generatedAt.toISOString(),
  };
}

export function parseLayoutDocumentV2(value: unknown): LayoutDocumentV2 | null {
  const parsed = LayoutDocumentV2Schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isCurrentLayoutDocumentV2(value: unknown): value is LayoutDocumentV2 {
  const parsed = parseLayoutDocumentV2(value);
  return Boolean(parsed && parsed.version === LAYOUT_ENGINE_VERSION);
}

function compareAnchors(
  left: LayoutAnchor,
  right: LayoutAnchor,
  fragmentLookup: ReadonlyMap<string, LayoutFragment>,
): number {
  const leftFragment = left.fragmentIds.map((id) => fragmentLookup.get(id)).find(Boolean);
  const rightFragment = right.fragmentIds.map((id) => fragmentLookup.get(id)).find(Boolean);

  if (!leftFragment || !rightFragment) return left.unitId.localeCompare(right.unitId);
  if (leftFragment.presentationOrder !== rightFragment.presentationOrder) {
    return leftFragment.presentationOrder - rightFragment.presentationOrder;
  }
  return leftFragment.sourceIndex - rightFragment.sourceIndex;
}

export function layoutDocumentV2ToPageModel(snapshot: LayoutDocumentV2): PageModel {
  const fragmentLookup = new Map(snapshot.fragments.map((fragment) => [fragment.id, fragment] as const));
  const flowFragments = [...snapshot.fragments]
    .map((fragment) => toFlowFragment(fragment))
    .sort((left, right) => {
      if (left.presentationOrder !== right.presentationOrder) return left.presentationOrder - right.presentationOrder;
      return left.sourceIndex - right.sourceIndex;
    });
  const flowUnits = [...snapshot.anchors]
    .sort((left, right) => compareAnchors(left, right, fragmentLookup))
    .map((anchor) => toFlowUnit(anchor));
  const pageModelFragments = [...snapshot.fragments]
    .map((fragment) => ({
      nodeId: fragment.nodeId,
      sourceIndex: fragment.sourceIndex,
      presentationOrder: fragment.presentationOrder,
      span: fragment.span,
      placement: fragment.placement,
      flowBehavior: fragment.flowBehavior,
      wrapSide: fragment.wrapSide,
      wrapEligible: fragment.wrapEligible,
      wrapWidthPx: fragment.wrapWidthPx,
      wrapWidthRatio: fragment.wrapWidthRatio,
      groupId: fragment.groupId,
      keepTogether: fragment.keepTogether,
      allowWrapBelow: fragment.allowWrapBelow,
      nodeType: fragment.nodeType,
      content: fragment.content,
      unitId: fragment.unitId,
      pageIndex: fragment.pageIndex,
      columnIndex: fragment.columnIndex,
      region: fragment.region,
      bounds: fragment.bounds,
      isHero: fragment.isHero,
      isOpener: fragment.isOpener,
    }))
    .sort((left, right) => {
      if (left.pageIndex !== right.pageIndex) return left.pageIndex - right.pageIndex;
      if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
      return left.presentationOrder - right.presentationOrder;
    });

  return {
    preset: snapshot.preset,
    pages: snapshot.pages
      .map((page) => ({
        index: page.index,
        preset: page.preset,
        recipe: page.recipe,
        fragments: page.fragmentIds
          .map((id) => fragmentLookup.get(id))
          .filter((fragment): fragment is LayoutFragment => Boolean(fragment))
          .map((fragment) => ({
            nodeId: fragment.nodeId,
            sourceIndex: fragment.sourceIndex,
            presentationOrder: fragment.presentationOrder,
            span: fragment.span,
            placement: fragment.placement,
            flowBehavior: fragment.flowBehavior,
            wrapSide: fragment.wrapSide,
            wrapEligible: fragment.wrapEligible,
            wrapWidthPx: fragment.wrapWidthPx,
            wrapWidthRatio: fragment.wrapWidthRatio,
            groupId: fragment.groupId,
            keepTogether: fragment.keepTogether,
            allowWrapBelow: fragment.allowWrapBelow,
            nodeType: fragment.nodeType,
            content: fragment.content,
            unitId: fragment.unitId,
            pageIndex: fragment.pageIndex,
            columnIndex: fragment.columnIndex,
            region: fragment.region,
            bounds: fragment.bounds,
            isHero: fragment.isHero,
            isOpener: fragment.isOpener,
          })),
        contentHeightPx: page.contentHeightPx,
        fillRatio: page.fillRatio,
        columnMetrics: page.columnMetrics,
        nodeIds: [...page.nodeIds],
        documentIds: [...page.documentIds],
        openerDocumentId: page.openerDocumentId,
        boundaryType: page.boundaryType as PageBoundaryType,
        boundaryNodeId: page.boundaryNodeId,
        boundarySourceIndex: page.boundarySourceIndex,
      }))
      .sort((left, right) => left.index - right.index),
    fragments: pageModelFragments,
    flow: {
      preset: snapshot.preset,
      sectionRecipe: snapshot.sectionRecipe as LayoutRecipe | null,
      columnBalanceTarget: snapshot.columnBalanceTarget as LayoutColumnBalanceTarget,
      fragments: flowFragments,
      units: flowUnits,
    },
    metrics: snapshot.metrics,
  };
}

export type {
  LayoutAnchor,
  LayoutDiagnostic,
  LayoutDocumentV2,
  LayoutFragment,
  LayoutPage,
};
