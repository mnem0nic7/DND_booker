interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

interface LayoutFindingSignal {
  code: string;
  affectedScope: string;
}

const REFERENCE_BLOCK_TYPES = new Set([
  'statBlock',
  'npcProfile',
  'magicItem',
  'spellCard',
  'randomTable',
  'encounterTable',
  'readAloud',
  'readAloudBox',
  'dmTips',
  'sidebarCallout',
]);

export interface PublicationPolishEdit {
  kind: 'remove' | 'insertBefore';
  index: number;
  code:
    | 'REMOVE_LEADING_PAGE_BREAK'
    | 'REMOVE_TRAILING_PAGE_BREAK'
    | 'REMOVE_CONSECUTIVE_PAGE_BREAK'
    | 'REMOVE_PAGE_BREAK_BEFORE_REFERENCE_BLOCK'
    | 'INSERT_PAGE_BREAK_BEFORE_CHAPTER_HEADING';
  reason: string;
  nodeType: 'pageBreak' | 'heading' | 'chapterHeader' | 'supportBlock';
  node?: TipTapNode;
}

interface TipTapDocument extends TipTapNode {
  type: 'doc';
  content: TipTapNode[];
}

function isTipTapDocument(content: unknown): content is TipTapDocument {
  return Boolean(
    content
    && typeof content === 'object'
    && (content as { type?: unknown }).type === 'doc'
    && Array.isArray((content as { content?: unknown }).content),
  );
}

function parseNodeIndex(scope: string): number | null {
  const match = /^node-(\d+)$/.exec(scope);
  if (!match) return null;
  return Number(match[1]);
}

export function derivePublicationPolishEdits(
  content: unknown,
  layoutFindings: LayoutFindingSignal[] = [],
): PublicationPolishEdit[] {
  if (!isTipTapDocument(content) || content.content.length === 0) return [];

  const edits: PublicationPolishEdit[] = [];
  const nodes = content.content;

  if (nodes[0]?.type === 'pageBreak') {
    edits.push({
      kind: 'remove',
      index: 0,
      code: 'REMOVE_LEADING_PAGE_BREAK',
      reason: 'Leading manual page breaks create an empty first page in compiled documents.',
      nodeType: 'pageBreak',
    });
  }

  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i]?.type === 'pageBreak' && nodes[i - 1]?.type === 'pageBreak') {
      edits.push({
        kind: 'remove',
        index: i,
        code: 'REMOVE_CONSECUTIVE_PAGE_BREAK',
        reason: 'Duplicate consecutive page breaks create empty or nearly empty pages.',
        nodeType: 'pageBreak',
      });
    }
  }

  for (const finding of layoutFindings) {
    if (finding.code === 'REFERENCE_BLOCK_STRANDED_AFTER_BREAK') {
      const index = parseNodeIndex(finding.affectedScope);
      if (index === null || index <= 0 || index >= nodes.length) continue;

      const node = nodes[index];
      if (!REFERENCE_BLOCK_TYPES.has(node?.type ?? '')) continue;
      if (nodes[index - 1]?.type !== 'pageBreak') continue;

      edits.push({
        kind: 'remove',
        index: index - 1,
        code: 'REMOVE_PAGE_BREAK_BEFORE_REFERENCE_BLOCK',
        reason: 'Support blocks should stay near the scene they support when the previous page has room.',
        nodeType: 'supportBlock',
      });
      continue;
    }

    if (finding.code !== 'CHAPTER_HEADING_MID_PAGE') continue;
    const index = parseNodeIndex(finding.affectedScope);
    if (index === null || index <= 0 || index >= nodes.length) continue;

    const node = nodes[index];
    const isChapterHeader = node?.type === 'chapterHeader';
    const isHeading = node?.type === 'heading' && Number(node.attrs?.level ?? 1) === 1;
    if (!isChapterHeader && !isHeading) continue;
    if (nodes[index - 1]?.type === 'pageBreak') continue;

    edits.push({
      kind: 'insertBefore',
      index,
      code: 'INSERT_PAGE_BREAK_BEFORE_CHAPTER_HEADING',
      reason: 'Mid-page chapter openers should start on a fresh page in polished output.',
      nodeType: isChapterHeader ? 'chapterHeader' : 'heading',
      node: { type: 'pageBreak' },
    });
  }

  const lastIndex = nodes.length - 1;
  if (lastIndex >= 0 && nodes[lastIndex]?.type === 'pageBreak') {
    edits.push({
      kind: 'remove',
      index: lastIndex,
      code: 'REMOVE_TRAILING_PAGE_BREAK',
      reason: 'Trailing page breaks create an empty final page in compiled documents.',
      nodeType: 'pageBreak',
    });
  }

  const seen = new Set<string>();
  return edits.filter((edit) => {
    const key = `${edit.kind}:${edit.index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function applyPublicationPolishEdits(
  content: unknown,
  edits: PublicationPolishEdit[],
): unknown {
  if (!isTipTapDocument(content) || edits.length === 0) return content;

  const removedIndices = new Set(
    edits
      .filter((edit) => edit.kind === 'remove')
      .map((edit) => edit.index),
  );
  const insertsByIndex = new Map<number, TipTapNode[]>();

  for (const edit of edits) {
    if (edit.kind !== 'insertBefore' || !edit.node) continue;
    const existing = insertsByIndex.get(edit.index) ?? [];
    existing.push(edit.node);
    insertsByIndex.set(edit.index, existing);
  }

  const nextContent: TipTapNode[] = [];
  content.content.forEach((node, index) => {
    const inserts = insertsByIndex.get(index);
    if (inserts && inserts.length > 0) {
      nextContent.push(...inserts);
    }
    if (!removedIndices.has(index)) {
      nextContent.push(node);
    }
  });

  return {
    ...content,
    content: nextContent,
  } satisfies TipTapDocument;
}
