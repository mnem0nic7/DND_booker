import type { DocumentContent } from './types/document.js';
import type {
  LayoutColumnBalanceTarget,
  LayoutPlacement,
  LayoutPlan,
  LayoutPlanBlock,
  LayoutPlanValidationResult,
  LayoutRecipe,
  LayoutSpan,
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

export function compilePageModel(
  content: DocumentContent,
  layoutPlan: LayoutPlan | null | undefined,
  preset: PagePreset,
  options: ResolveLayoutPlanOptions = {},
): PageModel {
  const resolved = resolveLayoutPlan(content, layoutPlan, options);
  const blocksById = new Map(
    getTopLevelBlocks(resolved.content).map((block, index) => [getNodeId(block, index), block] as const),
  );

  const fragments: PageModelFragment[] = resolved.layoutPlan.blocks
    .map((block): PageModelFragment | null => {
      const sourceBlock = blocksById.get(block.nodeId);
      if (!sourceBlock) return null;

      const sourceIndex = getTopLevelBlocks(resolved.content).findIndex((candidate, index) => getNodeId(candidate, index) === block.nodeId);
      return {
        nodeId: block.nodeId,
        sourceIndex,
        presentationOrder: block.presentationOrder,
        span: block.span,
        placement: block.placement,
        groupId: block.groupId,
        keepTogether: block.keepTogether,
        allowWrapBelow: block.allowWrapBelow,
        nodeType: sourceBlock.type,
        content: sourceBlock,
      };
    })
    .filter((fragment): fragment is PageModelFragment => fragment !== null)
    .sort((left, right) => left.presentationOrder - right.presentationOrder);

  const pages: PageModelPage[] = [
    {
      index: 1,
      recipe: resolved.layoutPlan.sectionRecipe,
      fragments,
    },
  ];

  return {
    preset,
    pages,
    fragments,
    metrics: {
      fragmentCount: fragments.length,
      heroFragmentCount: fragments.filter((fragment) => fragment.placement === 'hero_top').length,
      groupedFragmentCount: fragments.filter((fragment) => fragment.groupId !== null).length,
      keepTogetherCount: fragments.filter((fragment) => fragment.keepTogether).length,
    },
  };
}
