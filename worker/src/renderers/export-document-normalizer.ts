import type { DocumentContent, DocumentKind } from '@dnd-booker/shared';
import {
  hasEncounterTableContent,
  normalizeChapterHeaderTitle,
  normalizeEncounterTableAttrs,
  normalizeNpcProfileAttrs,
  normalizeStatBlockAttrs,
  resolveRandomTableEntries,
} from '@dnd-booker/shared';

interface ExportDocument {
  title: string;
  content: DocumentContent | null;
  sortOrder: number;
  kind?: DocumentKind | null;
}

interface NormalizeExportOptions {
  projectType?: string | null;
}

const TITLE_PLACEHOLDERS = new Set([
  'Adventure Title',
  'Campaign Title',
  'One-Shot Title',
  'Sourcebook Title',
  'Supplement Title',
]);

const SUBTITLE_PLACEHOLDERS = new Set([
  'A D&D 5e Adventure',
  'A D&D 5e One-Shot',
  'A D&D 5e Sourcebook',
  'A D&D 5e Supplement',
]);

const AUTHOR_PLACEHOLDERS = new Set([
  'Author Name',
]);

const CREDIT_LINE_PLACEHOLDERS = new Set([
  'Written by Author Name',
  'Edited by Editor Name',
  'Art by Artist Name',
  'Layout by Layout Designer',
]);

const PLACEHOLDER_BODY_HEADINGS = new Set([
  'The Adventure',
]);

const PLACEHOLDER_BODY_PARAGRAPHS = new Set([
  'Begin writing your one-shot adventure here...',
  'Begin writing your one-shot adventure here…',
]);

const SELF_PAGINATING_NODE_TYPES = new Set([
  'titlePage',
  'tableOfContents',
  'creditsPage',
  'backCover',
]);

const MAX_RANDOM_TABLE_ENTRIES_PER_EXPORT_BLOCK = 10;

export function normalizeExportDocuments<T extends ExportDocument>(
  documents: T[],
  projectTitle: string,
  options: NormalizeExportOptions = {},
): T[] {
  const chapterLikeCount = documents.filter(
    (document) => document.content != null && (document.kind === 'chapter' || document.kind === 'appendix'),
  ).length;

  return documents.flatMap((document) => {
    if (document.content == null) return [document];

    const content = normalizeExportContent(document.content, projectTitle, {
      ...options,
      chapterLikeCount,
    });
    if (content == null || isEffectivelyEmpty(content)) return [];

    return [{
      ...document,
      content,
    }];
  });
}

function normalizeExportContent(
  content: DocumentContent,
  projectTitle: string,
  options: NormalizeExportOptions & { chapterLikeCount: number },
): DocumentContent | null {
  const nodes = getTopLevelNodes(content)
    .map((node) => normalizeNode(node, projectTitle))
    .filter((node): node is DocumentContent => node != null);

  const repairedMarkdownBleedThrough = repairMarkdownBleedThrough(nodes);
  const withoutControlMarkers = stripControlMarkerParagraphs(repairedMarkdownBleedThrough);
  const withNpcCards = upgradeNpcRosterLists(withoutControlMarkers);
  const withoutPlaceholderScaffold = stripPlaceholderAdventureScaffold(withNpcCards);
  const withoutDuplicateChapterHeadings = stripDuplicateChapterHeadings(withoutPlaceholderScaffold);
  const withCompactPrepChecklist = collapsePrepChecklistSection(withoutDuplicateChapterHeadings);
  const withoutOrphanedUtilityScaffold = stripOrphanedUtilityScaffold(withCompactPrepChecklist);
  const withSplitRandomTables = splitOversizedRandomTables(withoutOrphanedUtilityScaffold);
  const withAttachedStatBlockLeadIns = attachStatBlockLeadIns(withSplitRandomTables);
  const withoutRedundantBreaks = stripRedundantStructuralPageBreaks(withAttachedStatBlockLeadIns);
  const withoutShortFormToc = stripShortFormTableOfContents(withoutRedundantBreaks, options);
  const withoutEmptyParagraphs = stripEmptyParagraphs(withoutShortFormToc);

  if (withoutEmptyParagraphs.length === 0) return null;

  return {
    type: 'doc',
    content: withoutEmptyParagraphs,
  };
}

