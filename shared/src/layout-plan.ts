import type { DocumentContent } from './types/document.js';
import type {
  LayoutColumnBalanceTarget,
  LayoutFlowFragment,
  LayoutFlowModel,
  LayoutFlowUnit,
  LayoutPlacement,
  LayoutPlan,
  LayoutPlanBlock,
  LayoutPlanValidationResult,
  LayoutRecipe,
  LayoutSpan,
  MeasuredLayoutUnitMetric,
  PageModel,
  PageModelFragment,
  PageModelPage,
  PagePreset,
  ResolveLayoutPlanOptions,
} from './types/layout-plan.js';

const VALID_LAYOUT_RECIPES = new Set<LayoutRecipe>([
  'chapter_hero_split',
  'intro_split_spread',
  'npc_roster_grid',
  'encounter_packet_spread',
  'utility_table_spread',
  'full_page_insert',
]);

const VALID_SPANS = new Set<LayoutSpan>(['column', 'both_columns', 'full_page']);
const VALID_PLACEMENTS = new Set<LayoutPlacement>([
  'inline',
  'hero_top',
  'side_panel',
  'bottom_panel',
  'full_page_insert',
]);
const VALID_BALANCE_TARGETS = new Set<LayoutColumnBalanceTarget>([
  'balanced',
  'dense_left',
  'dense_right',
]);

const ATOMIC_NODE_TYPES = new Set([
  'titlePage',
  'tableOfContents',
  'creditsPage',
  'backCover',
  'chapterHeader',
  'fullBleedImage',
  'mapBlock',
  'handout',
  'statBlock',
  'spellCard',
  'magicItem',
  'npcProfile',
  'encounterTable',
  'randomTable',
  'classFeature',
  'raceBlock',
  'readAloudBox',
  'sidebarCallout',
  'pageBreak',
  'columnBreak',
]);

const HERO_NODE_TYPES = new Set(['chapterHeader', 'fullBleedImage', 'mapBlock', 'handout']);
const GRID_NODE_TYPES = new Set(['npcProfile']);
const PACKET_NODE_TYPES = new Set([
  'statBlock',
  'encounterTable',
  'randomTable',
  'readAloudBox',
  'sidebarCallout',
  'handout',
  'mapBlock',
  'bulletList',
  'orderedList',
]);

interface PagePresetMetrics {
  pageWidthPx: number;
  pageHeightPx: number;
  pagePaddingX: number;
  pagePaddingY: number;
  footerReservePx: number;
  columnCount: number;
  columnGapPx: number;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== 'nodeId')
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'block';
}

function cloneNode(node: DocumentContent): DocumentContent {
  return {
    ...node,
    attrs: node.attrs ? { ...node.attrs } : undefined,
    marks: node.marks ? node.marks.map((mark) => ({ ...mark, attrs: mark.attrs ? { ...mark.attrs } : undefined })) : undefined,
    content: node.content ? node.content.map((child) => cloneNode(child)) : undefined,
  };
}

function getTopLevelBlocks(content: DocumentContent): DocumentContent[] {
  if (content.type !== 'doc') return [content];
  return content.content ?? [];
}

