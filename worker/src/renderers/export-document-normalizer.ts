import type { DocumentContent, DocumentKind } from '@dnd-booker/shared';
import { normalizeEncounterEntries } from '@dnd-booker/shared';

interface ExportDocument {
  title: string;
  content: DocumentContent | null;
  sortOrder: number;
  kind?: DocumentKind | null;
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
  projectTitle: string
): T[] {
  return documents.flatMap((document) => {
    if (document.content == null) return [document];

    const content = normalizeExportContent(document.content, projectTitle);
    if (content == null || isEffectivelyEmpty(content)) return [];

    return [{
      ...document,
      content,
    }];
  });
}

function normalizeExportContent(content: DocumentContent, projectTitle: string): DocumentContent | null {
  const nodes = getTopLevelNodes(content)
    .map((node) => normalizeNode(node, projectTitle))
    .filter((node): node is DocumentContent => node != null);

  const repairedMarkdownBleedThrough = repairMarkdownBleedThrough(nodes);
  const withoutPlaceholderScaffold = stripPlaceholderAdventureScaffold(repairedMarkdownBleedThrough);
  const withoutRedundantBreaks = stripRedundantStructuralPageBreaks(withoutPlaceholderScaffold);

  if (withoutRedundantBreaks.length === 0) return null;

  return {
    type: 'doc',
    content: withoutRedundantBreaks,
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

function normalizeEncounterTableNode(node: DocumentContent): DocumentContent {
  const attrs = { ...(node.attrs ?? {}) };
  const entries = normalizeEncounterEntries(attrs.entries);
  attrs.entries = JSON.stringify(entries);
  return {
    ...node,
    attrs,
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

function repairMarkdownBleedThrough(nodes: DocumentContent[]): DocumentContent[] {
  return nodes.flatMap((node) => repairMarkdownBleedThroughNode(node));
}

function repairMarkdownBleedThroughNode(node: DocumentContent): DocumentContent[] {
  if (node.type !== 'paragraph') return [node];

  const text = readInlineText(node);
  const headingMatch = text.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    return [{
      type: 'heading',
      attrs: { level: headingMatch[1].length },
      content: [{ type: 'text', text: headingMatch[2].trim() }],
    }];
  }

  const blockMatch = text.match(/^:::(\w+)\s+(.+)$/s);
  if (!blockMatch) return [node];

  const normalizedBlockType = normalizeBleedThroughBlockType(blockMatch[1]);
  const blockText = blockMatch[2].trim();
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
        title: blockMatch[1] === 'dmTips' ? 'DM Tips' : 'Note',
        calloutType: 'info',
      },
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: blockText }],
      }],
    }];
  }

  return [node];
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

function isPlaceholderAdventureHeading(node: DocumentContent | undefined): boolean {
  if (node?.type !== 'heading') return false;
  if (Number(node.attrs?.level) !== 1) return false;
  return PLACEHOLDER_BODY_HEADINGS.has(readInlineText(node));
}

function isPlaceholderAdventureParagraph(node: DocumentContent | undefined): boolean {
  if (node?.type !== 'paragraph') return false;
  return PLACEHOLDER_BODY_PARAGRAPHS.has(readInlineText(node));
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