function normalizeNode(node: DocumentContent, projectTitle: string): DocumentContent | null {
  const normalizedChildren = node.content
    ?.map((child) => normalizeNode(child, projectTitle))
    .filter((child): child is DocumentContent => child != null);

  const baseNode: DocumentContent = {
    ...node,
    ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
    ...(normalizedChildren ? { content: normalizedChildren } : {}),
  };

  switch (node.type) {
    case 'titlePage':
      return normalizeTitlePageNode(baseNode, projectTitle);
    case 'creditsPage':
      return normalizeCreditsPageNode(baseNode);
    case 'encounterTable':
      return normalizeEncounterTableNode(baseNode);
    case 'randomTable':
      return normalizeRandomTableNode(baseNode);
    case 'statBlock':
      return normalizeStatBlockNode(baseNode);
    case 'npcProfile':
      return normalizeNpcProfileNode(baseNode);
    case 'heading':
      return normalizeHeadingNode(baseNode);
    default:
      return baseNode;
  }
}

function normalizeTitlePageNode(node: DocumentContent, projectTitle: string): DocumentContent | null {
  const attrs = { ...(node.attrs ?? {}) };
  const currentTitle = normalizeText(attrs.title);
  const currentSubtitle = normalizeText(attrs.subtitle);
  const currentAuthor = normalizeText(attrs.author);

  const title = isPlaceholder(currentTitle, TITLE_PLACEHOLDERS)
    ? normalizeText(projectTitle)
    : currentTitle;
  const subtitle = isPlaceholder(currentSubtitle, SUBTITLE_PLACEHOLDERS) ? '' : currentSubtitle;
  const author = isPlaceholder(currentAuthor, AUTHOR_PLACEHOLDERS) ? '' : currentAuthor;

  if (!title) return null;

  attrs.title = title;
  attrs.subtitle = subtitle;
  attrs.author = author;

  return {
    ...node,
    attrs,
  };
}

function normalizeCreditsPageNode(node: DocumentContent): DocumentContent | null {
  const attrs = { ...(node.attrs ?? {}) };
  const lines = normalizeText(attrs.credits)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const filteredLines = lines.filter((line) => !CREDIT_LINE_PLACEHOLDERS.has(line));
  const legalText = normalizeText(attrs.legalText);
  const copyrightYear = normalizeText(attrs.copyrightYear);

  if (filteredLines.length === 0 && !legalText && !copyrightYear) return null;

  attrs.credits = filteredLines.join('\n');
  attrs.legalText = legalText;
  attrs.copyrightYear = copyrightYear;

  return {
    ...node,
    attrs,
  };
}

function normalizeEncounterTableNode(node: DocumentContent): DocumentContent | null {
  const attrs = normalizeEncounterTableAttrs(node.attrs ?? {});
  if (!hasEncounterTableContent(attrs)) return null;
  return {
    ...node,
    attrs,
  };
}

function normalizeRandomTableNode(node: DocumentContent): DocumentContent | null {
  const attrs = { ...(node.attrs ?? {}) };
  const entries = resolveRandomTableEntries(attrs);
  if (entries.length === 0) return null;
  attrs.entries = JSON.stringify(entries);
  delete attrs.results;
  return {
    ...node,
    attrs,
  };
}