function buildNodeId(node: DocumentContent, seen: Map<string, number>): string {
  const base = `${slugify(node.type)}-${hashString(stableStringify(node)).slice(0, 8)}`;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function getNodeId(node: DocumentContent, fallbackIndex: number): string {
  const nodeId = node.attrs?.nodeId;
  if (typeof nodeId === 'string' && nodeId.trim()) return nodeId.trim();
  return `block-${fallbackIndex + 1}`;
}

function textLength(node: DocumentContent | undefined): number {
  if (!node) return 0;
  if (node.type === 'text') return String(node.text ?? '').trim().length;
  return (node.content ?? []).reduce((total, child) => total + textLength(child), 0);
}

function isShortLeadIn(node: DocumentContent | undefined): boolean {
  return Boolean(node) && node?.type === 'paragraph' && textLength(node) > 0 && textLength(node) <= 140;
}

function detectRecipe(blocks: DocumentContent[], options: ResolveLayoutPlanOptions): LayoutRecipe | null {
  if (options.preferRecipe && VALID_LAYOUT_RECIPES.has(options.preferRecipe)) {
    return options.preferRecipe;
  }

  if (blocks.length === 0) return null;

  const firstHeroCandidate = blocks.find((block) => HERO_NODE_TYPES.has(block.type));
  if (firstHeroCandidate) {
    return firstHeroCandidate.type === 'handout' ? 'full_page_insert' : 'chapter_hero_split';
  }

  const npcCount = blocks.filter((block) => block.type === 'npcProfile').length;
  if (npcCount >= 2) return 'npc_roster_grid';

  if (blocks.some((block) => block.type === 'statBlock' || block.type === 'encounterTable')) {
    return 'encounter_packet_spread';
  }

  if (blocks.some((block) => block.type === 'mapBlock' || block.type === 'handout' || block.type === 'randomTable')) {
    return 'utility_table_spread';
  }

  if (options.documentKind === 'front_matter') return 'intro_split_spread';
  return null;
}

function createDefaultBlockPlan(
  block: DocumentContent,
  sourceIndex: number,
  sectionRecipe: LayoutRecipe | null,
  blocks: DocumentContent[],
): LayoutPlanBlock {
  const nodeId = getNodeId(block, sourceIndex);
  let span: LayoutSpan = 'column';
  let placement: LayoutPlacement = 'inline';
  let keepTogether = ATOMIC_NODE_TYPES.has(block.type);
  let groupId: string | null = null;
  let allowWrapBelow = false;

  if (block.type === 'titlePage' || block.type === 'backCover') {
    span = 'full_page';
    placement = 'full_page_insert';
    keepTogether = true;
  } else if (block.type === 'tableOfContents' || block.type === 'creditsPage') {
    span = 'both_columns';
    keepTogether = true;
  } else if (sectionRecipe === 'chapter_hero_split' && sourceIndex === 0 && HERO_NODE_TYPES.has(block.type)) {
    span = 'both_columns';
    placement = 'hero_top';
    keepTogether = true;
    allowWrapBelow = true;
  } else if (block.type === 'fullBleedImage' || block.type === 'chapterHeader') {
    span = 'both_columns';
    keepTogether = true;
  }

  if (sectionRecipe === 'npc_roster_grid' && GRID_NODE_TYPES.has(block.type)) {
    groupId = 'npc-roster-1';
    keepTogether = true;
  }

  if (sectionRecipe === 'encounter_packet_spread') {
    const previous = blocks[sourceIndex - 1];
    const next = blocks[sourceIndex + 1];
    if (PACKET_NODE_TYPES.has(block.type) || isShortLeadIn(previous) && block.type === 'statBlock' || isShortLeadIn(block) && PACKET_NODE_TYPES.has(next?.type ?? '')) {
      groupId = 'encounter-packet-1';
      keepTogether = true;
      if (block.type === 'statBlock' || block.type === 'encounterTable' || block.type === 'mapBlock' || block.type === 'handout') {
        placement = 'side_panel';
      }
    }
  }

  if (sectionRecipe === 'utility_table_spread' && (block.type === 'mapBlock' || block.type === 'handout' || block.type === 'randomTable')) {
    groupId = 'utility-table-1';
    keepTogether = true;
    placement = block.type === 'handout' ? 'bottom_panel' : 'side_panel';
  }

  return {
    nodeId,
    presentationOrder: sourceIndex,
    span,
    placement,
    groupId,
    keepTogether,
    allowWrapBelow,
  };
}

function normalizeBlockPlan(
  block: LayoutPlanBlock,
  fallback: LayoutPlanBlock,
): LayoutPlanBlock {
  return {
    nodeId: fallback.nodeId,
    presentationOrder: Number.isFinite(block.presentationOrder) ? Number(block.presentationOrder) : fallback.presentationOrder,
    span: VALID_SPANS.has(block.span) ? block.span : fallback.span,
    placement: VALID_PLACEMENTS.has(block.placement) ? block.placement : fallback.placement,
    groupId: typeof block.groupId === 'string' && block.groupId.trim() ? block.groupId.trim() : fallback.groupId,
    keepTogether: typeof block.keepTogether === 'boolean' ? block.keepTogether : fallback.keepTogether,
    allowWrapBelow: typeof block.allowWrapBelow === 'boolean' ? block.allowWrapBelow : fallback.allowWrapBelow,
  };
}

export function ensureStableNodeIds(content: DocumentContent): DocumentContent {
  if (content.type !== 'doc' || !content.content) return content;

  const seen = new Map<string, number>();
  let changed = false;
  const nextBlocks = content.content.map((block) => {
    const attrs = block.attrs ?? {};
    if (typeof attrs.nodeId === 'string' && attrs.nodeId.trim()) {
      seen.set(attrs.nodeId.trim(), 1);
      return block;
    }

    changed = true;
    return {
      ...cloneNode(block),
      attrs: {
        ...attrs,
        nodeId: buildNodeId(block, seen),
      },
    };
  });

  if (!changed) return content;
  return { ...cloneNode(content), content: nextBlocks };
}

export function validateLayoutPlan(
  content: DocumentContent,
  layoutPlan: LayoutPlan | null | undefined,
): LayoutPlanValidationResult {
  if (!layoutPlan) return { valid: true, errors: [] };

  const blocks = getTopLevelBlocks(ensureStableNodeIds(content));
  const validNodeIds = new Set(blocks.map((block, index) => getNodeId(block, index)));
  const errors: string[] = [];

  if (layoutPlan.version !== 1) {
    errors.push(`Unsupported layout plan version: ${String(layoutPlan.version)}`);
  }

  if (layoutPlan.sectionRecipe !== null && !VALID_LAYOUT_RECIPES.has(layoutPlan.sectionRecipe)) {
    errors.push(`Unknown sectionRecipe "${String(layoutPlan.sectionRecipe)}"`);
  }

  if (!VALID_BALANCE_TARGETS.has(layoutPlan.columnBalanceTarget)) {
    errors.push(`Unknown columnBalanceTarget "${String(layoutPlan.columnBalanceTarget)}"`);
  }

  const seenOrders = new Set<number>();
  for (const block of layoutPlan.blocks) {
    if (!validNodeIds.has(block.nodeId)) {
      errors.push(`Layout plan references missing nodeId "${block.nodeId}"`);
    }

    if (seenOrders.has(block.presentationOrder)) {
      errors.push(`Duplicate presentationOrder ${block.presentationOrder}`);
    } else {
      seenOrders.add(block.presentationOrder);
    }

    if (!VALID_SPANS.has(block.span)) {
      errors.push(`Illegal span "${String(block.span)}" for nodeId "${block.nodeId}"`);
    }

    if (!VALID_PLACEMENTS.has(block.placement)) {
      errors.push(`Illegal placement "${String(block.placement)}" for nodeId "${block.nodeId}"`);
    }

    if (block.span === 'full_page' && block.placement !== 'full_page_insert') {
      errors.push(`full_page span requires full_page_insert placement for nodeId "${block.nodeId}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function buildDefaultLayoutPlan(
  content: DocumentContent,
  options: ResolveLayoutPlanOptions = {},
): LayoutPlan {
  const normalizedContent = ensureStableNodeIds(content);
  const blocks = getTopLevelBlocks(normalizedContent);
  const sectionRecipe = detectRecipe(blocks, options);
  const layoutBlocks = blocks.map((block, index) => createDefaultBlockPlan(block, index, sectionRecipe, blocks));

  if (sectionRecipe === 'chapter_hero_split') {
    const heroIndex = blocks.findIndex((block) => HERO_NODE_TYPES.has(block.type));
    if (heroIndex >= 0) {
      for (const layoutBlock of layoutBlocks) {
        if (layoutBlock.presentationOrder < heroIndex) {
          layoutBlock.presentationOrder += 1;
        }
      }

      const heroBlock = layoutBlocks[heroIndex];
      heroBlock.presentationOrder = 0;
      heroBlock.span = 'both_columns';
      heroBlock.placement = 'hero_top';
      heroBlock.keepTogether = true;
      heroBlock.allowWrapBelow = true;
    }
  }

  return {
    version: 1,
    sectionRecipe,
    columnBalanceTarget: 'balanced',
    blocks: layoutBlocks.sort((left, right) => left.presentationOrder - right.presentationOrder),
  };
}

export function resolveLayoutPlan(
  content: DocumentContent,
  layoutPlan: LayoutPlan | null | undefined,
  options: ResolveLayoutPlanOptions = {},
): { content: DocumentContent; layoutPlan: LayoutPlan; validation: LayoutPlanValidationResult } {
  const normalizedContent = ensureStableNodeIds(content);
  const defaultPlan = buildDefaultLayoutPlan(normalizedContent, options);

  if (!layoutPlan) {
    return {
      content: normalizedContent,
      layoutPlan: defaultPlan,
      validation: { valid: true, errors: [] },
    };
  }

  const validation = validateLayoutPlan(normalizedContent, layoutPlan);
  const defaultBlocksById = new Map(defaultPlan.blocks.map((block) => [block.nodeId, block]));
  const mergedBlocks = defaultPlan.blocks.map((defaultBlock) => {
    const matching = layoutPlan.blocks.find((candidate) => candidate.nodeId === defaultBlock.nodeId);
    return matching ? normalizeBlockPlan(matching, defaultBlock) : defaultBlock;
  });

  const usedOrders = new Set<number>();
  const normalizedOrders = mergedBlocks
    .sort((left, right) => left.presentationOrder - right.presentationOrder || left.nodeId.localeCompare(right.nodeId))
    .map((block, index) => {
      let presentationOrder = block.presentationOrder;
      if (!Number.isFinite(presentationOrder) || usedOrders.has(presentationOrder)) {
        presentationOrder = index;
      }
      usedOrders.add(presentationOrder);
      return {
        ...(defaultBlocksById.get(block.nodeId) ?? block),
        ...block,
        presentationOrder,
      };
    })
    .sort((left, right) => left.presentationOrder - right.presentationOrder);

  return {
    content: normalizedContent,
    layoutPlan: {
      version: 1,
      sectionRecipe: layoutPlan.sectionRecipe && VALID_LAYOUT_RECIPES.has(layoutPlan.sectionRecipe)
        ? layoutPlan.sectionRecipe
        : defaultPlan.sectionRecipe,
      columnBalanceTarget: VALID_BALANCE_TARGETS.has(layoutPlan.columnBalanceTarget)
        ? layoutPlan.columnBalanceTarget
        : 'balanced',
      blocks: normalizedOrders,
    },
    validation,
  };
}

export function recommendLayoutPlan(
  content: DocumentContent,
  currentLayoutPlan: LayoutPlan | null | undefined,
  options: ResolveLayoutPlanOptions & { reviewCodes?: string[]; isShortBook?: boolean } = {},
): LayoutPlan {
  const normalizedContent = ensureStableNodeIds(content);
  const codes = new Set(options.reviewCodes ?? []);
  const blocks = getTopLevelBlocks(normalizedContent);

  let preferRecipe = options.preferRecipe ?? null;
  if ((codes.has('EXPORT_WEAK_HERO_PLACEMENT') || codes.has('EXPORT_UNUSED_PAGE_REGION') || codes.has('EXPORT_UNBALANCED_COLUMNS'))
    && blocks.some((block) => HERO_NODE_TYPES.has(block.type))) {
    preferRecipe = 'chapter_hero_split';
  } else if (codes.has('EXPORT_SPLIT_SCENE_PACKET')
    && blocks.some((block) => block.type === 'statBlock' || block.type === 'encounterTable' || block.type === 'randomTable')) {
    preferRecipe = 'encounter_packet_spread';
  }

  const defaultPlan = buildDefaultLayoutPlan(normalizedContent, {
    ...options,
    preferRecipe,
  });
  const resolved = resolveLayoutPlan(normalizedContent, currentLayoutPlan ?? defaultPlan, {
    ...options,
    preferRecipe,
  });

  const nextPlan: LayoutPlan = {
    ...resolved.layoutPlan,
    sectionRecipe: defaultPlan.sectionRecipe,
    columnBalanceTarget: codes.has('EXPORT_UNBALANCED_COLUMNS') ? 'balanced' : resolved.layoutPlan.columnBalanceTarget,
    blocks: resolved.layoutPlan.blocks.map((block) => {
      const fallback = defaultPlan.blocks.find((candidate) => candidate.nodeId === block.nodeId) ?? block;
      if (codes.has('EXPORT_SPLIT_SCENE_PACKET') && fallback.groupId?.startsWith('encounter-packet')) {
        return {
          ...fallback,
          presentationOrder: block.presentationOrder,
        };
      }
      if ((codes.has('EXPORT_WEAK_HERO_PLACEMENT') || codes.has('EXPORT_UNUSED_PAGE_REGION')) && fallback.placement === 'hero_top') {
        return {
          ...fallback,
          presentationOrder: 0,
        };
      }
      return {
        ...block,
        groupId: block.groupId ?? fallback.groupId,
        keepTogether: block.keepTogether || fallback.keepTogether,
      };
    }).sort((left, right) => left.presentationOrder - right.presentationOrder),
  };

  return resolveLayoutPlan(normalizedContent, nextPlan, {
    ...options,
    preferRecipe,
  }).layoutPlan;
}

function getPagePresetMetrics(
  preset: PagePreset,
  options: ResolveLayoutPlanOptions = {},
): PagePresetMetrics {
  const isSingleColumnDocument = options.documentKind === 'front_matter' || options.documentKind === 'back_matter';

  if (preset === 'print_pdf') {
    return {
      pageWidthPx: 816,
      pageHeightPx: 1056,
      pagePaddingX: 72,
      pagePaddingY: 84,
      footerReservePx: 48,
      columnCount: isSingleColumnDocument ? 1 : 2,
      columnGapPx: 32,
    };
  }

  if (preset === 'epub') {
    return {
      pageWidthPx: 816,
      pageHeightPx: 2400,
      pagePaddingX: 0,
      pagePaddingY: 0,
      footerReservePx: 0,
      columnCount: 1,
      columnGapPx: 0,
    };
  }

  return {
    pageWidthPx: 816,
    pageHeightPx: 1056,
    pagePaddingX: 72,
    pagePaddingY: 72,
    footerReservePx: 48,
    columnCount: isSingleColumnDocument ? 1 : 2,
    columnGapPx: 32,
  };
}

function readNodeText(node: DocumentContent | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readNodeText(child)).join(' ');
}

function buildLayoutFlowUnits(fragments: LayoutFlowFragment[]): LayoutFlowUnit[] {
  const units: LayoutFlowUnit[] = [];
  let currentUnit: LayoutFlowUnit | null = null;

  for (const fragment of fragments) {
    const shouldGroup = Boolean(fragment.groupId);
    if (
      shouldGroup
      && currentUnit
      && currentUnit.groupId === fragment.groupId
      && currentUnit.placement === fragment.placement
      && currentUnit.span === fragment.span
    ) {
      currentUnit.fragmentNodeIds.push(fragment.nodeId);
      currentUnit.fragmentIndexes.push(fragment.sourceIndex);
      continue;
    }

    currentUnit = {
      id: shouldGroup ? `group:${fragment.groupId}` : `unit:${fragment.nodeId}`,
      fragmentNodeIds: [fragment.nodeId],
      fragmentIndexes: [fragment.sourceIndex],
      span: fragment.span,
      placement: fragment.placement,
      groupId: fragment.groupId,
      keepTogether: fragment.keepTogether,
      allowWrapBelow: fragment.allowWrapBelow,
      isHero: fragment.isHero,
      isOpener: fragment.isOpener,
    };
    units.push(currentUnit);
  }

  return units;
}

function estimateUnitHeight(unit: LayoutFlowUnit, fragments: LayoutFlowFragment[]): number {
  const fragmentSet = new Set(unit.fragmentNodeIds);
  const unitFragments = fragments.filter((fragment) => fragmentSet.has(fragment.nodeId));
  const textChars = unitFragments.reduce((total, fragment) => total + readNodeText(fragment.content).length, 0);
  const primaryTypes = new Set(unitFragments.map((fragment) => fragment.nodeType));

  if (unit.span === 'full_page' || unit.placement === 'full_page_insert') return 780;
  if (unit.isHero) return primaryTypes.has('chapterHeader') ? 260 : 340;
  if (unit.groupId?.startsWith('npc-roster')) {
    const rows = Math.max(1, Math.ceil(unit.fragmentNodeIds.length / 2));
    return rows * 210;
  }
  if (unit.groupId?.startsWith('encounter-packet')) {
    return Math.max(360, 220 + Math.ceil(textChars / 140) * 24);
  }
  if (unit.groupId?.startsWith('utility-table')) {
    return Math.max(260, 180 + Math.ceil(textChars / 160) * 22);
  }
  if (primaryTypes.has('statBlock')) return 320;
  if (primaryTypes.has('randomTable') || primaryTypes.has('encounterTable')) return 220;
  if (primaryTypes.has('npcProfile')) return 180;
  if (primaryTypes.has('mapBlock') || primaryTypes.has('handout') || primaryTypes.has('fullBleedImage')) return 260;
  if (primaryTypes.has('readAloudBox') || primaryTypes.has('sidebarCallout')) return 140 + Math.ceil(textChars / 140) * 18;
  if (primaryTypes.has('bulletList') || primaryTypes.has('orderedList')) return 90 + Math.ceil(textChars / 120) * 16;

  return Math.max(52, 32 + Math.ceil(textChars / 90) * 18);
}

function unitMeasurementMap(
  flow: LayoutFlowModel,
  measurements: MeasuredLayoutUnitMetric[] | null | undefined,
): Map<string, number> {
  const next = new Map<string, number>();
  for (const measurement of measurements ?? []) {
    next.set(measurement.unitId, Math.max(1, measurement.heightPx));
  }

  if (next.size > 0) return next;

  for (const unit of flow.units) {
    next.set(unit.id, estimateUnitHeight(unit, flow.fragments));
  }
  return next;
}

export function compileFlowModel(
  content: DocumentContent,
  layoutPlan: LayoutPlan | null | undefined,
  preset: PagePreset,
  options: ResolveLayoutPlanOptions = {},
): { content: DocumentContent; layoutPlan: LayoutPlan; flow: LayoutFlowModel; validation: LayoutPlanValidationResult } {
  const resolved = resolveLayoutPlan(content, layoutPlan, options);
  const blocks = getTopLevelBlocks(resolved.content);
  const blocksById = new Map(
    blocks.map((block, index) => [getNodeId(block, index), { block, sourceIndex: index }] as const),
  );

  const fragments: LayoutFlowFragment[] = resolved.layoutPlan.blocks
    .map((block): LayoutFlowFragment | null => {
      const source = blocksById.get(block.nodeId);
      if (!source) return null;

      return {
        nodeId: block.nodeId,
        sourceIndex: source.sourceIndex,
        presentationOrder: block.presentationOrder,
        span: block.span,
        placement: block.placement,
        groupId: block.groupId,
        keepTogether: block.keepTogether,
        allowWrapBelow: block.allowWrapBelow,
        nodeType: source.block.type,
        content: source.block,
        unitId: block.groupId ? `group:${block.groupId}` : `unit:${block.nodeId}`,
        isHero: block.placement === 'hero_top',
        isOpener: source.sourceIndex === 0 && (
          block.placement === 'hero_top'
          || source.block.type === 'titlePage'
          || source.block.type === 'chapterHeader'
          || block.span === 'full_page'
        ),
      };
    })
    .filter((fragment): fragment is LayoutFlowFragment => fragment !== null)
    .sort((left, right) => left.presentationOrder - right.presentationOrder);

  const flow: LayoutFlowModel = {
    preset,
    sectionRecipe: resolved.layoutPlan.sectionRecipe,
    columnBalanceTarget: resolved.layoutPlan.columnBalanceTarget,
    fragments,
    units: buildLayoutFlowUnits(fragments),
  };

  return {
    content: resolved.content,
    layoutPlan: resolved.layoutPlan,
    flow,
    validation: resolved.validation,
  };
}

function createPage(
  index: number,
  preset: PagePreset,
  recipe: LayoutRecipe | null,
  contentHeightPx: number,
): PageModelPage {
  return {
    index,
    preset,
    recipe,
    fragments: [],
    contentHeightPx,
    fillRatio: 0,
    columnMetrics: {
      leftFillRatio: null,
      rightFillRatio: null,
      deltaRatio: null,
    },
    nodeIds: [],
    documentIds: [],
    openerDocumentId: null,
  };
}

function assignUnitToPage(args: {
  page: PageModelPage;
  flow: LayoutFlowModel;
  unit: LayoutFlowUnit;
  pageIndex: number;
  columnIndex: number | null;
  region: PageModelFragment['region'];
  x: number;
  y: number;
  width: number;
  height: number;
  documentTitle: string | null | undefined;
}) {
  const {
    page,
    flow,
    unit,
    pageIndex,
    columnIndex,
    region,
    x,
    y,
    width,
    height,
    documentTitle,
  } = args;

  const fragmentLookup = new Map(flow.fragments.map((fragment) => [fragment.nodeId, fragment]));
  const nextFragments = unit.fragmentNodeIds
    .map((nodeId) => fragmentLookup.get(nodeId))
    .filter((fragment): fragment is LayoutFlowFragment => Boolean(fragment))
    .map((fragment): PageModelFragment => ({
      nodeId: fragment.nodeId,
      sourceIndex: fragment.sourceIndex,
      presentationOrder: fragment.presentationOrder,
      span: fragment.span,
      placement: fragment.placement,
      groupId: fragment.groupId,
      keepTogether: fragment.keepTogether,
      allowWrapBelow: fragment.allowWrapBelow,
      nodeType: fragment.nodeType,
      content: fragment.content,
      unitId: fragment.unitId,
      pageIndex,
      columnIndex,
      region,
      bounds: { x, y, width, height },
      isHero: fragment.isHero,
      isOpener: fragment.isOpener,
    }));

  page.fragments.push(...nextFragments);
  page.nodeIds.push(...unit.fragmentNodeIds);
  if (documentTitle) {
    if (!page.documentIds.includes(documentTitle)) page.documentIds.push(documentTitle);
    if (unit.isOpener && !page.openerDocumentId) {
      page.openerDocumentId = documentTitle;
    }
  }
}

function chooseColumn(
  leftHeight: number,
  rightHeight: number,
  balanceTarget: LayoutColumnBalanceTarget,
): 1 | 2 {
  if (balanceTarget === 'dense_left') {
    return leftHeight <= rightHeight || rightHeight === 0 ? 1 : 2;
  }

  if (balanceTarget === 'dense_right') {
    return rightHeight <= leftHeight || leftHeight === 0 ? 2 : 1;
  }

  return leftHeight <= rightHeight ? 1 : 2;
}

export function compileMeasuredPageModel(
  flow: LayoutFlowModel,
  measurements: MeasuredLayoutUnitMetric[] | null | undefined,
  options: ResolveLayoutPlanOptions = {},
): PageModel {
  const presetMetrics = getPagePresetMetrics(flow.preset, options);
  const contentWidth = Math.max(1, presetMetrics.pageWidthPx - (presetMetrics.pagePaddingX * 2));
  const contentHeight = Math.max(
    1,
    presetMetrics.pageHeightPx - (presetMetrics.pagePaddingY * 2) - presetMetrics.footerReservePx,
  );
  const columnWidth = presetMetrics.columnCount === 1
    ? contentWidth
    : (contentWidth - ((presetMetrics.columnCount - 1) * presetMetrics.columnGapPx)) / presetMetrics.columnCount;
  const measuredHeights = unitMeasurementMap(flow, measurements);

  if (flow.preset === 'epub') {
    const page = createPage(1, flow.preset, flow.sectionRecipe, contentHeight);
    let cursorY = 0;
    for (const unit of flow.units) {
      const height = measuredHeights.get(unit.id) ?? 120;
      assignUnitToPage({
        page,
        flow,
        unit,
        pageIndex: 1,
        columnIndex: 1,
        region: unit.isHero ? 'hero' : unit.span === 'full_page' ? 'full_page' : 'column_left',
        x: 0,
        y: cursorY,
        width: contentWidth,
        height,
        documentTitle: options.documentTitle,
      });
      cursorY += height + 24;
    }
    page.fillRatio = 1;
    page.columnMetrics = {
      leftFillRatio: 1,
      rightFillRatio: null,
      deltaRatio: null,
    };
    return {
      preset: flow.preset,
      pages: [page],
      fragments: [...page.fragments],
      flow,
      metrics: {
        fragmentCount: flow.fragments.length,
        heroFragmentCount: flow.fragments.filter((fragment) => fragment.isHero).length,
        groupedFragmentCount: flow.fragments.filter((fragment) => fragment.groupId !== null).length,
        keepTogetherCount: flow.fragments.filter((fragment) => fragment.keepTogether).length,
        pageCount: 1,
      },
    };
  }

  const pages: PageModelPage[] = [];
  let currentPage = createPage(1, flow.preset, flow.sectionRecipe, contentHeight);
  let leftHeight = 0;
  let rightHeight = 0;
  let reservedTop = 0;

  const flushPage = () => {
    if (currentPage.fragments.length === 0 && pages.length > 0) return;
    currentPage.fillRatio = Math.max(leftHeight, rightHeight, reservedTop) / contentHeight;
    currentPage.columnMetrics = {
      leftFillRatio: presetMetrics.columnCount >= 1 ? leftHeight / contentHeight : null,
      rightFillRatio: presetMetrics.columnCount >= 2 ? rightHeight / contentHeight : null,
      deltaRatio: presetMetrics.columnCount >= 2 ? Math.abs(leftHeight - rightHeight) / contentHeight : null,
    };
    pages.push(currentPage);
  };

  const startNewPage = () => {
    flushPage();
    currentPage = createPage(currentPage.index + 1, flow.preset, flow.sectionRecipe, contentHeight);
    leftHeight = 0;
    rightHeight = 0;
    reservedTop = 0;
  };

  for (const unit of flow.units) {
    const height = measuredHeights.get(unit.id) ?? 120;

    if (unit.span === 'full_page' || unit.placement === 'full_page_insert') {
      if (currentPage.fragments.length > 0) {
        startNewPage();
      }
      assignUnitToPage({
        page: currentPage,
        flow,
        unit,
        pageIndex: currentPage.index,
        columnIndex: null,
        region: 'full_page',
        x: 0,
        y: 0,
        width: contentWidth,
        height: contentHeight,
        documentTitle: options.documentTitle,
      });
      leftHeight = contentHeight;
      rightHeight = contentHeight;
      startNewPage();
      continue;
    }

    if (unit.isHero || unit.span === 'both_columns' || unit.groupId !== null) {
      const nextY = Math.max(leftHeight, rightHeight, reservedTop);
      if (nextY > 0 && nextY + height > contentHeight) {
        startNewPage();
      } else if (!unit.isHero && (leftHeight > reservedTop || rightHeight > reservedTop)) {
        startNewPage();
      }

      const y = Math.max(leftHeight, rightHeight, reservedTop);
      const region = unit.isHero ? 'hero' : 'full_width';
      assignUnitToPage({
        page: currentPage,
        flow,
        unit,
        pageIndex: currentPage.index,
        columnIndex: null,
        region,
        x: 0,
        y,
        width: contentWidth,
        height,
        documentTitle: options.documentTitle,
      });

      const nextHeight = y + height + 24;
      if (unit.isHero) {
        reservedTop = nextHeight;
        leftHeight = nextHeight;
        rightHeight = nextHeight;
      } else {
        leftHeight = nextHeight;
        rightHeight = nextHeight;
      }
      continue;
    }

    const preferredColumn = presetMetrics.columnCount === 1
      ? 1
      : chooseColumn(leftHeight, rightHeight, flow.columnBalanceTarget);
    const primaryHeight = preferredColumn === 1 ? leftHeight : rightHeight;
    const alternateHeight = preferredColumn === 1 ? rightHeight : leftHeight;

    let columnIndex: 1 | 2 = preferredColumn;
    if (primaryHeight + height > contentHeight) {
      if (presetMetrics.columnCount > 1 && alternateHeight + height <= contentHeight) {
        columnIndex = preferredColumn === 1 ? 2 : 1;
      } else {
        startNewPage();
        columnIndex = presetMetrics.columnCount === 1
          ? 1
          : chooseColumn(leftHeight, rightHeight, flow.columnBalanceTarget);
      }
    }

    const y = columnIndex === 1 ? leftHeight : rightHeight;
    const x = columnIndex === 1 ? 0 : columnWidth + presetMetrics.columnGapPx;
    assignUnitToPage({
      page: currentPage,
      flow,
      unit,
      pageIndex: currentPage.index,
      columnIndex,
      region: columnIndex === 1 ? 'column_left' : 'column_right',
      x,
      y,
      width: columnWidth,
      height,
      documentTitle: options.documentTitle,
    });

    if (columnIndex === 1) {
      leftHeight = y + height + 20;
    } else {
      rightHeight = y + height + 20;
    }
  }

  flushPage();

  const fragments = pages.flatMap((page) =>
    [...page.fragments].sort((left, right) => {
      if (left.pageIndex !== right.pageIndex) return left.pageIndex - right.pageIndex;
      if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
      return left.presentationOrder - right.presentationOrder;
    }),
  );

  return {
    preset: flow.preset,
    pages,
    fragments,
    flow,
    metrics: {
      fragmentCount: flow.fragments.length,
      heroFragmentCount: flow.fragments.filter((fragment) => fragment.isHero).length,
      groupedFragmentCount: flow.fragments.filter((fragment) => fragment.groupId !== null).length,
      keepTogetherCount: flow.fragments.filter((fragment) => fragment.keepTogether).length,
      pageCount: pages.length,
    },
  };
}

export function compilePageModel(
  content: DocumentContent,
  layoutPlan: LayoutPlan | null | undefined,
  preset: PagePreset,
  options: ResolveLayoutPlanOptions = {},
): PageModel {
  const resolved = compileFlowModel(content, layoutPlan, preset, options);
  return compileMeasuredPageModel(resolved.flow, null, options);
}
