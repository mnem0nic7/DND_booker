import { ensureStableNodeIds, type DocumentContent } from '@dnd-booker/shared';
import { createAsset } from './asset.service.js';
import { getAiSettings, getDecryptedApiKey } from './ai-settings.service.js';
import { generateAiImage } from './ai-image.service.js';

const SUPPORTED_DOCUMENT_KINDS = new Set(['front_matter', 'chapter', 'appendix']);
const SPARSE_PAGE_CODES = new Set([
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_UNUSED_PAGE_REGION',
]);
const SPOT_ART_ROLE_VALUES = new Set([
  'spot_art',
  'column_fill_art',
  'sparse_page_repair',
  'overflow_spot_art',
]);
const DEFAULT_SPOT_ART_MODEL = 'gpt-image-1';
const COLUMN_SPOT_ART_SIZE = '1024x1536';
const WIDE_SPOT_ART_SIZE = '1536x1024';
const PREFLIGHT_SPOT_ART_TIMEOUT_MS = 25_000;

type SpotArtRole = 'spot_art' | 'column_fill_art' | 'sparse_page_repair' | 'overflow_spot_art';
type SpotArtPlacementHint = 'side_panel' | 'bottom_panel';
type SpotArtSpanHint = 'column' | 'both_columns';
type SpotArtPosition = 'half' | 'quarter' | 'full';

interface SpotArtCandidate {
  insertAt: number;
  role: SpotArtRole;
  heading: string;
  prompt: string;
  position: SpotArtPosition;
  layoutPlacementHint: SpotArtPlacementHint;
  layoutSpanHint: SpotArtSpanHint;
  imageGenerationSize: string;
}

interface MaterializeSparsePageArtInput {
  content: DocumentContent | null;
  kind?: string | null;
  title?: string | null;
  reviewCodes?: string[] | null;
}

interface MaterializeSparsePageArtResult {
  content: DocumentContent;
  changed: boolean;
  insertedNodeIds: string[];
  insertedCount: number;
}

interface RealizeSparsePageArtInput {
  projectId: string;
  userId: string;
  content: DocumentContent;
  insertedNodeIds: string[];
}

interface RealizeSparsePageArtResult {
  content: DocumentContent;
  changed: boolean;
  generatedCount: number;
  failedCount: number;
}

function asDoc(content: DocumentContent | null): DocumentContent {
  if (content?.type === 'doc') return content;
  return {
    type: 'doc',
    content: content ? [content] : [],
  };
}

function topLevelNodes(content: DocumentContent | null): DocumentContent[] {
  return [...(asDoc(content).content ?? [])];
}

function readText(node: DocumentContent | null | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readText(child)).join(' ');
}

function readStringAttr(node: DocumentContent | null | undefined, key: string): string {
  const value = node?.attrs?.[key];
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function headingText(node: DocumentContent | null | undefined): string {
  return readText(node).replace(/\s+/g, ' ').trim();
}

function isShortTrailingSupportBlock(node: DocumentContent | undefined): boolean {
  if (!node) return false;
  if (node.type === 'paragraph') {
    const text = readText(node).trim();
    return text.length > 0 && text.length <= 220;
  }
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'sidebarCallout' || node.type === 'readAloudBox') {
    return readText(node).trim().length <= 360;
  }
  return false;
}

function isSceneSupportBlock(node: DocumentContent | undefined): boolean {
  if (!node) return false;
  if (node.type === 'paragraph') return readText(node).trim().length >= 80;
  return node.type === 'bulletList'
    || node.type === 'orderedList'
    || node.type === 'readAloudBox'
    || node.type === 'sidebarCallout'
    || node.type === 'npcProfile'
    || node.type === 'randomTable'
    || node.type === 'encounterTable';
}

function findTrailingInsertionIndex(nodes: DocumentContent[]): number {
  if (nodes.length <= 1) return nodes.length;

  let trailingStart = nodes.length;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (isShortTrailingSupportBlock(nodes[index])) {
      trailingStart = index;
      continue;
    }
    break;
  }

  if (trailingStart < nodes.length && trailingStart > 1) {
    return trailingStart;
  }

  return nodes.length;
}