function splitOversizedRandomTables(nodes: DocumentContent[]): DocumentContent[] {
  return nodes.flatMap((node, index) => {
    if (node.type !== 'randomTable') return [node];

    const attrs = { ...(node.attrs ?? {}) };
    const entries = resolveRandomTableEntries(attrs);
    if (entries.length <= MAX_RANDOM_TABLE_ENTRIES_PER_EXPORT_BLOCK) {
      return [node];
    }

    const baseTitle = normalizeText(attrs.title) || 'Random Table';
    const baseNodeId = normalizeText(attrs.nodeId) || `randomtable-export-${index + 1}`;
    const chunks = chunkEntries(entries, MAX_RANDOM_TABLE_ENTRIES_PER_EXPORT_BLOCK);

    return chunks.map((chunk, chunkIndex) => ({
      ...node,
      attrs: {
        ...attrs,
        nodeId: chunkIndex === 0 ? baseNodeId : `${baseNodeId}-part-${chunkIndex + 1}`,
        title: chunkIndex === 0 ? baseTitle : `${baseTitle} (cont.)`,
        entries: JSON.stringify(chunk),
      },
    }));
  });
}

function chunkEntries<T>(entries: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }
  return chunks;
}

function normalizeStatBlockNode(node: DocumentContent): DocumentContent {
  return {
    ...node,
    attrs: normalizeStatBlockAttrs(node.attrs ?? {}),
  };
}

function normalizeNpcProfileNode(node: DocumentContent): DocumentContent {
  return {
    ...node,
    attrs: normalizeNpcProfileAttrs(node.attrs ?? {}),
  };
}

function normalizeStructuredBleedThroughNode(
  blockType: string,
  attrs: Record<string, unknown>,
): DocumentContent {
  switch (blockType) {
    case 'statBlock':
      return { type: 'statBlock', attrs: normalizeStatBlockAttrs(attrs) };
    case 'npcProfile':
      return { type: 'npcProfile', attrs: normalizeNpcProfileAttrs(attrs) };
    case 'randomTable': {
      const entries = resolveRandomTableEntries(attrs);
      const normalizedAttrs = { ...attrs };
      delete normalizedAttrs.results;
      return {
        type: 'randomTable',
        attrs: {
          ...normalizedAttrs,
          entries: JSON.stringify(entries),
        },
      };
    }
    default:
      return { type: blockType, attrs };
  }
}

function parseBleedThroughBlock(
  text: string,
): { rawBlockType: string; normalizedBlockType: string; blockText: string } | null {
  const trimmed = text.trim();
  const sameLineMatch = trimmed.match(/^(?:#{1,6}\s+[^:]+?\s+)?:::(\w+)\s+([\s\S]*?)\s*:::\s*$/);
  if (sameLineMatch) {
    return {
      rawBlockType: sameLineMatch[1],
      normalizedBlockType: normalizeBleedThroughBlockType(sameLineMatch[1]),
      blockText: sameLineMatch[2].trim(),
    };
  }

  const inlineMatch = trimmed.match(/^(?:#{1,6}\s+[^:]+?\s+)?:::(\w+)\s+([\s\S]+)$/);
  if (!inlineMatch) return null;

  return {
    rawBlockType: inlineMatch[1],
    normalizedBlockType: normalizeBleedThroughBlockType(inlineMatch[1]),
    blockText: inlineMatch[2].trim(),
  };
}

function repairStructuredBleedThroughBlock(
  rawBlockType: string,
  normalizedBlockType: string,
  blockText: string,
): DocumentContent[] | null {
  if (!blockText) return [];

  if (normalizedBlockType === 'readAloudBox') {
    return [{
      type: 'readAloudBox',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: blockText }],
      }],
    }];
  }

  if (normalizedBlockType === 'sidebarCallout') {
    return [{
      type: 'sidebarCallout',
      attrs: {
        title: rawBlockType === 'dmTips' ? 'DM Tips' : 'Note',
        calloutType: 'info',
      },
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: blockText }],
      }],
    }];
  }

  try {
    const parsedAttrs = JSON.parse(blockText) as Record<string, unknown>;
    return [normalizeStructuredBleedThroughNode(normalizedBlockType, parsedAttrs)];
  } catch {
    return null;
  }
}

