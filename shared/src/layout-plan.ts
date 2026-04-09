import type { DocumentContent } from './types/document.js';
import { resolveRandomTableEntries } from './renderers/utils.js';
import type {
  LayoutColumnBalanceTarget,
  LayoutFlowBehavior,
  LayoutFlowFragment,
  LayoutFlowModel,
  LayoutFlowUnit,
  LayoutMeasurementFrame,
  LayoutPlacement,
  LayoutPlan,
  LayoutPlanBlock,
  LayoutPlanValidationResult,
  LayoutWrapSide,
  PageBoundaryType,
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
const HEADING_ATTACHMENT_NODE_TYPES = new Set([
  'paragraph',
  'bulletList',
  'orderedList',
  'readAloudBox',
  'sidebarCallout',
  'handout',
  'mapBlock',
]);
const LOCAL_UTILITY_ANCHOR_TYPES = new Set([
  'randomTable',
  'encounterTable',
]);
const LOCAL_SHOWCASE_UTILITY_ANCHOR_TYPES = new Set([
  'magicItem',
  'spellCard',
  'classFeature',
  'raceBlock',
]);
const WRAP_ELIGIBLE_NODE_TYPES = new Set([
  'readAloudBox',
  'sidebarCallout',
  'magicItem',
  'spellCard',
  'classFeature',
  'raceBlock',
  'npcProfile',
  'randomTable',
  'encounterTable',
  'statBlock',
]);
const WRAP_FLOW_SUPPORT_TYPES = new Set([
  'paragraph',
  'bulletList',
  'orderedList',
  'heading',
  'readAloudBox',
  'sidebarCallout',
]);
const LOCAL_UTILITY_SUPPORT_TYPES = new Set([
  'heading',
  'paragraph',
  'bulletList',
  'orderedList',
  'readAloudBox',
  'sidebarCallout',
]);
const REGROUPABLE_UTILITY_SUPPORT_GROUP_PREFIXES = [
  'section-packet-',
  'lead-label-packet-',
  'tail-packet-',
  'terminal-tail-packet-',
];

interface PagePresetMetrics {
  pageWidthPx: number;
  pageHeightPx: number;
  pagePaddingX: number;
  pagePaddingY: number;
  footerReservePx: number;
  columnCount: number;
  columnGapPx: number;
}

const COLUMN_FLOW_UNIT_GAP_PX = 6;
const FULL_WIDTH_UNIT_GAP_PX = 8;
const HERO_UNIT_GAP_PX = 10;
const INTRO_TAIL_PANEL_MAX_ESTIMATED_HEIGHT_PX = 190;
const INTRO_TAIL_PANEL_PADDING_PX = 20;
const INTRO_TAIL_PANEL_ROW_GAP_PX = 14;
const INTRO_TAIL_PANEL_SEGMENT_GAP_PX = 8;
const PACKET_GROUP_LAYOUT_RESERVE_PX = 20;
const INTRO_TAIL_GROUP_LAYOUT_RESERVE_PX = 28;
const WRAP_BODY_LINE_HEIGHT_PX = 24;
const WRAP_TWO_COLUMN_MAX_WIDTH_RATIO = 0.4;
const WRAP_SINGLE_COLUMN_MAX_WIDTH_RATIO = 0.33;
const WRAP_TWO_COLUMN_MAX_LINES = 16;
const WRAP_SINGLE_COLUMN_MAX_LINES = 22;

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

function slugify(value: string | null | undefined): string {
  return String(value ?? '')
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

function readLayoutHintSpan(node: DocumentContent | undefined): LayoutSpan | null {
  const span = typeof node?.attrs?.layoutSpanHint === 'string' ? node.attrs.layoutSpanHint.trim() : '';
  return VALID_SPANS.has(span as LayoutSpan) ? span as LayoutSpan : null;
}

function readLayoutHintPlacement(node: DocumentContent | undefined): LayoutPlacement | null {
  const placement = typeof node?.attrs?.layoutPlacementHint === 'string' ? node.attrs.layoutPlacementHint.trim() : '';
  return VALID_PLACEMENTS.has(placement as LayoutPlacement) ? placement as LayoutPlacement : null;
}

function isWrapEligibleTextNode(node: DocumentContent | undefined): boolean {
  return Boolean(node) && WRAP_ELIGIBLE_NODE_TYPES.has(node!.type);
}

function shouldIgnoreTextPlacementHint(
  node: DocumentContent | undefined,
  placement: LayoutPlacement | null,
): boolean {
  return isWrapEligibleTextNode(node)
    && (placement === 'side_panel' || placement === 'bottom_panel');
}

function readArtRole(node: DocumentContent | undefined): string {
  return typeof node?.attrs?.artRole === 'string' ? node.attrs.artRole.trim() : '';
}

function isGeneratedSpotArt(node: DocumentContent | undefined): boolean {
  return Boolean(node)
    && node?.type === 'fullBleedImage'
    && ['spot_art', 'column_fill_art', 'sparse_page_repair', 'overflow_spot_art'].includes(readArtRole(node));
}

function isHeroCandidate(node: DocumentContent | undefined): boolean {
  return Boolean(node)
    && HERO_NODE_TYPES.has(node!.type)
    && !isGeneratedSpotArt(node);
}

function textLength(node: DocumentContent | undefined): number {
  if (!node) return 0;
  if (node.type === 'text') return String(node.text ?? '').trim().length;
  return (node.content ?? []).reduce((total, child) => total + textLength(child), 0);
}

function isShortLeadIn(node: DocumentContent | undefined): boolean {
  return Boolean(node) && node?.type === 'paragraph' && textLength(node) > 0 && textLength(node) <= 140;
}

function isWideRandomTable(node: DocumentContent | undefined): boolean {
  return Boolean(node)
    && node?.type === 'randomTable'
    && resolveRandomTableEntries(node.attrs ?? {}).length >= 8;
}

function detectRecipe(blocks: DocumentContent[], options: ResolveLayoutPlanOptions): LayoutRecipe | null {
  if (options.preferRecipe && VALID_LAYOUT_RECIPES.has(options.preferRecipe)) {
    return options.preferRecipe;
  }

  if (blocks.length === 0) return null;

  const firstHeroCandidate = blocks.find((block) => isHeroCandidate(block));
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
  options: ResolveLayoutPlanOptions,
): LayoutPlanBlock {
  const nodeId = getNodeId(block, sourceIndex);
  let span: LayoutSpan = 'column';
  let placement: LayoutPlacement = 'inline';
  let keepTogether = ATOMIC_NODE_TYPES.has(block.type);
  let groupId: string | null = null;
  let allowWrapBelow = false;
  const hintedSpan = readLayoutHintSpan(block);
  const hintedPlacement = shouldIgnoreTextPlacementHint(block, readLayoutHintPlacement(block))
    ? null
    : readLayoutHintPlacement(block);

  if (block.type === 'titlePage' || block.type === 'backCover') {
    span = 'full_page';
    placement = 'full_page_insert';
    keepTogether = true;
  } else if (block.type === 'tableOfContents') {
    if (options.documentKind === 'front_matter') {
      span = 'full_page';
      placement = 'full_page_insert';
    } else {
      span = 'both_columns';
    }
    keepTogether = true;
  } else if (block.type === 'creditsPage') {
    span = 'both_columns';
    keepTogether = true;
  } else if (block.type === 'fullBleedImage' && hintedSpan && hintedPlacement) {
    span = hintedSpan;
    placement = hintedPlacement;
    keepTogether = true;
    allowWrapBelow = hintedPlacement === 'hero_top';
  } else if (isWideRandomTable(block)) {
    span = 'both_columns';
    keepTogether = true;
  } else if (sectionRecipe === 'chapter_hero_split' && sourceIndex === 0 && isHeroCandidate(block)) {
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

  if (
    sectionRecipe === 'encounter_packet_spread'
    && (block.type === 'statBlock' || block.type === 'encounterTable' || block.type === 'mapBlock' || block.type === 'handout')
  ) {
    keepTogether = true;
    if (block.type === 'mapBlock' || block.type === 'handout') {
      placement = 'side_panel';
    }
  }

  if (sectionRecipe === 'utility_table_spread' && (block.type === 'mapBlock' || block.type === 'handout' || block.type === 'randomTable')) {
    groupId = 'utility-table-1';
    keepTogether = true;
    if (block.type === 'handout') {
      placement = 'bottom_panel';
    } else if (block.type === 'mapBlock') {
      placement = 'side_panel';
    }
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

function applyNpcRosterGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let rosterIndex = 1;

  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index]?.type !== 'npcProfile' || layoutBlocks[index]?.groupId) continue;

    let end = index;
    while (blocks[end + 1]?.type === 'npcProfile' && !layoutBlocks[end + 1]?.groupId) {
      end += 1;
    }

    if (end === index) continue;

    const groupId = `npc-roster-${rosterIndex}`;
    rosterIndex += 1;
    for (let cursor = index; cursor <= end; cursor += 1) {
      layoutBlocks[cursor].groupId = groupId;
      layoutBlocks[cursor].keepTogether = true;
    }
    index = end;
  }
}

function isShortSupportBlock(node: DocumentContent | undefined): boolean {
  if (!node) return false;
  if (node.type === 'paragraph') return textLength(node) > 0 && textLength(node) <= 260;
  return node.type === 'bulletList' || node.type === 'orderedList';
}

function isLeadLabelParagraph(node: DocumentContent | undefined): boolean {
  if (!node || node.type !== 'paragraph') return false;
  const text = readNodeText(node).trim();
  return text.length > 0 && text.length <= 48 && text.endsWith(':');
}

function headingLevel(node: DocumentContent | undefined): number | null {
  if (!node || node.type !== 'heading') return null;
  const raw = node.attrs?.level;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function containsEncounterAnchor(nodes: DocumentContent[]): boolean {
  return nodes.some((node) =>
    node.type === 'statBlock'
    || node.type === 'encounterTable',
  );
}

function isEncounterAnchor(node: DocumentContent | undefined): boolean {
  return node?.type === 'statBlock' || node?.type === 'encounterTable';
}

function isEncounterPacketSupport(node: DocumentContent | undefined): boolean {
  if (!node) return false;
  return node.type === 'heading'
    || node.type === 'paragraph'
    || node.type === 'bulletList'
    || node.type === 'orderedList'
    || node.type === 'readAloudBox'
    || node.type === 'sidebarCallout'
    || node.type === 'fullBleedImage'
    || node.type === 'mapBlock'
    || node.type === 'handout';
}

function isEncounterPacketSupportForAnchor(
  node: DocumentContent | undefined,
  anchorType: DocumentContent['type'] | undefined,
): boolean {
  if (!isEncounterPacketSupport(node)) return false;
  if (anchorType !== 'statBlock') return true;

  return node?.type === 'heading'
    || node?.type === 'paragraph'
    || node?.type === 'readAloudBox';
}

function applyEncounterSectionGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let groupIndex = 1;

  for (let index = 0; index < blocks.length; index += 1) {
    const anchor = blocks[index];
    if (!isEncounterAnchor(anchor)) continue;
    const maxBefore = anchor.type === 'statBlock' ? 3 : 6;
    const maxAfter = anchor.type === 'statBlock' ? 1 : 3;

    let start = index;
    let beforeCount = 0;
    while (start > 0 && beforeCount < maxBefore) {
      const previous = blocks[start - 1];
      if (!previous || !isEncounterPacketSupportForAnchor(previous, anchor.type)) break;
      if (previous.type === 'heading') {
        start -= 1;
        break;
      }
      start -= 1;
      beforeCount += 1;
    }

    let end = index;
    let afterCount = 0;
    while (end + 1 < blocks.length && afterCount < maxAfter) {
      const next = blocks[end + 1];
      if (!next || !isEncounterPacketSupportForAnchor(next, anchor.type) || next.type === 'heading') break;
      end += 1;
      afterCount += 1;
    }

    const sectionBlocks = blocks.slice(start, end + 1);
    if (!containsEncounterAnchor(sectionBlocks)) {
      continue;
    }

    const groupId = `encounter-packet-${groupIndex}`;
    groupIndex += 1;

    for (let cursor = start; cursor <= end; cursor += 1) {
      if (blocks[cursor]?.type === 'horizontalRule') continue;
      layoutBlocks[cursor].groupId = groupId;
      layoutBlocks[cursor].keepTogether = true;
    }

    index = end;
  }
}

function applyHeadingAttachmentGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let groupIndex = 1;

  for (let index = 0; index < blocks.length - 1; index += 1) {
    const heading = blocks[index];
    const next = blocks[index + 1];
    if (heading?.type !== 'heading' || layoutBlocks[index]?.groupId) continue;
    if (!next || layoutBlocks[index + 1]?.groupId) continue;
    if (LOCAL_UTILITY_ANCHOR_TYPES.has(next.type)) continue;
    if (!HEADING_ATTACHMENT_NODE_TYPES.has(next.type)) continue;

    const members = [index, index + 1];
    const maybeThird = blocks[index + 2];
    if (
      next.type === 'paragraph'
      && maybeThird
      && !layoutBlocks[index + 2]?.groupId
      && (maybeThird.type === 'bulletList' || maybeThird.type === 'orderedList')
    ) {
      members.push(index + 2);
    }

    const groupId = `section-packet-${groupIndex}`;
    groupIndex += 1;
    for (const memberIndex of members) {
      layoutBlocks[memberIndex].groupId = groupId;
      layoutBlocks[memberIndex].keepTogether = true;
    }
    index = members[members.length - 1] - 1;
  }
}

function applyLeadLabelAttachmentGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let groupIndex = 1;

  for (let index = 0; index < blocks.length - 1; index += 1) {
    const label = blocks[index];
    const next = blocks[index + 1];
    if (!isLeadLabelParagraph(label) || layoutBlocks[index]?.groupId) continue;
    if (!next || layoutBlocks[index + 1]?.groupId) continue;
    if (!HEADING_ATTACHMENT_NODE_TYPES.has(next.type)) continue;

    const members = [index, index + 1];
    const maybeThird = blocks[index + 2];
    if (
      next.type === 'paragraph'
      && maybeThird
      && !layoutBlocks[index + 2]?.groupId
      && (maybeThird.type === 'bulletList' || maybeThird.type === 'orderedList')
    ) {
      members.push(index + 2);
    }

    const groupId = `lead-label-packet-${groupIndex}`;
    groupIndex += 1;
    for (const memberIndex of members) {
      layoutBlocks[memberIndex].groupId = groupId;
      layoutBlocks[memberIndex].keepTogether = true;
    }
    index = members[members.length - 1] - 1;
  }
}

function applyLocalUtilityPacketGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let groupIndex = 1;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const blockType = block?.type ?? '';
    const isUtilityAnchor = LOCAL_UTILITY_ANCHOR_TYPES.has(blockType) || LOCAL_SHOWCASE_UTILITY_ANCHOR_TYPES.has(blockType);
    const canRegroupSupportPacket = LOCAL_SHOWCASE_UTILITY_ANCHOR_TYPES.has(blockType);
    if (!isUtilityAnchor || layoutBlocks[index]?.groupId) continue;

    const members = [index];
    let start = index;

    const previous = blocks[index - 1];
    const previousPlan = layoutBlocks[index - 1];
    if (
      canRegroupSupportPacket
      && previousPlan?.groupId
      && REGROUPABLE_UTILITY_SUPPORT_GROUP_PREFIXES.some((prefix) => previousPlan.groupId?.startsWith(prefix))
    ) {
      const regroupedMembers = layoutBlocks
        .map((plan, planIndex) => ({ plan, planIndex }))
        .filter(({ planIndex, plan }) => planIndex < index && plan.groupId === previousPlan.groupId)
        .map(({ planIndex }) => planIndex);
      if (regroupedMembers.length > 0) {
        start = regroupedMembers[0] ?? start;
        members.unshift(...regroupedMembers);
      }
    }

    if (
      members.length === 1
      && previous
      && !previousPlan?.groupId
      && LOCAL_UTILITY_SUPPORT_TYPES.has(previous.type)
      && (previous.type === 'heading' || isShortSupportBlock(previous))
    ) {
      start = index - 1;
      members.unshift(index - 1);
      const beforePrevious = blocks[index - 2];
      if (
        previous.type !== 'heading'
        && beforePrevious?.type === 'heading'
        && !layoutBlocks[index - 2]?.groupId
      ) {
        start = index - 2;
        members.unshift(index - 2);
      }
    }

    const next = blocks[index + 1];
    if (
      next
      && !layoutBlocks[index + 1]?.groupId
      && (
        (next.type === 'paragraph' && textLength(next) <= 220)
        || next.type === 'sidebarCallout'
        || next.type === 'readAloudBox'
      )
    ) {
      members.push(index + 1);
    }

    if (members.length <= 1) continue;

    const groupId = `utility-table-${groupIndex}`;
    groupIndex += 1;
    for (const memberIndex of members) {
      layoutBlocks[memberIndex].groupId = groupId;
      layoutBlocks[memberIndex].keepTogether = true;
    }
    if (!isWrapEligibleTextNode(blocks[index])) {
      layoutBlocks[index].placement = 'side_panel';
    }
    layoutBlocks[index].keepTogether = true;
    index = Math.max(index, start);
  }
}

