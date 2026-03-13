/**
 * Assembles all project documents into a single Typst source string
 * ready for compilation into a PDF. Includes theme variables, page
 * setup, typography, heading show rules, and rendered document content.
 */

import { DocumentContent, DocumentKind } from '@dnd-booker/shared';
import { tiptapToTypst } from './tiptap-to-typst.js';
import { getTypstThemeVariables } from './typst-themes.js';

interface AssembleTypstDocument {
  title: string;
  content: DocumentContent | null;
  sortOrder: number;
  kind?: DocumentKind | null;
  chapterNumberLabel?: string | null;
}

type EndCapMode = 'inline' | 'full_page';
type ChapterOpenerMode = 'inline' | 'dedicated_page';

export interface AssembleTypstOptions {
  documents: AssembleTypstDocument[];
  theme: string;
  projectTitle: string;
  projectType?: string | null;
  printReady?: boolean;
  exportPolish?: {
    h1SizePt?: number;
    endCapMode?: EndCapMode;
    chapterOpenerMode?: ChapterOpenerMode;
  };
}

/**
 * Assemble a complete Typst source document from project documents,
 * theme, and title.
 */
export function assembleTypst(options: AssembleTypstOptions): string {
  const { documents, theme, projectTitle, projectType = null, printReady = false, exportPolish } = options;
  const h1SizePt = exportPolish?.h1SizePt ?? 23;
  const endCapMode = exportPolish?.endCapMode ?? 'inline';
  const chapterOpenerMode = exportPolish?.chapterOpenerMode ?? 'inline';

  // Sort documents by sortOrder
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);
  const renderQueue = buildRenderQueue(sorted, projectTitle, chapterOpenerMode, projectType);

  // 1. Theme variables
  const themeVars = getTypstThemeVariables(theme);

  // Determine if texture is present
  const textureMatch = themeVars.match(/#let theme-texture = "(.*)"/);
  const texture = textureMatch ? textureMatch[1] : '';

  let t = '';

  // Emit theme variables
  t += themeVars + '\n\n';

  // 2. Page setup
  t += `#set columns(gutter: 0.9cm)\n`;
  t += `#set page(\n`;
  t += `  paper: "us-letter",\n`;
  t += `  columns: 2,\n`;

  if (printReady) {
    t += `  margin: (top: 0.875in, bottom: 0.875in, inside: 0.875in, outside: 0.75in),\n`;
  } else {
    t += `  margin: (top: 0.75in, bottom: 0.75in, inside: 0.75in, outside: 0.75in),\n`;
  }

  if (texture) {
    t += `  background: image("textures/${texture}", width: 100%, height: 100%),\n`;
  }

  if (!printReady) {
    t += `  footer: context {\n`;
    t += `    let headings = query(selector(heading.where(level: 1)).before(here()))\n`;
    t += `    let section-name = if headings.len() > 0 { headings.last().body } else { "${escapeTypstString(projectTitle)}" }\n`;
    t += `    set text(size: 8pt, fill: theme-secondary)\n`;
    t += `    grid(columns: (1fr, auto, 1fr),\n`;
    t += `      align(left, text(font: heading-font, upper(section-name))),\n`;
    t += `      none,\n`;
    t += `      align(right, counter(page).display()),\n`;
    t += `    )\n`;
    t += `  },\n`;
    t += `  numbering: "1",\n`;
  }

  t += `)\n\n`;

  // 3. Typography
  t += `#set text(font: body-font, size: 9.5pt, fill: theme-text)\n`;
  t += `#set par(justify: true, leading: 0.55em, spacing: 0.325cm)\n\n`;

  // 4. Heading show rules — PHB style

  // H1: Large, no divider line
  t += `#show heading.where(level: 1): it => [\n`;
  t += `  #set text(font: heading-font, size: ${h1SizePt}pt, fill: theme-primary, weight: "bold")\n`;
  t += `  #set text(hyphenate: false)\n`;
  t += `  #set par(justify: false)\n`;
  t += `  #v(12pt)\n`;
  t += `  #it.body\n`;
  t += `  #v(4pt)\n`;
  t += `]\n\n`;

  // H2: Medium
  t += `#show heading.where(level: 2): it => {\n`;
  t += `  set text(font: heading-font, size: 17pt, fill: theme-primary, weight: "bold")\n`;
  t += `  v(8pt)\n`;
  t += `  it.body\n`;
  t += `  v(4pt)\n`;
  t += `}\n\n`;

  // H3: Gold underline — key PHB signature
  t += `#show heading.where(level: 3): it => {\n`;
  t += `  set text(font: heading-font, size: 14pt, fill: theme-primary, weight: "bold")\n`;
  t += `  v(6pt)\n`;
  t += `  it.body\n`;
  t += `  v(1pt)\n`;
  t += `  line(length: 100%, stroke: 2pt + theme-header-underline)\n`;
  t += `  v(3pt)\n`;
  t += `}\n\n`;

  // H4: Small heading
  t += `#show heading.where(level: 4): it => {\n`;
  t += `  set text(font: heading-font, size: 12pt, fill: theme-primary, weight: "bold")\n`;
  t += `  v(4pt)\n`;
  t += `  it.body\n`;
  t += `  v(2pt)\n`;
  t += `}\n\n`;

  // 5. Render each document
  let hasRenderedDocument = false;
  let previousEndedWithPageBreak = false;

  for (const doc of renderQueue) {
    if (doc.content == null) continue;
    let rendered = tiptapToTypst(doc.content);
    if (!rendered.trim()) continue;

    if (hasRenderedDocument && requiresFreshPage(doc) && !previousEndedWithPageBreak) {
      t += `#pagebreak()\n\n`;
    }

    if (chapterOpenerMode === 'dedicated_page' && (doc.kind === 'chapter' || doc.kind === 'appendix')) {
      t += renderDedicatedChapterOpening(doc.title, doc.chapterNumberLabel);
      rendered = tiptapToTypst(stripLeadingSectionOpener(doc.content, doc.title));
      if (!rendered.trim()) {
        hasRenderedDocument = true;
        previousEndedWithPageBreak = true;
        continue;
      }
    }

    t += rendered;
    hasRenderedDocument = true;
    previousEndedWithPageBreak = endsWithPageBreak(rendered);
  }

  if (shouldAppendLongFormEndCap(renderQueue)) {
    t += renderLongFormEndCap(endCapMode);
  }

  return t;
}