function repairListBleedThrough(node: DocumentContent): DocumentContent[] | null {
  const items = node.content ?? [];
  const repairedNodes: DocumentContent[] = [];
  let bufferedItems: DocumentContent[] = [];
  let changed = false;

  const flushBufferedItems = () => {
    if (bufferedItems.length === 0) return;
    repairedNodes.push({
      type: node.type,
      content: bufferedItems,
    });
    bufferedItems = [];
  };

  for (const item of items) {
    const itemText = readSingleParagraphListItemText(item);
    const block = itemText ? parseBleedThroughBlock(itemText) : null;
    const repaired = block
      ? repairStructuredBleedThroughBlock(block.rawBlockType, block.normalizedBlockType, block.blockText)
      : null;

    if (repaired) {
      changed = true;
      flushBufferedItems();
      repairedNodes.push(...repaired);
      continue;
    }

    bufferedItems.push(item);
  }

  flushBufferedItems();
  return changed ? repairedNodes : null;
}

function readSingleParagraphListItemText(node: DocumentContent): string | null {
  if (node.type !== 'listItem') return null;
  if ((node.content ?? []).length !== 1) return null;
  const child = node.content?.[0];
  if (!child || child.type !== 'paragraph') return null;
  return readInlineText(child);
}

function repairMarkdownBleedThroughText(text: string): DocumentContent[] | null {
  const repairedTable = parseInlineMarkdownTable(text);
  if (repairedTable) {
    return [repairedTable];
  }

  const block = parseBleedThroughBlock(text);
  if (block) {
    return repairStructuredBleedThroughBlock(
      block.rawBlockType,
      block.normalizedBlockType,
      block.blockText,
    );
  }

  if (/^\s*(---+|\*\*\*+)\s*$/.test(text)) {
    return [{ type: 'horizontalRule' }];
  }

  const headingMatch = text.match(/^\s*(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    return [{
      type: 'heading',
      attrs: { level: headingMatch[1].length },
      content: [{ type: 'text', text: headingMatch[2].trim() }],
    }];
  }

  return null;
}

function parseInlineMarkdownTable(text: string): DocumentContent | null {
  const trimmed = normalizeText(text).replace(/\u00a0/g, ' ');
  if (!trimmed.startsWith('|') || (trimmed.match(/\|/g)?.length ?? 0) < 8) return null;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2 && lines.every((line) => line.startsWith('|') && line.endsWith('|'))) {
    const lineParsed = parseMarkdownTableLines(lines);
    if (lineParsed) return lineParsed;
  }

  const cells = trimmed
    .split('|')
    .map((cell) => normalizeText(cell))
    .filter(Boolean);

  if (cells.length < 6) return null;

  const separatorIndex = findCollapsedMarkdownSeparatorIndex(cells);
  if (separatorIndex <= 0) return null;

  const headers = cells.slice(0, separatorIndex);
  if (headers.length < 2) return null;

  const rowTokens = cells.slice(separatorIndex + headers.length);
  if (rowTokens.length < headers.length) return null;

  const firstRow = rowTokens.slice(0, headers.length - 1);
  const lastCell = rowTokens
    .slice(headers.length - 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lastCell) return null;

  return buildTableNode(headers, [[...firstRow, lastCell]]);
}

function findCollapsedMarkdownSeparatorIndex(cells: string[]): number {
  for (let index = 1; index < cells.length; index += 1) {
    const candidateHeaderCount = index;
    if (candidateHeaderCount < 2) continue;
    const separatorCells = cells.slice(index, index + candidateHeaderCount);
    if (separatorCells.length !== candidateHeaderCount) continue;
    if (separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      return index;
    }
  }
  return -1;
}

function parseMarkdownTableLines(lines: string[]): DocumentContent | null {
  if (lines.length < 3) return null;

  const parseRow = (row: string): string[] =>
    row.split('|').slice(1, -1).map((cell) => normalizeText(cell));

  const headerCells = parseRow(lines[0]).filter(Boolean);
  const separatorCells = parseRow(lines[1]);
  if (headerCells.length < 2 || headerCells.length !== separatorCells.length) return null;
  if (!separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;

  const dataRows = lines
    .slice(2)
    .map(parseRow)
    .filter((row) => row.some(Boolean))
    .map((row) => {
      if (row.length === headerCells.length) return row;
      if (row.length < headerCells.length) return [];
      return [
        ...row.slice(0, headerCells.length - 1),
        row.slice(headerCells.length - 1).join(' ').replace(/\s+/g, ' ').trim(),
      ];
    })
    .filter((row) => row.length === headerCells.length);

  if (dataRows.length === 0) return null;
  return buildTableNode(headerCells, dataRows);
}

function buildTableNode(headers: string[], rows: string[][]): DocumentContent {
  return {
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: headers.map((header) => ({
          type: 'tableHeader',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: header }],
          }],
        })),
      },
      ...rows.map((row) => ({
        type: 'tableRow',
        content: row.map((cell) => ({
          type: 'tableCell',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: cell }],
          }],
        })),
      })),
    ],
  };
}