function hasNearbyImage(nodes: DocumentContent[], index: number): boolean {
  for (let cursor = Math.max(0, index - 2); cursor <= Math.min(nodes.length - 1, index + 2); cursor += 1) {
    const node = nodes[cursor];
    if (!node) continue;
    if (node.type === 'fullBleedImage' || node.type === 'mapBlock' || node.type === 'handout') {
      return true;
    }
  }
  return false;
}

function readSpotArtRole(node: DocumentContent | undefined): SpotArtRole | null {
  const value = readStringAttr(node, 'artRole');
  return SPOT_ART_ROLE_VALUES.has(value) ? value as SpotArtRole : null;
}

function countSpotArt(nodes: DocumentContent[]): Record<SpotArtRole, number> {
  const counts: Record<SpotArtRole, number> = {
    spot_art: 0,
    column_fill_art: 0,
    sparse_page_repair: 0,
    overflow_spot_art: 0,
  };

  for (const node of nodes) {
    const role = readSpotArtRole(node);
    if (role) counts[role] += 1;
  }

  return counts;
}

function limitForRole(role: SpotArtRole): number {
  if (role === 'spot_art') return 2;
  return 1;
}

function isColumnFillRole(role: SpotArtRole | null | undefined): boolean {
  return role === 'column_fill_art' || role === 'overflow_spot_art';
}

function dedupeSpotArtNodes(content: DocumentContent): { content: DocumentContent; changed: boolean } {
  const nodes = topLevelNodes(content);
  const indexesByRole: Record<SpotArtRole, number[]> = {
    spot_art: [],
    column_fill_art: [],
    sparse_page_repair: [],
    overflow_spot_art: [],
  };

  nodes.forEach((node, index) => {
    const role = readSpotArtRole(node);
    if (role) indexesByRole[role].push(index);
  });

  const indexesToRemove = new Set<number>();
  (Object.keys(indexesByRole) as SpotArtRole[]).forEach((role) => {
    const indexes = indexesByRole[role];
    const keepCount = limitForRole(role);
    if (indexes.length <= keepCount) return;

    const removable = indexes.slice(0, Math.max(0, indexes.length - keepCount));
    for (const index of removable) {
      indexesToRemove.add(index);
    }
  });

  if (indexesToRemove.size === 0) {
    return { content, changed: false };
  }

  const dedupedContent = ensureStableNodeIds({
    ...content,
    content: nodes.filter((_, index) => !indexesToRemove.has(index)),
  });

  return {
    content: dedupedContent,
    changed: true,
  };
}

function removeSpotArtRoles(
  content: DocumentContent,
  roles: SpotArtRole[],
): { content: DocumentContent; changed: boolean } {
  const rolesToRemove = new Set(roles);
  const nodes = topLevelNodes(content);
  const filtered = nodes.filter((node) => !rolesToRemove.has(readSpotArtRole(node) ?? 'spot_art'));
  if (filtered.length === nodes.length) {
    return { content, changed: false };
  }

  return {
    content: ensureStableNodeIds({
      ...content,
      content: filtered,
    }),
    changed: true,
  };
}

