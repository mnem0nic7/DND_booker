import type { DocumentContent, DocumentKind } from '@dnd-booker/shared';
import {
  normalizeEncounterEntries,
  normalizeChapterHeaderTitle,
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
  const withoutPlaceholderScaffold = stripPlaceholderAdventureScaffold(repairedMarkdownBleedThrough);
  const withoutDuplicateChapterHeadings = stripDuplicateChapterHeadings(withoutPlaceholderScaffold);
  const withoutOrphanedUtilityScaffold = stripOrphanedUtilityScaffold(withoutDuplicateChapterHeadings);
  const withoutRedundantBreaks = stripRedundantStructuralPageBreaks(withoutOrphanedUtilityScaffold);
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
  const attrs = { ...(node.attrs ?? {}) };
  const entries = normalizeEncounterEntries(attrs.entries);
  if (entries.length === 0) return null;
  attrs.entries = JSON.stringify(entries);
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
  const sameLineMatch = trimmed.match(/^:::(\w+)\s+([\s\S]*?)\s*:::\s*$/);
  if (sameLineMatch) {
    return {
      rawBlockType: sameLineMatch[1],
      normalizedBlockType: normalizeBleedThroughBlockType(sameLineMatch[1]),
      blockText: sameLineMatch[2].trim(),
    };
  }

  const inlineMatch = trimmed.match(/^:::(\w+)\s+([\s\S]+)$/);
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
  const headingMatch = text.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    return [{
      type: 'heading',
      attrs: { level: headingMatch[1].length },
      content: [{ type: 'text', text: headingMatch[2].trim() }],
    }];
  }

  const block = parseBleedThroughBlock(text);
  if (!block) return null;

  return repairStructuredBleedThroughBlock(
    block.rawBlockType,
    block.normalizedBlockType,
    block.blockText,
  );
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
      if (!isReferencedUtilityNode(nextMeaningful, node)) {
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

function repairMarkdownBleedThrough(nodes: DocumentContent[]): DocumentContent[] {
  return nodes.flatMap((node) => repairMarkdownBleedThroughNode(node));
}

function repairMarkdownBleedThroughNode(node: DocumentContent): DocumentContent[] {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return repairListBleedThrough(node) ?? [node];
  }
  if (node.type !== 'paragraph') return [node];

  return repairMarkdownBleedThroughText(readInlineText(node)) ?? [node];
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