function normalizeHeadingNode(node: DocumentContent): DocumentContent {
  if (!isSuspiciousDisplayHeading(node)) return node;
  return {
    type: 'paragraph',
    content: node.content ?? [],
  };
}

function stripPlaceholderAdventureScaffold(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (isPlaceholderAdventureHeading(node) && isPlaceholderAdventureParagraph(nodes[index + 1])) {
      index += 1;
      continue;
    }

    if (isPlaceholderAdventureParagraph(node)) {
      continue;
    }

    result.push(node);
  }

  return result;
}

function stripOrphanedUtilityScaffold(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (isUtilityIntroParagraph(node)) {
      const nextMeaningfulIndex = findNextMeaningfulIndex(nodes, index + 1);
      const nextMeaningful = nextMeaningfulIndex === -1 ? null : nodes[nextMeaningfulIndex];
      const nextUtilityCandidate = nextMeaningful?.type === 'heading'
        ? findNextMeaningfulNode(nodes, nextMeaningfulIndex + 1)
        : nextMeaningful;

      if (!isReferencedUtilityNode(nextUtilityCandidate, node)) {
        if (nextMeaningful?.type === 'heading') {
          index = nextMeaningfulIndex;
        }
        continue;
      }
    }

    if (isOrphanedUtilityHeading(node)) {
      const nextMeaningful = findNextMeaningfulNode(nodes, index + 1);
      if (isDuplicateUtilityHeading(node, nextMeaningful)) {
        continue;
      }
      if (!isReferencedUtilityNode(nextMeaningful, node)) {
        continue;
      }
    }

    if (node.type === 'heading') {
      const nextMeaningful = findNextMeaningfulNode(nodes, index + 1);
      if (isDuplicateUtilityHeading(node, nextMeaningful)) {
        continue;
      }
    }

    result.push(node);
  }

  return result;
}

function stripDuplicateChapterHeadings(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    result.push(node);

    if (node.type !== 'chapterHeader') continue;

    const nextNode = nodes[index + 1];
    if (!isDuplicateChapterHeading(node, nextNode)) continue;

    index += 1;
  }

  return result;
}

function stripControlMarkerParagraphs(nodes: DocumentContent[]): DocumentContent[] {
  return nodes.filter((node) => !isControlMarkerParagraph(node));
}

function collapsePrepChecklistSection(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nextNode = nodes[index + 1];

    if (isPrepChecklistHeading(node) && (nextNode?.type === 'bulletList' || nextNode?.type === 'orderedList')) {
      result.push({
        type: 'sidebarCallout',
        attrs: {
          title: 'Prep Checklist',
          calloutType: 'info',
        },
        content: [nextNode],
      });
      index += 1;
      continue;
    }

    result.push(node);
  }

  return result;
}

function repairMarkdownBleedThrough(nodes: DocumentContent[]): DocumentContent[] {
  return nodes.flatMap((node) => repairMarkdownBleedThroughNode(node));
}

function repairMarkdownBleedThroughNode(node: DocumentContent): DocumentContent[] {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return repairListBleedThrough(node) ?? [node];
  }
  if (node.type === 'codeBlock') {
    return repairMarkdownBleedThroughText(readInlineText(node)) ?? [node];
  }
  if (node.type === 'paragraph') {
    return repairMarkdownBleedThroughText(readInlineText(node)) ?? [node];
  }

  const repairedChildren = node.content?.flatMap((child) => repairMarkdownBleedThroughNode(child));
  if (!repairedChildren) return [node];

  if (node.type === 'sidebarCallout' || node.type === 'readAloudBox') {
    return splitMalformedProseContainer(node, repairedChildren);
  }

  return [{
    ...node,
    content: repairedChildren,
  }];
}