function clipText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/\s+\S*$/, '').trim()}...`;
}

function buildContextText(nodes: DocumentContent[], startIndex: number, title: string): string {
  const snippets: string[] = [];

  for (let index = Math.max(0, startIndex - 1); index < Math.min(nodes.length, startIndex + 3); index += 1) {
    const node = nodes[index];
    if (!node || node.type === 'fullBleedImage' || node.type === 'chapterHeader') continue;
    const snippet = clipText(readText(node), 220);
    if (snippet) snippets.push(snippet);
  }

  const joined = snippets.join(' ').replace(/\s+/g, ' ').trim();
  return joined || title;
}

function sanitizeTitle(value: string): string {
  return value.replace(/^chapter\s+\d+\s*:\s*/i, '').trim() || value.trim() || 'the current adventure scene';
}

function buildSpotArtPrompt(input: {
  title: string;
  heading: string;
  context: string;
  role: SpotArtRole;
  layoutPlacementHint: SpotArtPlacementHint;
  layoutSpanHint: SpotArtSpanHint;
}): string {
  const subject = sanitizeTitle(input.heading || input.title);
  const context = clipText(input.context, 360);
  const composition = input.layoutSpanHint === 'column'
    ? 'Vertical or near-vertical spot illustration designed to sit cleanly inside one text column without visible words'
    : 'Wide scene illustration designed as a bottom-panel spread beneath running text, without visible words';
  const emphasis = input.role === 'sparse_page_repair'
    ? 'Use a strong focal silhouette and atmospheric depth so the image can anchor an otherwise sparse page.'
    : isColumnFillRole(input.role)
      ? 'Use crisp shapes, restrained background detail, and a balanced silhouette so the art can break a long prose column.'
      : 'Use rich painterly detail and strong storytelling so the art feels like a premium RPG book spot illustration.';

  return [
    `Fantasy book illustration for the Dungeons & Dragons adventure scene "${subject}".`,
    `Scene context: ${context}.`,
    composition,
    emphasis,
    input.layoutPlacementHint === 'side_panel'
      ? 'Compose for a column-side insert with readable negative space around the subject.'
      : 'Compose for a bottom-panel insert that still leaves room for text above.',
    'No visible words, letters, captions, labels, logos, or watermark.',
  ].join(' ');
}

function buildSpotArtNode(candidate: SpotArtCandidate): DocumentContent {
  return {
    type: 'fullBleedImage',
    attrs: buildSpotArtAttrs(candidate),
  };
}

function collectBaselineCandidates(
  nodes: DocumentContent[],
  title: string,
  remainingBudget: number,
): SpotArtCandidate[] {
  const candidates: SpotArtCandidate[] = [];

  for (let index = 0; index < nodes.length && candidates.length < remainingBudget; index += 1) {
    const node = nodes[index];
    if (node?.type !== 'heading') continue;

    let anchorIndex = -1;
    for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
      if (nodes[cursor]?.type === 'heading') break;
      if (isSceneSupportBlock(nodes[cursor])) {
        anchorIndex = cursor;
        break;
      }
    }

    if (anchorIndex < 0 || hasNearbyImage(nodes, anchorIndex + 1)) continue;

    const heading = headingText(node) || title;
    const context = buildContextText(nodes, anchorIndex, title);
    candidates.push({
      insertAt: anchorIndex + 1,
      role: 'spot_art',
      heading,
      prompt: buildSpotArtPrompt({
        title,
        heading,
        context,
        role: 'spot_art',
        layoutPlacementHint: 'side_panel',
        layoutSpanHint: 'column',
      }),
      position: candidates.length === 0 ? 'half' : 'quarter',
      layoutPlacementHint: 'side_panel',
      layoutSpanHint: 'column',
      imageGenerationSize: COLUMN_SPOT_ART_SIZE,
    });
  }

  if (candidates.length > 0) return candidates;

  for (let index = 0; index < nodes.length && candidates.length < remainingBudget; index += 1) {
    const node = nodes[index];
    if (!isSceneSupportBlock(node) || hasNearbyImage(nodes, index + 1)) continue;
    const context = buildContextText(nodes, index, title);
    candidates.push({
      insertAt: index + 1,
      role: 'spot_art',
      heading: title,
      prompt: buildSpotArtPrompt({
        title,
        heading: title,
        context,
        role: 'spot_art',
        layoutPlacementHint: 'side_panel',
        layoutSpanHint: 'column',
      }),
      position: 'half',
      layoutPlacementHint: 'side_panel',
      layoutSpanHint: 'column',
      imageGenerationSize: COLUMN_SPOT_ART_SIZE,
    });
  }

  return candidates;
}

function collectRepairCandidates(
  nodes: DocumentContent[],
  title: string,
  reviewCodes: Set<string>,
  budgets: {
    overflowBudget: number;
    sparseBudget: number;
  },
): SpotArtCandidate[] {
  if (budgets.overflowBudget <= 0 && budgets.sparseBudget <= 0) return [];

  const candidates: SpotArtCandidate[] = [];

  const findLateSectionRepairAnchor = (): { insertAt: number; heading: string; contextIndex: number } | null => {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (node?.type !== 'heading') continue;

      let insertAfter = index;
      for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
        const current = nodes[cursor];
        if (!current || current.type === 'heading') break;
        if (current.type === 'readAloudBox' || current.type === 'sidebarCallout') {
          insertAfter = cursor;
          break;
        }
        if (isSceneSupportBlock(current)) {
          insertAfter = cursor;
          const followUp = nodes[cursor + 1];
          if (followUp?.type === 'readAloudBox' || followUp?.type === 'sidebarCallout') {
            insertAfter = cursor + 1;
          }
          break;
        }
      }

      if (hasNearbyImage(nodes, insertAfter + 1)) continue;
      return {
        insertAt: insertAfter + 1,
        heading: headingText(node) || title,
        contextIndex: Math.max(index, insertAfter - 1),
      };
    }

    return null;
  };

  if (
    budgets.overflowBudget > 0
    && (
      reviewCodes.has('EXPORT_UNBALANCED_COLUMNS')
      || reviewCodes.has('EXPORT_SPLIT_SCENE_PACKET')
      || reviewCodes.has('EXPORT_MISSED_ART_OPPORTUNITY')
    )
  ) {
    const anchoredRepair = findLateSectionRepairAnchor();
    if (anchoredRepair) {
      candidates.push({
        insertAt: anchoredRepair.insertAt,
        role: 'column_fill_art',
        heading: anchoredRepair.heading,
        prompt: buildSpotArtPrompt({
          title,
          heading: anchoredRepair.heading,
          context: buildContextText(nodes, anchoredRepair.contextIndex, title),
          role: 'column_fill_art',
          layoutPlacementHint: 'side_panel',
          layoutSpanHint: 'column',
        }),
        position: 'half',
        layoutPlacementHint: 'side_panel',
        layoutSpanHint: 'column',
        imageGenerationSize: COLUMN_SPOT_ART_SIZE,
      });
    }
  }

  if (budgets.sparseBudget > 0 && Array.from(reviewCodes).some((code) => SPARSE_PAGE_CODES.has(code))) {
    const insertAt = findTrailingInsertionIndex(nodes);
    candidates.push({
      insertAt,
      role: 'sparse_page_repair',
      heading: title,
      prompt: buildSpotArtPrompt({
        title,
        heading: title,
        context: buildContextText(nodes, Math.max(0, insertAt - 1), title),
        role: 'sparse_page_repair',
        layoutPlacementHint: 'bottom_panel',
        layoutSpanHint: 'both_columns',
      }),
      position: 'full',
      layoutPlacementHint: 'bottom_panel',
      layoutSpanHint: 'both_columns',
      imageGenerationSize: WIDE_SPOT_ART_SIZE,
    });
  }

  return candidates;
}

function buildSpotArtAttrs(candidate: SpotArtCandidate): Record<string, unknown> {
  return {
    src: '',
    caption: '',
    position: candidate.position,
    imagePrompt: candidate.prompt,
    imageGenerationModel: DEFAULT_SPOT_ART_MODEL,
    imageGenerationSize: candidate.imageGenerationSize,
    imageAssetId: '',
    artRole: candidate.role,
    layoutPlacementHint: candidate.layoutPlacementHint,
    layoutSpanHint: candidate.layoutSpanHint,
  };
}

function findReusableImageIndex(
  nodes: DocumentContent[],
  insertAt: number,
  usedIndexes: Set<number>,
): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let cursor = Math.max(0, insertAt - 2); cursor <= Math.min(nodes.length - 1, insertAt + 2); cursor += 1) {
    if (usedIndexes.has(cursor)) continue;
    const node = nodes[cursor];
    if (!node || node.type !== 'fullBleedImage' || readSpotArtRole(node)) continue;
    const distance = Math.abs(cursor - insertAt);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = cursor;
    }
  }

  return bestIndex;
}

function insertCandidates(
  normalized: DocumentContent,
  candidates: SpotArtCandidate[],
  options: { repurposeExisting?: boolean } = {},
): MaterializeSparsePageArtResult {
  if (candidates.length === 0) {
    return {
      content: normalized,
      changed: false,
      insertedNodeIds: [],
      insertedCount: 0,
    };
  }

  const nextNodes = topLevelNodes(normalized);
  const orderedCandidates = [...candidates]
    .sort((left, right) => left.insertAt - right.insertAt)
    .filter((candidate, index, all) => index === 0 || candidate.insertAt !== all[index - 1]?.insertAt);

  let offset = 0;
  const trackedIndexes: number[] = [];
  const reusedIndexes = new Set<number>();
  for (const candidate of orderedCandidates) {
    const targetIndex = candidate.insertAt + offset;
    const reusableIndex = options.repurposeExisting
      ? findReusableImageIndex(nextNodes, targetIndex, reusedIndexes)
      : -1;

    if (reusableIndex >= 0) {
      reusedIndexes.add(reusableIndex);
      nextNodes[reusableIndex] = {
        ...nextNodes[reusableIndex],
        attrs: {
          ...(nextNodes[reusableIndex]?.attrs ?? {}),
          ...buildSpotArtAttrs(candidate),
        },
      };
      trackedIndexes.push(reusableIndex);
      continue;
    }

    nextNodes.splice(targetIndex, 0, buildSpotArtNode(candidate));
    trackedIndexes.push(targetIndex);
    offset += 1;
  }

  const nextContent = ensureStableNodeIds({
    ...normalized,
    content: nextNodes,
  });
  const insertedNodeIds = trackedIndexes
    .map((index) => nextContent.content?.[index]?.attrs?.nodeId)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return {
    content: nextContent,
    changed: insertedNodeIds.length > 0,
    insertedNodeIds,
    insertedCount: insertedNodeIds.length,
  };
}

function sanitizeAssetBaseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'spot-art';
}

function replaceInsertedArtNode(
  content: DocumentContent,
  nodeId: string,
  attrs: Record<string, unknown>,
): DocumentContent {
  const nodes = topLevelNodes(content).map((node) => {
    if (readStringAttr(node, 'nodeId') !== nodeId) return node;
    return {
      ...node,
      attrs: {
        ...(node.attrs ?? {}),
        ...attrs,
      },
    };
  });

  return {
    ...content,
    content: nodes,
  };
}

function retuneExistingSparseRepairForColumnRecovery(input: {
  content: DocumentContent;
  title: string;
}): MaterializeSparsePageArtResult {
  const nodes = topLevelNodes(input.content);
  const sparseIndexes = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => readSpotArtRole(node) === 'sparse_page_repair')
    .map(({ index }) => index);

  const targetIndex = sparseIndexes.at(-1);
  if (targetIndex == null) {
    return {
      content: input.content,
      changed: false,
      insertedNodeIds: [],
      insertedCount: 0,
    };
  }

  const targetNode = nodes[targetIndex];
  const nodeId = readStringAttr(targetNode, 'nodeId');
  if (!nodeId) {
    return {
      content: input.content,
      changed: false,
      insertedNodeIds: [],
      insertedCount: 0,
    };
  }

  let heading = input.title;
  for (let cursor = targetIndex; cursor >= 0; cursor -= 1) {
    if (nodes[cursor]?.type === 'heading') {
      heading = headingText(nodes[cursor]) || input.title;
      break;
    }
  }

  const prompt = buildSpotArtPrompt({
    title: input.title,
    heading,
    context: buildContextText(nodes, Math.max(0, targetIndex - 1), input.title),
    role: 'column_fill_art',
    layoutPlacementHint: 'side_panel',
    layoutSpanHint: 'column',
  });

  const nextContent = replaceInsertedArtNode(input.content, nodeId, {
    src: readStringAttr(targetNode, 'src') || '',
    imageAssetId: readStringAttr(targetNode, 'imageAssetId') || '',
    artRole: 'column_fill_art',
    position: 'half',
    imagePrompt: prompt,
    imageGenerationSize: COLUMN_SPOT_ART_SIZE,
    layoutPlacementHint: 'side_panel',
    layoutSpanHint: 'column',
  });

  return {
    content: nextContent,
    changed: true,
    insertedNodeIds: [nodeId],
    insertedCount: 1,
  };
}

function retuneExistingOverflowForSparseRepair(input: {
  content: DocumentContent;
  title: string;
}): MaterializeSparsePageArtResult {
  const nodes = topLevelNodes(input.content);
  const overflowIndexes = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => isColumnFillRole(readSpotArtRole(node)))
    .map(({ index }) => index);

  const targetIndex = overflowIndexes.at(-1);
  if (targetIndex == null) {
    return {
      content: input.content,
      changed: false,
      insertedNodeIds: [],
      insertedCount: 0,
    };
  }

  const targetNode = nodes[targetIndex];
  const nodeId = readStringAttr(targetNode, 'nodeId');
  if (!nodeId) {
    return {
      content: input.content,
      changed: false,
      insertedNodeIds: [],
      insertedCount: 0,
    };
  }

  const prompt = buildSpotArtPrompt({
    title: input.title,
    heading: input.title,
    context: buildContextText(nodes, Math.max(0, targetIndex - 1), input.title),
    role: 'sparse_page_repair',
    layoutPlacementHint: 'bottom_panel',
    layoutSpanHint: 'both_columns',
  });

  const nextContent = replaceInsertedArtNode(input.content, nodeId, {
    src: readStringAttr(targetNode, 'src') || '',
    imageAssetId: readStringAttr(targetNode, 'imageAssetId') || '',
    artRole: 'sparse_page_repair',
    position: 'full',
    imagePrompt: prompt,
    imageGenerationSize: WIDE_SPOT_ART_SIZE,
    layoutPlacementHint: 'bottom_panel',
    layoutSpanHint: 'both_columns',
  });

  return {
    content: nextContent,
    changed: true,
    insertedNodeIds: [nodeId],
    insertedCount: 1,
  };
}

export function materializeSparsePageArt(
  input: MaterializeSparsePageArtInput,
): MaterializeSparsePageArtResult {
  if (!SUPPORTED_DOCUMENT_KINDS.has(input.kind ?? '')) {
    return {
      content: ensureStableNodeIds(asDoc(input.content)),
      changed: false,
      insertedNodeIds: [],
      insertedCount: 0,
    };
  }

  const normalizedInput = ensureStableNodeIds(asDoc(input.content));
  const deduped = dedupeSpotArtNodes(normalizedInput);
  const normalized = deduped.content;
  const nodes = topLevelNodes(normalized);
  const title = String(input.title || 'Adventure Scene').trim() || 'Adventure Scene';
  const reviewCodes = new Set((input.reviewCodes ?? []).filter(Boolean));
  const existingCounts = countSpotArt(nodes);
  const reviewDriven = reviewCodes.size > 0;
  const needsSparseRepair = Array.from(reviewCodes).some((code) => SPARSE_PAGE_CODES.has(code));
  const needsColumnBalanceRepair = reviewCodes.has('EXPORT_UNBALANCED_COLUMNS')
    || reviewCodes.has('EXPORT_SPLIT_SCENE_PACKET');
  const needsAdditionalArt = needsColumnBalanceRepair
    || reviewCodes.has('EXPORT_MISSED_ART_OPPORTUNITY');

  if (reviewDriven && needsSparseRepair && needsColumnBalanceRepair && existingCounts.sparse_page_repair > 0) {
    return retuneExistingSparseRepairForColumnRecovery({
      content: normalized,
      title,
    });
  }

  if (
    reviewDriven
    && needsSparseRepair
    && !needsColumnBalanceRepair
    && reviewCodes.has('EXPORT_MISSED_ART_OPPORTUNITY')
    && existingCounts.sparse_page_repair > 0
    && existingCounts.spot_art > 0
  ) {
    return retuneExistingSparseRepairForColumnRecovery({
      content: normalized,
      title,
    });
  }

  if (
    reviewDriven
    && needsSparseRepair
    && !needsColumnBalanceRepair
    && (existingCounts.column_fill_art > 0 || existingCounts.overflow_spot_art > 0)
    && existingCounts.sparse_page_repair === 0
  ) {
    return retuneExistingOverflowForSparseRepair({
      content: normalized,
      title,
    });
  }

  if (
    reviewDriven
    && !needsColumnBalanceRepair
    && existingCounts.sparse_page_repair > 0
    && (existingCounts.column_fill_art > 0 || existingCounts.overflow_spot_art > 0)
  ) {
    const cleaned = removeSpotArtRoles(normalized, ['column_fill_art', 'overflow_spot_art']);
    return {
      ...cleaned,
      insertedNodeIds: [],
      insertedCount: 0,
      changed: deduped.changed || cleaned.changed,
    };
  }

  if (!reviewDriven) {
    const remainingBaselineBudget = Math.max(0, 2 - existingCounts.spot_art);
    const inserted = insertCandidates(normalized, collectBaselineCandidates(nodes, title, remainingBaselineBudget));
    return {
      ...inserted,
      changed: deduped.changed || inserted.changed,
    };
  }

  const baselineBudget = 0;
  const prefersColumnRecovery = needsColumnBalanceRepair;
  const overflowBudget = (
    needsAdditionalArt
    && existingCounts.column_fill_art === 0
    && existingCounts.overflow_spot_art === 0
    && !(existingCounts.sparse_page_repair > 0 && !needsColumnBalanceRepair)
  ) ? 1 : 0;
  const sparseRepairBudget = prefersColumnRecovery ? 0 : (needsSparseRepair ? Math.max(0, 1 - existingCounts.sparse_page_repair) : 0);
  const reviewCandidates = [
    ...collectBaselineCandidates(nodes, title, baselineBudget),
    ...collectRepairCandidates(nodes, title, reviewCodes, {
      overflowBudget,
      sparseBudget: sparseRepairBudget,
    }),
  ];

  const inserted = insertCandidates(
    normalized,
    reviewCandidates,
    { repurposeExisting: true },
  );
  return {
    ...inserted,
    changed: deduped.changed || inserted.changed,
  };
}

export async function realizeSparsePageArt(
  input: RealizeSparsePageArtInput,
): Promise<RealizeSparsePageArtResult> {
  if (input.insertedNodeIds.length === 0) {
    return {
      content: input.content,
      changed: false,
      generatedCount: 0,
      failedCount: 0,
    };
  }

  const settings = await getAiSettings(input.userId);
  if (!settings?.provider || settings.provider !== 'openai' || !settings.hasApiKey) {
    return {
      content: input.content,
      changed: false,
      generatedCount: 0,
      failedCount: 0,
    };
  }

  const apiKey = await getDecryptedApiKey(input.userId);
  if (!apiKey) {
    return {
      content: input.content,
      changed: false,
      generatedCount: 0,
      failedCount: 0,
    };
  }

  const insertedNodeIds = new Set(input.insertedNodeIds);
  let nextContent = input.content;
  let generatedCount = 0;
  let failedCount = 0;

  for (const node of topLevelNodes(nextContent)) {
    const nodeId = readStringAttr(node, 'nodeId');
    if (!insertedNodeIds.has(nodeId) || node.type !== 'fullBleedImage') continue;

    const prompt = readStringAttr(node, 'imagePrompt');
    if (!prompt) {
      failedCount += 1;
      continue;
    }

    const model = DEFAULT_SPOT_ART_MODEL;
    const size = readStringAttr(node, 'imageGenerationSize') || COLUMN_SPOT_ART_SIZE;

    try {
      const image = await generateAiImage(apiKey, {
        prompt,
        model,
        size,
        timeoutMs: PREFLIGHT_SPOT_ART_TIMEOUT_MS,
      });
      const buffer = Buffer.from(image.base64, 'base64');
      const filename = `${sanitizeAssetBaseName(readStringAttr(node, 'artRole') || 'spot-art')}-${sanitizeAssetBaseName(nodeId)}.png`;
      const asset = await createAsset(input.projectId, input.userId, {
        originalname: filename,
        mimetype: image.mimeType,
        size: buffer.length,
        buffer,
      });

      if (!asset) {
        failedCount += 1;
        continue;
      }

      nextContent = replaceInsertedArtNode(nextContent, nodeId, {
        src: asset.url,
        imageAssetId: asset.id,
        imagePrompt: prompt,
      });
      generatedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return {
    content: nextContent,
    changed: generatedCount > 0,
    generatedCount,
    failedCount,
  };
}