function isWrapFlowSupport(node: DocumentContent | undefined): boolean {
  if (!node) return false;
  if (!WRAP_FLOW_SUPPORT_TYPES.has(node.type)) return false;

  if (node.type === 'heading') {
    const level = headingLevel(node);
    return level !== null && level >= 3;
  }

  return true;
}

function isWrapFlowBoundary(node: DocumentContent | undefined): boolean {
  if (!node) return true;
  if (node.type === 'pageBreak' || node.type === 'columnBreak') return true;
  if (node.type === 'mapBlock' || node.type === 'handout' || node.type === 'fullBleedImage') return true;
  if (node.type === 'titlePage' || node.type === 'tableOfContents' || node.type === 'creditsPage' || node.type === 'backCover') return true;
  if (isWrapEligibleTextNode(node)) return true;
  const level = headingLevel(node);
  return level !== null && level <= 2;
}

function applyWrapFlowGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let groupIndex = 1;

  for (let index = 0; index < blocks.length; index += 1) {
    const anchor = blocks[index];
    const anchorPlan = layoutBlocks[index];
    if (!anchor || !anchorPlan || !isWrapEligibleTextNode(anchor)) continue;
    if (anchorPlan.groupId || anchorPlan.span === 'full_page' || anchorPlan.placement === 'full_page_insert') continue;

    const members = [index];
    let end = index;

    while (end + 1 < blocks.length && members.length < 5) {
      const next = blocks[end + 1];
      const nextPlan = layoutBlocks[end + 1];
      if (!next || !nextPlan) break;
      if (nextPlan.groupId) break;
      if (isWrapFlowBoundary(next)) break;
      if (!isWrapFlowSupport(next)) break;
      members.push(end + 1);
      end += 1;
    }

    if (members.length <= 1) continue;

    const groupId = `wrap-flow-${groupIndex}`;
    groupIndex += 1;
    for (const memberIndex of members) {
      layoutBlocks[memberIndex].groupId = groupId;
      layoutBlocks[memberIndex].keepTogether = true;
    }
    index = end;
  }
}

function applyShortTailParagraphGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  let groupIndex = 1;

  for (let index = 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    const previous = blocks[index - 1];
    if (!block || !previous) continue;
    if (block.type !== 'paragraph' || textLength(block) > 180) continue;
    if (isLeadLabelParagraph(block)) continue;
    if (
      !isShortSupportBlock(previous)
      && previous.type !== 'npcProfile'
      && previous.type !== 'sidebarCallout'
      && previous.type !== 'readAloudBox'
    ) {
      continue;
    }

    const previousPlan = layoutBlocks[index - 1];
    const currentPlan = layoutBlocks[index];
    if (!previousPlan || !currentPlan) continue;

    const groupId = previousPlan.groupId || `tail-packet-${groupIndex++}`;
    previousPlan.groupId = groupId;
    previousPlan.keepTogether = true;
    currentPlan.groupId = groupId;
    currentPlan.keepTogether = true;
  }
}

function applyTerminalOrphanTailGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  if (blocks.length < 2) return;

  const lastIndex = blocks.length - 1;
  const last = blocks[lastIndex];
  const previous = blocks[lastIndex - 1];
  if (!last || !previous) return;
  if (last.type !== 'paragraph' || textLength(last) > 220) return;

  const previousIsAttachable = previous.type === 'paragraph'
    || previous.type === 'bulletList'
    || previous.type === 'orderedList'
    || previous.type === 'sidebarCallout'
    || previous.type === 'readAloudBox'
    || previous.type === 'npcProfile'
    || previous.type === 'statBlock'
    || previous.type === 'encounterTable'
    || previous.type === 'randomTable';
  if (!previousIsAttachable) return;

  const previousPlan = layoutBlocks[lastIndex - 1];
  const currentPlan = layoutBlocks[lastIndex];
  if (!previousPlan || !currentPlan) return;

  const groupId = previousPlan.groupId || 'terminal-tail-packet-1';
  previousPlan.groupId = groupId;
  previousPlan.keepTogether = true;
  currentPlan.groupId = groupId;
  currentPlan.keepTogether = true;
}