function upgradeNpcRosterLists(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nextNode = nodes[index + 1];
    const npcName = extractNpcRosterName(node);
    const npcProfile = npcName && nextNode ? buildNpcProfileFromRosterPair(npcName, nextNode) : null;

    if (npcProfile) {
      result.push(npcProfile);
      index += 1;
      continue;
    }

    result.push(node);
  }

  return result;
}

function extractNpcRosterName(node: DocumentContent): string | null {
  if (node.type !== 'orderedList') return null;
  const items = node.content ?? [];
  if (items.length !== 1) return null;
  const text = readSingleParagraphListItemText(items[0]);
  if (!text) return null;
  const normalized = normalizeText(text).replace(/:\s*$/, '');
  return normalized || null;
}

function buildNpcProfileFromRosterPair(name: string, node: DocumentContent): DocumentContent | null {
  if (node.type !== 'bulletList') return null;

  let description = '';
  let goal = '';
  let whatTheyKnow = '';
  let leverage = '';
  let likelyReaction = '';

  for (const item of node.content ?? []) {
    const text = normalizeText(readSingleParagraphListItemText(item));
    if (!text) continue;

    const descriptionMatch = text.match(/^([^:]+)$/);
    const goalMatch = text.match(/^Goal:\s*(.+)$/i);
    const knowledgeMatch = text.match(/^What (?:she|he|they) knows:\s*(.+)$/i);
    const leverageMatch = text.match(/^Leverage:\s*(.+)$/i);
    const reactionMatch = text.match(/^Likely Reaction:\s*(.+)$/i);

    if (!description && descriptionMatch && !text.includes(':')) {
      description = descriptionMatch[1];
      continue;
    }
    if (goalMatch) {
      goal = goalMatch[1];
      continue;
    }
    if (knowledgeMatch) {
      whatTheyKnow = knowledgeMatch[1];
      continue;
    }
    if (leverageMatch) {
      leverage = leverageMatch[1];
      continue;
    }
    if (reactionMatch) {
      likelyReaction = reactionMatch[1];
    }
  }

  const populatedFields = [description, goal, whatTheyKnow, leverage, likelyReaction].filter(Boolean).length;
  if (populatedFields < 3) return null;

  return {
    type: 'npcProfile',
    attrs: normalizeNpcProfileAttrs({
      name,
      description,
      goal,
      whatTheyKnow,
      leverage,
      likelyReaction,
    }),
  };
}

function splitMalformedProseContainer(
  node: DocumentContent,
  repairedChildren: DocumentContent[],
): DocumentContent[] {
  const safeChildren: DocumentContent[] = [];
  let splitIndex = repairedChildren.length;

  for (let index = 0; index < repairedChildren.length; index += 1) {
    const child = repairedChildren[index];
    if (isValidProseContainerChild(child)) {
      safeChildren.push(child);
      continue;
    }
    splitIndex = index;
    break;
  }

  if (splitIndex === repairedChildren.length) {
    return [{
      ...node,
      content: repairedChildren,
    }];
  }

  const remainder = repairedChildren.slice(splitIndex);
  if (safeChildren.length === 0) {
    return remainder;
  }

  return [{
    ...node,
    content: safeChildren,
  }, ...remainder];
}

function isValidProseContainerChild(node: DocumentContent): boolean {
  return node.type === 'paragraph' || node.type === 'bulletList' || node.type === 'orderedList';
}

