import type { DocumentContent, DocumentKind } from '@dnd-booker/shared';
import { extractTocEntriesFromDocuments } from '@dnd-booker/shared';

export type BookStructureSeverity = 'error' | 'warning' | 'info';

export interface BookStructureIssue {
  severity: BookStructureSeverity;
  code: string;
  message: string;
  documentSlug?: string;
}

export interface BookStructureDocument {
  slug: string;
  title: string;
  kind: DocumentKind;
  sortOrder: number;
  content: unknown;
}

export interface BookStructureReport {
  issues: BookStructureIssue[];
  stats: {
    documentsAnalyzed: number;
    emptyDocuments: number;
    titlePageCount: number;
    tableOfContentsCount: number;
    chapterHeaderCount: number;
    backCoverCount: number;
    tocEntries: number;
  };
}

const KIND_ORDER: Record<DocumentKind, number> = {
  front_matter: 0,
  chapter: 1,
  appendix: 2,
  back_matter: 3,
};

const NON_CONTENT_NODE_TYPES = new Set(['doc', 'pageBreak', 'columnBreak', 'horizontalRule']);

function isDocumentContent(value: unknown): value is DocumentContent {
  return typeof value === 'object' && value !== null && 'type' in value;
}

function walkNodes(node: DocumentContent, visit: (node: DocumentContent) => void): void {
  visit(node);
  for (const child of node.content ?? []) {
    walkNodes(child, visit);
  }
}

function describeKind(kind: DocumentKind): string {
  return kind.replace('_', ' ');
}

function getFirstMeaningfulNode(content: DocumentContent | null): DocumentContent | null {
  if (!content) return null;

  let found: DocumentContent | null = null;
  walkNodes(content, (node) => {
    if (!found && !NON_CONTENT_NODE_TYPES.has(node.type)) {
      found = node;
    }
  });
  return found;
}

function hasMeaningfulNodes(content: DocumentContent | null): boolean {
  return getFirstMeaningfulNode(content) !== null;
}

function countNodeType(content: DocumentContent | null, type: string): number {
  if (!content) return 0;

  let count = 0;
  walkNodes(content, (node) => {
    if (node.type === type) count += 1;
  });
  return count;
}

function hasLevelOneHeading(content: DocumentContent | null): boolean {
  if (!content) return false;

  let found = false;
  walkNodes(content, (node) => {
    if (found) return;
    if (node.type === 'heading' && Number(node.attrs?.level ?? 1) === 1) {
      found = true;
    }
  });
  return found;
}