function applyIntroTailPanelGrouping(
  blocks: DocumentContent[],
  layoutBlocks: LayoutPlanBlock[],
): void {
  const tailSegments: number[][] = [];
  let cursor = blocks.length - 1;

  while (cursor > 0) {
    const current = blocks[cursor];
    if (!current) break;

    let segment: number[] | null = null;
    if (
      (current.type === 'sidebarCallout' || current.type === 'readAloudBox')
      && !layoutBlocks[cursor]?.groupId
      && textLength(current) <= 520
    ) {
      segment = [cursor];
    } else {
      const heading = blocks[cursor - 1];
      if (
        heading
        && heading.type === 'heading'
        && !layoutBlocks[cursor - 1]?.groupId
        && !layoutBlocks[cursor]?.groupId
        && (current.type === 'bulletList' || current.type === 'orderedList')
        && textLength(current) <= 520
      ) {
        segment = [cursor - 1, cursor];
      }
    }

    if (!segment) break;

    tailSegments.unshift(segment);
    cursor = segment[0] - 1;

    if (tailSegments.length >= 2) break;
  }

  if (tailSegments.length === 0) return;
  if (estimateIntroTailBandHeight(blocks, tailSegments) > INTRO_TAIL_PANEL_MAX_ESTIMATED_HEIGHT_PX) return;

  const groupId = 'intro-tail-panel-1';
  for (const segment of tailSegments) {
    for (const memberIndex of segment) {
      layoutBlocks[memberIndex].groupId = groupId;
      layoutBlocks[memberIndex].keepTogether = true;
      layoutBlocks[memberIndex].span = 'both_columns';
      layoutBlocks[memberIndex].placement = 'bottom_panel';
    }
  }
}

function estimateIntroTailBlockHeight(block: DocumentContent | undefined): number {
  if (!block) return 0;

  const chars = textLength(block);
  switch (block.type) {
    case 'heading':
      return 34 + (Math.ceil(chars / 40) * 4);
    case 'bulletList':
    case 'orderedList':
      return 72 + (Math.ceil(chars / 100) * 18);
    case 'sidebarCallout':
    case 'readAloudBox':
      return 118 + (Math.ceil(chars / 120) * 18);
    case 'paragraph':
      return 52 + (Math.ceil(chars / 100) * 18);
    default:
      return 68 + (Math.ceil(chars / 110) * 16);
  }
}

function estimateIntroTailSegmentHeight(
  blocks: DocumentContent[],
  segment: number[],
): number {
  return segment.reduce((total, blockIndex, index) => (
    total
    + estimateIntroTailBlockHeight(blocks[blockIndex])
    + (index > 0 ? INTRO_TAIL_PANEL_SEGMENT_GAP_PX : 0)
  ), 0);
}

function estimateIntroTailBandHeight(
  blocks: DocumentContent[],
  tailSegments: number[][],
): number {
  const segmentHeights = tailSegments.map((segment) => estimateIntroTailSegmentHeight(blocks, segment));
  let totalHeight = INTRO_TAIL_PANEL_PADDING_PX;

  for (let index = 0; index < segmentHeights.length; index += 2) {
    const rowHeights = segmentHeights.slice(index, index + 2);
    if (index > 0) totalHeight += INTRO_TAIL_PANEL_ROW_GAP_PX;
    totalHeight += Math.max(...rowHeights);
  }

  return totalHeight;
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
    groupId: block.groupId === null
      ? null
      : (typeof block.groupId === 'string' && block.groupId.trim() ? block.groupId.trim() : fallback.groupId),
    keepTogether: typeof block.keepTogether === 'boolean' ? block.keepTogether : fallback.keepTogether,
    allowWrapBelow: typeof block.allowWrapBelow === 'boolean' ? block.allowWrapBelow : fallback.allowWrapBelow,
  };
}