function stripRedundantStructuralPageBreaks(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type !== 'pageBreak') {
      result.push(node);
      continue;
    }

    const previousMeaningful = findPreviousNonBreakNode(result);
    const nextMeaningful = findNextNonBreakNode(nodes, index + 1);

    if (previousMeaningful && SELF_PAGINATING_NODE_TYPES.has(previousMeaningful.type)) {
      continue;
    }

    if (
      nextMeaningful &&
      SELF_PAGINATING_NODE_TYPES.has(nextMeaningful.type) &&
      (previousMeaningful == null || SELF_PAGINATING_NODE_TYPES.has(previousMeaningful.type))
    ) {
      continue;
    }

    result.push(node);
  }

  return result;
}

function attachStatBlockLeadIns(nodes: DocumentContent[]): DocumentContent[] {
  const result: DocumentContent[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const nextMeaningful = findNextMeaningfulNode(nodes, index + 1);

    if (
      node.type === 'paragraph'
      && nextMeaningful?.type === 'statBlock'
      && isStatBlockLeadInParagraph(node)
    ) {
      const statBlockIndex = findNextMeaningfulIndex(nodes, index + 1);
      const statBlock = nodes[statBlockIndex];
      const leadInText = readInlineText(node).trim();

      result.push({
        ...statBlock,
        attrs: {
          ...(statBlock.attrs ?? {}),
          leadInText,
        },
      });

      index = statBlockIndex;
      continue;
    }

    result.push(node);
  }

  return result;
}

function stripShortFormTableOfContents(
  nodes: DocumentContent[],
  options: NormalizeExportOptions & { chapterLikeCount: number },
): DocumentContent[] {
  if (!shouldStripShortFormTableOfContents(options)) return nodes;
  return nodes.filter((node) => node.type !== 'tableOfContents');
}

function shouldStripShortFormTableOfContents(
  options: NormalizeExportOptions & { chapterLikeCount: number },
): boolean {
  if (options.chapterLikeCount <= 4) return true;
  return options.projectType === 'one_shot' && options.chapterLikeCount <= 5;
}

function stripEmptyParagraphs(nodes: DocumentContent[]): DocumentContent[] {
  return nodes.filter((node) => !isEmptyParagraph(node));
}

function findPreviousNonBreakNode(nodes: DocumentContent[]): DocumentContent | null {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index].type !== 'pageBreak') return nodes[index];
  }
  return null;
}

function findNextNonBreakNode(nodes: DocumentContent[], startIndex: number): DocumentContent | null {
  for (let index = startIndex; index < nodes.length; index += 1) {
    if (nodes[index].type !== 'pageBreak') return nodes[index];
  }
  return null;
}

function findNextMeaningfulIndex(nodes: DocumentContent[], startIndex: number): number {
  for (let index = startIndex; index < nodes.length; index += 1) {
    if (!isStructuralBreak(nodes[index])) return index;
  }
  return -1;
}

function findNextMeaningfulNode(nodes: DocumentContent[], startIndex: number): DocumentContent | null {
  const index = findNextMeaningfulIndex(nodes, startIndex);
  return index === -1 ? null : nodes[index];
}

function isStructuralBreak(node: DocumentContent | null | undefined): boolean {
  return node?.type === 'pageBreak' || node?.type === 'columnBreak';
}

function isStatBlockLeadInParagraph(node: DocumentContent | undefined): boolean {
  if (node?.type !== 'paragraph') return false;
  const text = readInlineText(node).trim();
  if (!text || text.length > 140) return false;

  return (
    /following stats:?$/i.test(text)
    || /the following stat block:?$/i.test(text)
    || /see stat block (?:below|above)[:.]?$/i.test(text)
    || /has the following statistics:?$/i.test(text)
  );
}

function isPlaceholderAdventureHeading(node: DocumentContent | undefined): boolean {
  if (node?.type !== 'heading') return false;
  if (Number(node.attrs?.level) !== 1) return false;
  return PLACEHOLDER_BODY_HEADINGS.has(readInlineText(node));
}

function isPlaceholderAdventureParagraph(node: DocumentContent | undefined): boolean {
  if (node?.type !== 'paragraph') return false;
  return PLACEHOLDER_BODY_PARAGRAPHS.has(readInlineText(node));
}