export function analyzeCompiledBookStructure(documents: BookStructureDocument[]): BookStructureReport {
  const issues: BookStructureIssue[] = [];
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);
  const tocEntries = extractTocEntriesFromDocuments(
    sorted.map((doc) => ({ content: isDocumentContent(doc.content) ? doc.content : null })),
  );

  let emptyDocuments = 0;
  let titlePageCount = 0;
  let tableOfContentsCount = 0;
  let chapterHeaderCount = 0;
  let backCoverCount = 0;
  let highestKindRankSeen = -1;

  for (const doc of sorted) {
    const content = isDocumentContent(doc.content) ? doc.content : null;
    const docRank = KIND_ORDER[doc.kind];

    if (docRank < highestKindRankSeen) {
      issues.push({
        severity: 'error',
        code: 'DOCUMENT_ORDER_INVALID',
        message: `"${doc.title}" is ${describeKind(doc.kind)} content placed after a later book section type.`,
        documentSlug: doc.slug,
      });
    } else {
      highestKindRankSeen = docRank;
    }

    if (!hasMeaningfulNodes(content)) {
      emptyDocuments += 1;
      issues.push({
        severity: doc.kind === 'chapter' ? 'error' : 'warning',
        code: 'EMPTY_DOCUMENT',
        message: `"${doc.title}" has no meaningful compiled content.`,
        documentSlug: doc.slug,
      });
      continue;
    }

    const titlePagesInDoc = countNodeType(content, 'titlePage');
    const tocBlocksInDoc = countNodeType(content, 'tableOfContents');
    const chapterHeadersInDoc = countNodeType(content, 'chapterHeader');
    const backCoversInDoc = countNodeType(content, 'backCover');

    titlePageCount += titlePagesInDoc;
    tableOfContentsCount += tocBlocksInDoc;
    chapterHeaderCount += chapterHeadersInDoc;
    backCoverCount += backCoversInDoc;

    if (tocBlocksInDoc > 0 && doc.kind !== 'front_matter') {
      issues.push({
        severity: 'warning',
        code: 'TOC_OUTSIDE_FRONT_MATTER',
        message: `"${doc.title}" contains a table of contents block outside front matter.`,
        documentSlug: doc.slug,
      });
    }

    if (titlePagesInDoc > 0 && doc.kind !== 'front_matter') {
      issues.push({
        severity: 'warning',
        code: 'TITLE_PAGE_OUTSIDE_FRONT_MATTER',
        message: `"${doc.title}" contains a title page outside front matter.`,
        documentSlug: doc.slug,
      });
    }

    if (backCoversInDoc > 0 && doc.kind !== 'back_matter') {
      issues.push({
        severity: 'warning',
        code: 'BACK_COVER_OUTSIDE_BACK_MATTER',
        message: `"${doc.title}" contains back-cover content outside back matter.`,
        documentSlug: doc.slug,
      });
    }

    if (doc.kind === 'chapter') {
      const firstMeaningfulNode = getFirstMeaningfulNode(content);
      const opensWithChapterMarker = firstMeaningfulNode?.type === 'chapterHeader'
        || (firstMeaningfulNode?.type === 'heading'
          && Number(firstMeaningfulNode.attrs?.level ?? 1) === 1);

      if (!opensWithChapterMarker) {
        issues.push({
          severity: 'warning',
          code: 'CHAPTER_OPENS_WITHOUT_HEADER',
          message: `"${doc.title}" does not begin with a chapter header or level-1 heading.`,
          documentSlug: doc.slug,
        });
      }

      if (chapterHeadersInDoc === 0 && !hasLevelOneHeading(content)) {
        issues.push({
          severity: 'warning',
          code: 'CHAPTER_HEADER_MISSING',
          message: `"${doc.title}" has no chapter header or level-1 heading for TOC and layout anchoring.`,
          documentSlug: doc.slug,
        });
      }
    }
  }

  if (sorted.length > 0 && titlePageCount === 0) {
    issues.push({
      severity: 'warning',
      code: 'TITLE_PAGE_MISSING',
      message: 'The compiled book has no title page.',
    });
  }

  if (titlePageCount > 1) {
    issues.push({
      severity: 'warning',
      code: 'MULTIPLE_TITLE_PAGES',
      message: `The compiled book has ${titlePageCount} title pages.`,
    });
  }

  if (tableOfContentsCount === 0 && sorted.filter((doc) => doc.kind === 'chapter').length > 1) {
    issues.push({
      severity: 'warning',
      code: 'TOC_MISSING',
      message: 'The compiled book has multiple chapters but no table of contents block.',
    });
  }

  if (tableOfContentsCount > 1) {
    issues.push({
      severity: 'warning',
      code: 'MULTIPLE_TOC_BLOCKS',
      message: `The compiled book has ${tableOfContentsCount} table of contents blocks.`,
    });
  }

  if (tableOfContentsCount > 0 && tocEntries.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'TOC_HAS_NO_ENTRIES',
      message: 'The compiled book includes a table of contents block but no chapter or heading entries were found.',
    });
  }

  if (backCoverCount > 1) {
    issues.push({
      severity: 'warning',
      code: 'MULTIPLE_BACK_COVERS',
      message: `The compiled book has ${backCoverCount} back cover blocks.`,
    });
  }

  return {
    issues,
    stats: {
      documentsAnalyzed: sorted.length,
      emptyDocuments,
      titlePageCount,
      tableOfContentsCount,
      chapterHeaderCount,
      backCoverCount,
      tocEntries: tocEntries.length,
    },
  };
}