function buildRenderQueue(
  documents: AssembleTypstDocument[],
  projectTitle: string,
  chapterOpenerMode: ChapterOpenerMode,
  projectType: string | null
): AssembleTypstDocument[] {
  const longForm = isLongFormBook(documents);
  const syntheticToc = shouldInjectSyntheticTableOfContents(documents, projectType);
  const syntheticTocDepth = getSyntheticTableOfContentsDepth(documents);
  const hasTitlePage = documents.some((doc) => documentContainsType(doc.content, 'titlePage'));
  const hasTableOfContents = documents.some((doc) => documentContainsType(doc.content, 'tableOfContents'));
  const chapterDocs = documents.filter((doc) => doc.kind === 'chapter' && doc.content != null);
  const chapterNumbers = new Map(chapterDocs.map((doc, index) => [doc, index + 1]));

  const queue = documents.map((doc) => {
    const chapterNumber = chapterNumbers.get(doc);
    const withChapterMeta = {
      ...doc,
      chapterNumberLabel: doc.kind === 'chapter' && chapterNumber != null
        ? `Chapter ${chapterNumber}`
        : null,
    };

    if (chapterOpenerMode === 'dedicated_page' && (doc.kind === 'chapter' || doc.kind === 'appendix')) {
      return withChapterMeta;
    }

    return longForm ? ensureDocumentSectionOpener(withChapterMeta, chapterNumber) : withChapterMeta;
  });

  if (longForm && !hasTitlePage) {
    queue.unshift(createSyntheticTitlePage(projectTitle));
  }

  if (syntheticToc && !hasTableOfContents) {
    const insertAt = queue.findIndex((doc) => doc.kind === 'chapter' || doc.kind === 'appendix' || doc.kind === 'back_matter');
    queue.splice(insertAt === -1 ? queue.length : insertAt, 0, createSyntheticTableOfContents(syntheticTocDepth));
  }

  return queue;
}

function isLongFormBook(documents: AssembleTypstDocument[]): boolean {
  const chapterLikeDocs = documents.filter(
    (doc) => doc.content != null && (doc.kind === 'chapter' || doc.kind === 'appendix')
  );
  return chapterLikeDocs.length >= 2;
}