function isDuplicateChapterHeading(
  chapterHeader: DocumentContent,
  heading: DocumentContent | undefined,
): boolean {
  if (heading?.type !== 'heading') return false;
  const level = Number(heading.attrs?.level ?? 0);
  if (level < 1 || level > 2) return false;

  const chapterNumber = normalizeText(chapterHeader.attrs?.chapterNumber);
  const headerTitle = normalizeChapterHeaderTitle(chapterHeader.attrs?.title, chapterNumber).toLowerCase();
  const headingTitle = normalizeChapterHeaderTitle(readInlineText(heading), chapterNumber).toLowerCase();

  return Boolean(headerTitle) && headerTitle === headingTitle;
}

function isEmptyParagraph(node: DocumentContent): boolean {
  return node.type === 'paragraph' && readInlineText(node).trim().length === 0;
}

function isControlMarkerParagraph(node: DocumentContent): boolean {
  if (node.type !== 'paragraph') return false;
  const text = readInlineText(node).trim();
  return /^:[a-z][\w-]*$/i.test(text);
}

function isPrepChecklistHeading(node: DocumentContent): boolean {
  if (node.type !== 'heading') return false;
  const text = readInlineText(node).trim().toLowerCase();
  return text === 'prep checklist';
}

function getTopLevelNodes(content: DocumentContent): DocumentContent[] {
  if (content.type === 'doc') {
    return [...(content.content ?? [])];
  }

  return [content];
}

function isEffectivelyEmpty(content: DocumentContent): boolean {
  return getTopLevelNodes(content).every((node) => node.type === 'pageBreak' || node.type === 'columnBreak');
}

function readInlineText(node: DocumentContent): string {
  if (node.type === 'text') return String(node.text ?? '');
  return normalizeText((node.content ?? []).map(readInlineText).join(''));
}

function isSuspiciousDisplayHeading(node: DocumentContent): boolean {
  if (node.type !== 'heading') return false;

  const level = Number(node.attrs?.level ?? 0);
  if (level < 1 || level > 2) return false;

  const text = readInlineText(node);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return text.length >= 70 || wordCount >= 10;
}

function isUtilityIntroParagraph(node: DocumentContent): boolean {
  if (node.type !== 'paragraph') return false;
  const text = readInlineText(node).toLowerCase();
  return /(?:use|utilize)\s+the\s+following\s+(?:random\s+table|encounter\s+table|table|handout)/.test(text);
}

function isOrphanedUtilityHeading(node: DocumentContent): boolean {
  if (node.type !== 'heading') return false;
  const text = readInlineText(node).toLowerCase();
  return /\b(encounter table|random table|discoveries|treasure table|loot table)\b/.test(text);
}

function isReferencedUtilityNode(node: DocumentContent | null, referenceNode: DocumentContent): boolean {
  if (!node) return false;

  const referenceText = readInlineText(referenceNode).toLowerCase();

  if (referenceNode.type === 'paragraph' && /\bhandout\b/.test(referenceText)) {
    return node.type === 'handout';
  }

  if (
    (referenceNode.type === 'paragraph' && /\b(encounter table|random table|table)\b/.test(referenceText))
    || referenceNode.type === 'heading'
  ) {
    return node.type === 'encounterTable' || node.type === 'randomTable';
  }

  return false;
}

function isDuplicateUtilityHeading(node: DocumentContent, nextNode: DocumentContent | null): boolean {
  if (node.type !== 'heading' || !nextNode) return false;

  const text = readInlineText(node).toLowerCase();
  if (text === 'dm tips') {
    return nextNode.type === 'sidebarCallout';
  }
  if (text === 'read aloud') {
    return nextNode.type === 'readAloudBox';
  }
  if (text === 'handout') {
    return nextNode.type === 'handout';
  }

  return false;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function isPlaceholder(value: string, placeholders: Set<string>): boolean {
  return !value || placeholders.has(value);
}

function normalizeBleedThroughBlockType(blockType: string): string {
  switch (blockType) {
    case 'readAloud':
      return 'readAloudBox';
    case 'dmTips':
      return 'sidebarCallout';
    default:
      return blockType;
  }
}