function sanitizeEncounterPacketGroups(
  content: DocumentContent,
  blocks: LayoutPlanBlock[],
  defaultBlocksById: Map<string, LayoutPlanBlock>,
): LayoutPlanBlock[] {
  const topLevel = getTopLevelBlocks(content);
  const contentByNodeId = new Map(
    topLevel.map((block, index) => [getNodeId(block, index), block] as const),
  );
  const membersByGroupId = new Map<string, LayoutPlanBlock[]>();

  for (const block of blocks) {
    if (!block.groupId?.startsWith('encounter-packet-')) continue;
    const entry = membersByGroupId.get(block.groupId) ?? [];
    entry.push(block);
    membersByGroupId.set(block.groupId, entry);
  }

  const staleNodeIds = new Set<string>();
  for (const members of membersByGroupId.values()) {
    const memberNodes = members
      .map((member) => contentByNodeId.get(member.nodeId))
      .filter((node): node is DocumentContent => Boolean(node));
    const hasAnchor = containsEncounterAnchor(memberNodes);
    const isOversized = members.length > 8;
    const hasExplorationTable = memberNodes.some((node) => node.type === 'randomTable');
    if (!hasAnchor || isOversized || (hasExplorationTable && members.length > 6)) {
      for (const member of members) {
        staleNodeIds.add(member.nodeId);
      }
    }
  }

  if (staleNodeIds.size === 0) return blocks;

  return blocks.map((block) => {
    if (!staleNodeIds.has(block.nodeId)) return block;
    const fallback = defaultBlocksById.get(block.nodeId);
    if (!fallback) return block;
    return {
      ...fallback,
      presentationOrder: block.presentationOrder,
    };
  });
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
  const layoutBlocks = blocks.map((block, index) => createDefaultBlockPlan(block, index, sectionRecipe, blocks, options));

  if (sectionRecipe === 'chapter_hero_split') {
    const heroIndex = blocks.findIndex((block) => isHeroCandidate(block));
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

  applyNpcRosterGrouping(blocks, layoutBlocks);
  if (sectionRecipe !== 'intro_split_spread') {
    applyHeadingAttachmentGrouping(blocks, layoutBlocks);
    applyLeadLabelAttachmentGrouping(blocks, layoutBlocks);
    applyLocalUtilityPacketGrouping(blocks, layoutBlocks);
    applyWrapFlowGrouping(blocks, layoutBlocks);
    applyShortTailParagraphGrouping(blocks, layoutBlocks);
    applyTerminalOrphanTailGrouping(blocks, layoutBlocks);
    if (blocks.some((block) => block.type === 'statBlock' || block.type === 'encounterTable')) {
      applyEncounterSectionGrouping(blocks, layoutBlocks);
    }
  } else {
    applyIntroTailPanelGrouping(blocks, layoutBlocks);
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
  const sanitizedOrders = sanitizeEncounterPacketGroups(normalizedContent, normalizedOrders, defaultBlocksById)
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
      blocks: sanitizedOrders,
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
  const blockTypeById = new Map(
    blocks.map((block, index) => [getNodeId(block, index), block.type] as const),
  );
  const generatedSpotArtBlocks = [...blocks]
    .map((block, index) => ({ block, index, nodeId: getNodeId(block, index) }))
    .filter(({ block }) => isGeneratedSpotArt(block));
  const sparseArtNodeId = (
    codes.has('EXPORT_UNUSED_PAGE_REGION') || codes.has('EXPORT_LAST_PAGE_UNDERFILLED')
  )
    ? generatedSpotArtBlocks
      .filter(({ block }) => readArtRole(block) === 'sparse_page_repair')
      .map(({ nodeId }) => nodeId)
      .at(-1) ?? null
    : null;
  const columnArtNodeId = (
    codes.has('EXPORT_MISSED_ART_OPPORTUNITY')
    || codes.has('EXPORT_UNBALANCED_COLUMNS')
    || codes.has('EXPORT_SPLIT_SCENE_PACKET')
    || ((codes.has('EXPORT_UNUSED_PAGE_REGION') || codes.has('EXPORT_LAST_PAGE_UNDERFILLED')) && !sparseArtNodeId)
  )
    ? generatedSpotArtBlocks
      .filter(({ block }) => {
        const role = readArtRole(block);
        return role === 'spot_art' || role === 'column_fill_art' || role === 'overflow_spot_art';
      })
      .map(({ nodeId }) => nodeId)
      .at(-1) ?? null
    : null;

  let preferRecipe = options.preferRecipe ?? null;
  if ((codes.has('EXPORT_WEAK_HERO_PLACEMENT') || codes.has('EXPORT_UNUSED_PAGE_REGION') || codes.has('EXPORT_MISSED_ART_OPPORTUNITY') || codes.has('EXPORT_UNBALANCED_COLUMNS'))
    && blocks.some((block) => isHeroCandidate(block))) {
    preferRecipe = 'chapter_hero_split';
  } else if (codes.has('EXPORT_SPLIT_SCENE_PACKET')
    && blocks.some((block) => block.type === 'statBlock' || block.type === 'encounterTable' || block.type === 'randomTable')) {
    preferRecipe = 'encounter_packet_spread';
  }

  const defaultPlan = buildDefaultLayoutPlan(normalizedContent, {
    ...options,
    preferRecipe,
  });
  const shouldResetToDefault = options.documentKind === 'front_matter'
    && (
      codes.has('EXPORT_UNUSED_PAGE_REGION')
      || codes.has('EXPORT_UNBALANCED_COLUMNS')
      || codes.has('EXPORT_MISSED_ART_OPPORTUNITY')
      || codes.has('EXPORT_MARGIN_COLLISION')
      || codes.has('EXPORT_FOOTER_COLLISION')
      || codes.has('EXPORT_ORPHAN_TAIL_PARAGRAPH')
    );
  const resolved = resolveLayoutPlan(normalizedContent, currentLayoutPlan ?? defaultPlan, {
    ...options,
    preferRecipe,
  });
  const effectiveResolved = shouldResetToDefault
    ? resolveLayoutPlan(normalizedContent, defaultPlan, {
        ...options,
        preferRecipe,
      })
    : resolved;

  const nextPlan: LayoutPlan = {
    ...effectiveResolved.layoutPlan,
    sectionRecipe: defaultPlan.sectionRecipe,
    columnBalanceTarget: (
      codes.has('EXPORT_UNBALANCED_COLUMNS')
      || codes.has('EXPORT_MARGIN_COLLISION')
      || codes.has('EXPORT_FOOTER_COLLISION')
      || codes.has('EXPORT_ORPHAN_TAIL_PARAGRAPH')
    ) ? 'balanced' : effectiveResolved.layoutPlan.columnBalanceTarget,
    blocks: effectiveResolved.layoutPlan.blocks.map((block) => {
      const fallback = defaultPlan.blocks.find((candidate) => candidate.nodeId === block.nodeId) ?? block;
      if (
        (codes.has('EXPORT_SPLIT_SCENE_PACKET')
          || codes.has('EXPORT_FOOTER_COLLISION')
          || codes.has('EXPORT_MARGIN_COLLISION'))
        && fallback.groupId?.startsWith('encounter-packet')
      ) {
        const nodeType = blockTypeById.get(block.nodeId);
        if (codes.has('EXPORT_FOOTER_COLLISION') || codes.has('EXPORT_MARGIN_COLLISION')) {
          return {
            ...fallback,
            ...block,
            groupId: null,
            placement: (nodeType === 'statBlock' || nodeType === 'encounterTable' ? 'side_panel' : 'inline') as LayoutPlacement,
            keepTogether: (
              nodeType ? ATOMIC_NODE_TYPES.has(nodeType) : false
            ) || nodeType === 'readAloudBox' || nodeType === 'sidebarCallout',
            presentationOrder: block.presentationOrder,
          };
        }
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
      if (sparseArtNodeId && block.nodeId === sparseArtNodeId) {
        return {
          ...fallback,
          ...block,
          span: 'both_columns' as LayoutSpan,
          placement: 'bottom_panel' as LayoutPlacement,
          keepTogether: true,
        };
      }
      if (columnArtNodeId && block.nodeId === columnArtNodeId) {
        return {
          ...fallback,
          ...block,
          span: 'column' as LayoutSpan,
          placement: 'side_panel' as LayoutPlacement,
          keepTogether: true,
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
  sectionRecipe: LayoutRecipe | null = null,
): PagePresetMetrics {
  const isSingleColumnDocument = options.documentKind === 'back_matter'
    || (options.documentKind === 'front_matter' && sectionRecipe !== 'intro_split_spread');

  if (preset === 'print_pdf') {
    return {
      pageWidthPx: 816,
      pageHeightPx: 1056,
      pagePaddingX: 56,
      pagePaddingY: 56,
      footerReservePx: 56,
      columnCount: isSingleColumnDocument ? 1 : 2,
      columnGapPx: 18,
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

  if (preset === 'editor_preview') {
    return {
      pageWidthPx: 816,
      pageHeightPx: 1056,
      pagePaddingX: 60,
      pagePaddingY: 60,
      footerReservePx: 56,
      columnCount: isSingleColumnDocument ? 1 : 2,
      columnGapPx: 18,
    };
  }

  return {
    pageWidthPx: 816,
    pageHeightPx: 1056,
    pagePaddingX: 60,
    pagePaddingY: 60,
    footerReservePx: 56,
    columnCount: isSingleColumnDocument ? 1 : 2,
    columnGapPx: 18,
  };
}

function readNodeText(node: DocumentContent | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readNodeText(child)).join(' ');
}

function estimateStructuredFragmentHeight(fragment: LayoutFlowFragment): number {
  if (fragment.nodeType === 'randomTable') {
    const entries = resolveRandomTableEntries(fragment.content.attrs ?? {});
    if (entries.length === 0) return 220;
    const totalChars = entries.reduce((sum, entry) => sum + entry.roll.length + entry.result.length, 0);
    return 86 + (entries.length * 46) + (Math.ceil(totalChars / 90) * 10);
  }

  if (fragment.nodeType === 'npcProfile') {
    const attrs = fragment.content.attrs ?? {};
    const profileChars = [
      attrs.name,
      attrs.race,
      attrs.class,
      attrs.description,
      attrs.goal,
      attrs.whatTheyKnow,
      attrs.leverage,
      attrs.likelyReaction,
      attrs.personalityTraits,
      attrs.ideals,
      attrs.bonds,
      attrs.flaws,
    ]
      .map((value) => String(value ?? '').trim())
      .join(' ')
      .length;
    return 150 + Math.ceil(profileChars / 120) * 16;
  }

  return 0;
}

function isWrapCandidateFragment(fragment: Pick<LayoutFlowFragment, 'nodeType'>): boolean {
  return WRAP_ELIGIBLE_NODE_TYPES.has(fragment.nodeType);
}

function estimateWrapAnchorWidthRatio(fragment: LayoutFlowFragment): number {
  switch (fragment.nodeType) {
    case 'readAloudBox':
    case 'sidebarCallout':
      return 0.36;
    case 'magicItem':
    case 'spellCard':
    case 'classFeature':
    case 'raceBlock':
      return 0.38;
    case 'npcProfile':
      return 0.4;
    case 'encounterTable':
      return 0.42;
    case 'randomTable':
      return resolveRandomTableEntries(fragment.content.attrs ?? {}).length >= 8 ? 0.46 : 0.4;
    case 'statBlock':
      return 0.46;
    default:
      return 0.4;
  }
}

function estimateWrapAnchorChars(fragment: LayoutFlowFragment): number {
  if (fragment.nodeType === 'readAloudBox' || fragment.nodeType === 'sidebarCallout') {
    return Math.max(1, readNodeText(fragment.content).length);
  }

  return Math.max(1, stableStringify(fragment.content.attrs ?? {}).length);
}

function estimateWrapAnchorHeightPx(
  fragment: LayoutFlowFragment,
  wrapWidthPx: number,
): number {
  const structured = estimateStructuredFragmentHeight(fragment);
  const chars = estimateWrapAnchorChars(fragment);
  const charsPerLine = Math.max(18, Math.floor(wrapWidthPx / 7.2));
  const lines = Math.max(1, Math.ceil(chars / charsPerLine));
  const lineHeight = fragment.nodeType === 'statBlock' ? 17 : 18;
  const baseHeight = (() => {
    switch (fragment.nodeType) {
      case 'readAloudBox':
      case 'sidebarCallout':
        return 80;
      case 'magicItem':
      case 'spellCard':
      case 'classFeature':
      case 'raceBlock':
        return 96;
      case 'npcProfile':
        return 132;
      case 'randomTable':
        return 112;
      case 'encounterTable':
        return 118;
      case 'statBlock':
        return 180;
      default:
        return 88;
    }
  })();

  return Math.max(baseHeight + (lines * lineHeight), structured || 0);
}

function resolveUnitFlowSemantics(
  unit: LayoutFlowUnit,
  fragments: LayoutFlowFragment[],
  frame: LayoutMeasurementFrame,
): Pick<LayoutFlowUnit, 'flowBehavior' | 'wrapSide' | 'wrapEligible' | 'wrapWidthPx' | 'wrapWidthRatio'> {
  if (unit.span === 'full_page' || unit.placement === 'full_page_insert') {
    return {
      flowBehavior: 'full_page',
      wrapSide: null,
      wrapEligible: false,
      wrapWidthPx: null,
      wrapWidthRatio: null,
    };
  }

  const unitFragments = fragments.filter((fragment) => unit.fragmentNodeIds.includes(fragment.nodeId));
  const wrapAnchors = unitFragments.filter((fragment) => isWrapCandidateFragment(fragment));
  const wrapEligible = wrapAnchors.length === 1
    && !unit.isHero
    && !unit.groupId?.startsWith('npc-roster')
    && !unit.groupId?.startsWith('intro-tail-panel');

  if (!wrapEligible) {
    return {
      flowBehavior: 'wide_block',
      wrapSide: null,
      wrapEligible: false,
      wrapWidthPx: null,
      wrapWidthRatio: null,
    };
  }

  const availableWidthPx = frame.columnCount > 1 && unit.span === 'column'
    ? frame.columnWidthPx
    : frame.contentWidthPx;
  const wrapWidthRatio = estimateWrapAnchorWidthRatio(wrapAnchors[0]!);
  const wrapWidthPx = Math.max(120, Math.round(availableWidthPx * wrapWidthRatio));
  const maxWidthRatio = frame.columnCount > 1 && unit.span === 'column'
    ? WRAP_TWO_COLUMN_MAX_WIDTH_RATIO
    : WRAP_SINGLE_COLUMN_MAX_WIDTH_RATIO;
  const maxHeightPx = (frame.columnCount > 1 && unit.span === 'column'
    ? WRAP_TWO_COLUMN_MAX_LINES
    : WRAP_SINGLE_COLUMN_MAX_LINES) * WRAP_BODY_LINE_HEIGHT_PX;
  const wrapAnchorHeightPx = estimateWrapAnchorHeightPx(wrapAnchors[0]!, wrapWidthPx);
  const flowBehavior: LayoutFlowBehavior = wrapWidthRatio <= maxWidthRatio && wrapAnchorHeightPx <= maxHeightPx
    ? 'wrap_end'
    : 'wide_block';

  return {
    flowBehavior,
    wrapSide: flowBehavior === 'wide_block' ? null : 'end',
    wrapEligible: true,
    wrapWidthPx,
    wrapWidthRatio,
  };
}

function buildLayoutFlowUnits(fragments: LayoutFlowFragment[]): LayoutFlowUnit[] {
  const units: LayoutFlowUnit[] = [];
  let currentUnit: LayoutFlowUnit | null = null;

  for (const fragment of fragments) {
    const shouldGroup = Boolean(fragment.groupId);
    if (shouldGroup && currentUnit && currentUnit.groupId === fragment.groupId) {
      currentUnit.fragmentNodeIds.push(fragment.nodeId);
      currentUnit.fragmentIndexes.push(fragment.sourceIndex);
      currentUnit.span = mergeUnitSpan(currentUnit.span, fragment.span);
      currentUnit.placement = mergeUnitPlacement(currentUnit.placement, fragment.placement);
      currentUnit.flowBehavior = fragment.flowBehavior;
      currentUnit.wrapSide = fragment.wrapSide;
      currentUnit.wrapEligible = currentUnit.wrapEligible || fragment.wrapEligible;
      currentUnit.wrapWidthPx = fragment.wrapWidthPx ?? currentUnit.wrapWidthPx;
      currentUnit.wrapWidthRatio = fragment.wrapWidthRatio ?? currentUnit.wrapWidthRatio;
      currentUnit.keepTogether = currentUnit.keepTogether || fragment.keepTogether;
      currentUnit.allowWrapBelow = currentUnit.allowWrapBelow || fragment.allowWrapBelow;
      currentUnit.isHero = currentUnit.isHero || fragment.isHero;
      currentUnit.isOpener = currentUnit.isOpener || fragment.isOpener;
      continue;
    }

    currentUnit = {
      id: shouldGroup ? `group:${fragment.groupId}` : `unit:${fragment.nodeId}`,
      fragmentNodeIds: [fragment.nodeId],
      fragmentIndexes: [fragment.sourceIndex],
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
      isHero: fragment.isHero,
      isOpener: fragment.isOpener,
    };
    units.push(currentUnit);
  }

  return units;
}

function mergeUnitSpan(current: LayoutSpan, next: LayoutSpan): LayoutSpan {
  if (current === 'full_page' || next === 'full_page') return 'full_page';
  if (current === 'both_columns' || next === 'both_columns') return 'both_columns';
  return 'column';
}

function mergeUnitPlacement(current: LayoutPlacement, next: LayoutPlacement): LayoutPlacement {
  const rank: Record<LayoutPlacement, number> = {
    inline: 0,
    side_panel: 1,
    bottom_panel: 2,
    hero_top: 3,
    full_page_insert: 4,
  };

  return rank[next] > rank[current] ? next : current;
}

function estimateUnitHeight(unit: LayoutFlowUnit, fragments: LayoutFlowFragment[]): number {
  const fragmentSet = new Set(unit.fragmentNodeIds);
  const unitFragments = fragments.filter((fragment) => fragmentSet.has(fragment.nodeId));
  const textChars = unitFragments.reduce((total, fragment) => total + readNodeText(fragment.content).length, 0);
  const primaryTypes = new Set(unitFragments.map((fragment) => fragment.nodeType));
  const structuredHeight = unitFragments.reduce((total, fragment) => total + estimateStructuredFragmentHeight(fragment), 0);
  const wrapAnchor = unitFragments.find((fragment) => isWrapCandidateFragment(fragment));
  if (wrapAnchor && (unit.flowBehavior === 'wrap_end' || unit.flowBehavior === 'wrap_start')) {
    const wrapWidthPx = unit.wrapWidthPx ?? 220;
    const anchorHeight = estimateWrapAnchorHeightPx(wrapAnchor, wrapWidthPx);
    const bodyChars = unitFragments
      .filter((fragment) => fragment.nodeId !== wrapAnchor.nodeId)
      .reduce((total, fragment) => total + readNodeText(fragment.content).length, 0);
    const bodyHeight = bodyChars > 0
      ? Math.max(64, 28 + Math.ceil(bodyChars / 95) * 18)
      : 0;
    return Math.max(anchorHeight + 20, bodyHeight + 20);
  }

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
    return Math.max(280, 104 + structuredHeight + Math.ceil(textChars / 180) * 18);
  }
  if (primaryTypes.has('statBlock')) return 320;
  if (primaryTypes.has('randomTable')) return Math.max(220, structuredHeight);
  if (primaryTypes.has('encounterTable')) return 220;
  if (primaryTypes.has('npcProfile')) return Math.max(180, structuredHeight);
  if (primaryTypes.has('mapBlock') || primaryTypes.has('handout') || primaryTypes.has('fullBleedImage')) return 260;
  if (primaryTypes.has('readAloudBox') || primaryTypes.has('sidebarCallout')) return 140 + Math.ceil(textChars / 140) * 18;
  if (primaryTypes.has('bulletList') || primaryTypes.has('orderedList')) return 90 + Math.ceil(textChars / 120) * 16;

  return Math.max(52, 32 + Math.ceil(textChars / 90) * 18);
}

export function estimateFlowUnitHeight(unit: LayoutFlowUnit, fragments: LayoutFlowFragment[]): number {
  return estimateUnitHeight(unit, fragments);
}

function getUnitLayoutReserve(unit: LayoutFlowUnit, flow: LayoutFlowModel): number {
  if (unit.flowBehavior === 'wrap_end' || unit.flowBehavior === 'wrap_start') {
    return 12;
  }

  if (unit.groupId?.startsWith('intro-tail-panel')) {
    return INTRO_TAIL_GROUP_LAYOUT_RESERVE_PX;
  }

  if (unit.groupId?.startsWith('encounter-packet') || unit.groupId?.startsWith('utility-table')) {
    return PACKET_GROUP_LAYOUT_RESERVE_PX;
  }

  const nodeTypes = getUnitNodeTypes(unit, flow);
  if (nodeTypes.has('npcProfile')) {
    return 15;
  }

  if (nodeTypes.has('sidebarCallout') || nodeTypes.has('readAloudBox')) {
    return 36;
  }

  if (
    nodeTypes.has('statBlock')
    || nodeTypes.has('encounterTable')
    || nodeTypes.has('randomTable')
  ) {
    return 18;
  }

  if (nodeTypes.has('fullBleedImage')) {
    return 6;
  }

  return 0;
}

export function getLayoutMeasurementFrame(
  preset: PagePreset,
  options: ResolveLayoutPlanOptions = {},
  sectionRecipe: LayoutRecipe | null = null,
): LayoutMeasurementFrame {
  const presetMetrics = getPagePresetMetrics(preset, options, sectionRecipe);
  const contentWidthPx = Math.max(1, presetMetrics.pageWidthPx - (presetMetrics.pagePaddingX * 2));
  const contentHeightPx = Math.max(
    1,
    presetMetrics.pageHeightPx - (presetMetrics.pagePaddingY * 2) - presetMetrics.footerReservePx,
  );
  const columnWidthPx = presetMetrics.columnCount === 1
    ? contentWidthPx
    : (contentWidthPx - ((presetMetrics.columnCount - 1) * presetMetrics.columnGapPx)) / presetMetrics.columnCount;

  return {
    pageWidthPx: presetMetrics.pageWidthPx,
    pageHeightPx: presetMetrics.pageHeightPx,
    contentWidthPx,
    contentHeightPx,
    columnWidthPx,
    columnCount: presetMetrics.columnCount,
    columnGapPx: presetMetrics.columnGapPx,
  };
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

  const baseFragments: LayoutFlowFragment[] = resolved.layoutPlan.blocks
    .map((block): LayoutFlowFragment | null => {
      const source = blocksById.get(block.nodeId);
      if (!source) return null;

      return {
        nodeId: block.nodeId,
        sourceIndex: source.sourceIndex,
        presentationOrder: block.presentationOrder,
        span: block.span,
        placement: block.placement,
        flowBehavior: block.span === 'full_page' || block.placement === 'full_page_insert' ? 'full_page' : 'wide_block',
        wrapSide: null,
        wrapEligible: false,
        wrapWidthPx: null,
        wrapWidthRatio: null,
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
  const frame = getLayoutMeasurementFrame(preset, options, resolved.layoutPlan.sectionRecipe);
  const baseUnits = buildLayoutFlowUnits(baseFragments);
  const unitSemanticsById = new Map(
    baseUnits.map((unit) => [unit.id, resolveUnitFlowSemantics(unit, baseFragments, frame)] as const),
  );
  const fragments = baseFragments.map((fragment) => ({
    ...fragment,
    ...unitSemanticsById.get(fragment.unitId),
  }));
  const flow: LayoutFlowModel = {
    preset,
    sectionRecipe: resolved.layoutPlan.sectionRecipe,
    columnBalanceTarget: resolved.layoutPlan.columnBalanceTarget,
    fragments,
    units: buildLayoutFlowUnits(fragments).map((unit) => ({
      ...unit,
      ...unitSemanticsById.get(unit.id),
    })),
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
    boundaryType: 'end',
    boundaryNodeId: null,
    boundarySourceIndex: null,
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

function getUnitNodeTypes(unit: LayoutFlowUnit, flow: LayoutFlowModel): Set<string> {
  const nodeTypes = new Set<string>();
  for (const fragment of flow.fragments) {
    if (unit.fragmentNodeIds.includes(fragment.nodeId)) {
      nodeTypes.add(fragment.nodeType);
    }
  }
  return nodeTypes;
}

function shouldUseFullWidthRegion(
  unit: LayoutFlowUnit,
  flow: LayoutFlowModel,
  height: number,
  contentHeight: number,
): boolean {
  if (unit.flowBehavior === 'wrap_end' || unit.flowBehavior === 'wrap_start') return false;
  if (unit.span === 'both_columns') return true;
  if (!unit.groupId) return false;

  const nodeTypes = getUnitNodeTypes(unit, flow);
  if (unit.groupId.startsWith('npc-roster')) return true;
  if (unit.groupId.startsWith('encounter-packet')) {
    return nodeTypes.has('mapBlock')
      || nodeTypes.has('handout')
      || height >= contentHeight * 0.48;
  }
  if (unit.groupId.startsWith('utility-table')) {
    return nodeTypes.has('mapBlock')
      || nodeTypes.has('handout');
  }

  return false;
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

function getUnitFragmentsForPageModel(flow: LayoutFlowModel, unit: LayoutFlowUnit): LayoutFlowFragment[] {
  const fragmentSet = new Set(unit.fragmentNodeIds);
  return flow.fragments.filter((fragment) => fragmentSet.has(fragment.nodeId));
}

function getManualPageBreakFragment(flow: LayoutFlowModel, unit: LayoutFlowUnit): LayoutFlowFragment | null {
  const fragments = getUnitFragmentsForPageModel(flow, unit);
  if (fragments.length === 0) return null;

  return fragments.every((fragment) => fragment.nodeType === 'pageBreak')
    ? fragments[0] ?? null
    : null;
}

export function compileMeasuredPageModel(
  flow: LayoutFlowModel,
  measurements: MeasuredLayoutUnitMetric[] | null | undefined,
  options: ResolveLayoutPlanOptions = {},
): PageModel {
  const presetMetrics = getPagePresetMetrics(flow.preset, options, flow.sectionRecipe);
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
      if (options.respectManualPageBreaks && getManualPageBreakFragment(flow, unit)) {
        continue;
      }
      const height = measuredHeights.get(unit.id) ?? 120;
      const reserve = getUnitLayoutReserve(unit, flow);
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
      cursorY += height + FULL_WIDTH_UNIT_GAP_PX + reserve;
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

  const flushPage = (
    boundaryType: PageBoundaryType = 'end',
    boundaryFragment: LayoutFlowFragment | null = null,
    force = false,
  ) => {
    if (currentPage.fragments.length === 0 && pages.length > 0 && !force) return;
    currentPage.fillRatio = Math.max(leftHeight, rightHeight, reservedTop) / contentHeight;
    currentPage.columnMetrics = {
      leftFillRatio: presetMetrics.columnCount >= 1 ? leftHeight / contentHeight : null,
      rightFillRatio: presetMetrics.columnCount >= 2 ? rightHeight / contentHeight : null,
      deltaRatio: presetMetrics.columnCount >= 2 ? Math.abs(leftHeight - rightHeight) / contentHeight : null,
    };
    currentPage.boundaryType = boundaryType;
    currentPage.boundaryNodeId = boundaryFragment?.nodeId ?? null;
    currentPage.boundarySourceIndex = boundaryFragment?.sourceIndex ?? null;
    pages.push(currentPage);
  };

  const startNewPage = (
    boundaryType: Exclude<PageBoundaryType, 'end'> = 'autoGap',
    boundaryFragment: LayoutFlowFragment | null = null,
    force = false,
  ) => {
    flushPage(boundaryType, boundaryFragment, force);
    currentPage = createPage(currentPage.index + 1, flow.preset, flow.sectionRecipe, contentHeight);
    leftHeight = 0;
    rightHeight = 0;
    reservedTop = 0;
  };

  for (const unit of flow.units) {
    const manualPageBreakFragment = options.respectManualPageBreaks
      ? getManualPageBreakFragment(flow, unit)
      : null;
    if (manualPageBreakFragment) {
      startNewPage('pageBreak', manualPageBreakFragment, true);
      continue;
    }

    const height = measuredHeights.get(unit.id) ?? 120;
    const reserve = getUnitLayoutReserve(unit, flow);

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

    if (unit.isHero) {
      if (currentPage.fragments.length > 0) {
        startNewPage();
      }

      const y = Math.max(leftHeight, rightHeight, reservedTop);
      assignUnitToPage({
        page: currentPage,
        flow,
        unit,
        pageIndex: currentPage.index,
        columnIndex: null,
        region: 'hero',
        x: 0,
        y,
        width: contentWidth,
        height,
        documentTitle: options.documentTitle,
      });

      const nextHeight = y + height + HERO_UNIT_GAP_PX;
      reservedTop = nextHeight;
      leftHeight = nextHeight;
      rightHeight = nextHeight;
      continue;
    }

    if (shouldUseFullWidthRegion(unit, flow, height, contentHeight)) {
      const nextY = Math.max(leftHeight, rightHeight, reservedTop);
      if (nextY > 0 && nextY + height + reserve > contentHeight) {
        startNewPage();
      }

      const y = Math.max(leftHeight, rightHeight, reservedTop);
      const region = 'full_width';
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

      const nextHeight = y + height + FULL_WIDTH_UNIT_GAP_PX + reserve;
      leftHeight = nextHeight;
      rightHeight = nextHeight;
      continue;
    }

    const preferredColumn = presetMetrics.columnCount === 1
      ? 1
      : chooseColumn(leftHeight, rightHeight, flow.columnBalanceTarget);
    const primaryHeight = preferredColumn === 1 ? leftHeight : rightHeight;
    const alternateHeight = preferredColumn === 1 ? rightHeight : leftHeight;

    let columnIndex: 1 | 2 = preferredColumn;
    if (primaryHeight + height + reserve > contentHeight) {
      if (presetMetrics.columnCount > 1 && alternateHeight + height + reserve <= contentHeight) {
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
      leftHeight = y + height + COLUMN_FLOW_UNIT_GAP_PX + reserve;
    } else {
      rightHeight = y + height + COLUMN_FLOW_UNIT_GAP_PX + reserve;
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