function shouldInjectSyntheticTableOfContents(
  documents: AssembleTypstDocument[],
  projectType: string | null,
): boolean {
  const chapterLikeDocs = documents.filter(
    (doc) => doc.content != null && (doc.kind === 'chapter' || doc.kind === 'appendix')
  );
  if (projectType === 'one_shot' && chapterLikeDocs.length <= 4) return false;
  return chapterLikeDocs.length >= 3;
}

function getSyntheticTableOfContentsDepth(documents: AssembleTypstDocument[]): number {
  const chapterLikeDocs = documents.filter(
    (doc) => doc.content != null && (doc.kind === 'chapter' || doc.kind === 'appendix')
  );

  if (chapterLikeDocs.length <= 6) return 1;
  if (chapterLikeDocs.length <= 10) return 2;
  return 3;
}

function ensureDocumentSectionOpener(
  document: AssembleTypstDocument,
  chapterNumber?: number
): AssembleTypstDocument {
  if (document.content == null || !document.title.trim()) return document;
  if (document.kind !== 'chapter' && document.kind !== 'appendix') return document;
  if (documentStartsWithSectionOpener(document.content)) return document;

  const openerAttrs: Record<string, unknown> = { title: document.title };
  if (document.kind === 'chapter' && chapterNumber != null) {
    openerAttrs.chapterNumber = `Chapter ${chapterNumber}`;
  }

  return {
    ...document,
    content: {
      type: 'doc',
      content: [
        { type: 'chapterHeader', attrs: openerAttrs },
        ...stripLeadingDuplicateTitleHeading(getTopLevelNodes(document.content), document.title),
      ],
    },
  };
}

function stripLeadingDuplicateTitleHeading(nodes: DocumentContent[], documentTitle: string): DocumentContent[] {
  const firstMeaningfulIndex = nodes.findIndex((node) => node.type !== 'pageBreak' && node.type !== 'columnBreak');
  if (firstMeaningfulIndex === -1) return nodes;

  const firstNode = nodes[firstMeaningfulIndex];
  if (firstNode.type !== 'heading') return nodes;

  const level = Number(firstNode.attrs?.level ?? 0);
  if (level < 1 || level > 3) return nodes;

  const headingText = renderInlineText(firstNode.content);
  if (!headingText || normalizeSectionTitle(headingText) !== normalizeSectionTitle(documentTitle)) {
    return nodes;
  }

  return nodes.filter((_node, index) => index !== firstMeaningfulIndex);
}

function stripLeadingSectionOpener(content: DocumentContent, documentTitle: string): DocumentContent {
  const nodes = [...getTopLevelNodes(content)];
  if (nodes.length === 0) return content;

  let openerIndex = -1;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === 'pageBreak' || node.type === 'columnBreak') continue;

    if (node.type === 'chapterHeader') {
      openerIndex = i;
      break;
    }

    if (node.type === 'heading' && Number(node.attrs?.level) === 1) {
      const headingText = renderInlineText(node.content);
      if (!headingText || normalizeSectionTitle(headingText) === normalizeSectionTitle(documentTitle)) {
        openerIndex = i;
      }
      break;
    }

    break;
  }

  if (openerIndex === -1) return content;

  const nextNodes = nodes.filter((_node, index) => index !== openerIndex);
  return {
    type: 'doc',
    content: nextNodes,
  };
}

function documentStartsWithSectionOpener(content: DocumentContent): boolean {
  for (const node of getTopLevelNodes(content)) {
    if (node.type === 'pageBreak' || node.type === 'columnBreak') {
      continue;
    }

    if (node.type === 'chapterHeader') return true;
    if (node.type === 'heading' && Number(node.attrs?.level) === 1) return true;
    return false;
  }

  return false;
}

function getTopLevelNodes(content: DocumentContent): DocumentContent[] {
  if (content.type === 'doc') {
    return content.content ?? [];
  }

  return [content];
}

function documentContainsType(content: DocumentContent | null, targetType: string): boolean {
  if (content == null) return false;
  if (content.type === targetType) return true;
  return (content.content ?? []).some((child) => documentContainsType(child, targetType));
}

function createSyntheticTitlePage(projectTitle: string): AssembleTypstDocument {
  return {
    title: 'Title Page',
    kind: 'front_matter',
    sortOrder: Number.MIN_SAFE_INTEGER,
    content: {
      type: 'doc',
      content: [
        {
          type: 'titlePage',
          attrs: { title: projectTitle },
        },
      ],
    },
  };
}

function createSyntheticTableOfContents(depth: number): AssembleTypstDocument {
  return {
    title: 'Table of Contents',
    kind: 'front_matter',
    sortOrder: Number.MIN_SAFE_INTEGER + 1,
    content: {
      type: 'doc',
      content: [
        {
          type: 'tableOfContents',
          attrs: { depth },
        },
      ],
    },
  };
}

function requiresFreshPage(document: AssembleTypstDocument): boolean {
  return (
    document.kind === 'chapter' ||
    document.kind === 'appendix' ||
    document.kind === 'back_matter' ||
    documentContainsType(document.content, 'titlePage') ||
    documentContainsType(document.content, 'tableOfContents') ||
    documentContainsType(document.content, 'creditsPage') ||
    documentContainsType(document.content, 'backCover')
  );
}

function endsWithPageBreak(rendered: string): boolean {
  return /#pagebreak\(\)\s*(#set page\(columns: 2\)\s*)?$/.test(rendered);
}

function shouldAppendLongFormEndCap(documents: AssembleTypstDocument[]): boolean {
  if (!isLongFormBook(documents)) return false;

  return !documents.some(
    (doc) =>
      doc.kind === 'back_matter' ||
      documentContainsType(doc.content, 'creditsPage') ||
      documentContainsType(doc.content, 'backCover')
  );
}

function renderLongFormEndCap(mode: EndCapMode): string {
  if (mode === 'full_page') {
    let full = '';
    full += `#pagebreak()\n`;
    full += `#set page(columns: 1)\n`;
    full += `#align(center)[\n`;
    full += `  #v(1fr)\n`;
    full += `  #line(length: 40%, stroke: theme-divider)\n`;
    full += `  #v(12pt)\n`;
    full += `  #text(font: heading-font, size: 16pt, fill: theme-secondary)[THE END]\n`;
    full += `  #v(8pt)\n`;
    full += `  #text(size: 12pt, fill: theme-secondary)[\\u{2726} \\u{2726} \\u{2726}]\n`;
    full += `  #v(1fr)\n`;
    full += `]\n\n`;
    return full;
  }

  let t = '';
  t += `#block(width: 100%, inset: 12pt, above: 18pt)[\n`;
  t += `  #align(center)[\n`;
  t += `    #line(length: 40%, stroke: theme-divider)\n`;
  t += `    #v(8pt)\n`;
  t += `    #text(font: heading-font, size: 10pt, fill: theme-secondary)[THE END]\n`;
  t += `    #v(4pt)\n`;
  t += `    #text(size: 11pt, fill: theme-secondary)[\\u{2726} \\u{2726} \\u{2726}]\n`;
  t += `  ]\n`;
  t += `]\n\n`;
  return t;
}

function renderDedicatedChapterOpening(title: string, chapterNumberLabel: string | null | undefined): string {
  let t = '';
  t += `#set page(columns: 1)\n`;
  t += `#align(center)[\n`;
  t += `  #v(1fr)\n`;
  if (chapterNumberLabel) {
    t += `  #text(font: title-font, size: 14pt, fill: theme-secondary)[${escapeTypstContent(chapterNumberLabel)}]\n`;
    t += `  #v(10pt)\n`;
  }
  t += `  #text(font: heading-font, size: 24pt, fill: theme-primary, weight: "bold")[${escapeTypstContent(title)}]\n`;
  t += `  #v(10pt)\n`;
  t += `  #line(length: 40%, stroke: theme-divider)\n`;
  t += `  #v(1fr)\n`;
  t += `]\n`;
  t += `#pagebreak()\n`;
  t += `#set page(columns: 2)\n\n`;
  return t;
}

function renderInlineText(nodes?: DocumentContent[]): string {
  if (!nodes) return '';
  let text = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      text += node.text ?? '';
      continue;
    }
    text += renderInlineText(node.content);
  }
  return text.trim();
}

function normalizeSectionTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\u00ad/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function escapeTypstContent(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/#/g, '\\#');
}

/** Escape double quotes in a string for use inside Typst string literals. */
function escapeTypstString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
