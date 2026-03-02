/**
 * Assembles all project documents into a single HTML page ready for
 * Puppeteer PDF rendering. Includes theme CSS variables, print
 * stylesheet, Google Fonts, and all rendered document content.
 */

import { DocumentContent } from '@dnd-booker/shared';
import { tiptapToHtml } from './tiptap-to-html.js';
import { escapeHtml } from './utils.js';

export interface AssembleOptions {
  documents: Array<{ title: string; content: DocumentContent | null; sortOrder: number }>;
  theme: string;
  projectTitle: string;
}

/** Map theme name to CSS custom property overrides.
 * Theme names must match client ThemeName type:
 * 'classic-parchment' | 'dark-tome' | 'clean-modern' | 'fey-wild' | 'infernal' | 'dmguild'
 */
/**
 * Returns CSS custom properties for the given theme.
 *
 * Variable names match the client-side theme CSS (client/src/styles/themes/*.css)
 * so that exported HTML renders identically to the editor preview.
 *
 * Core layout vars: --page-bg, --text-color, --heading-font, --body-font,
 *   --accent-color, --accent-secondary
 * Block-specific vars: --stat-block-bg, --stat-block-border, --callout-bg,
 *   --read-aloud-bg, --read-aloud-border, --sidebar-bg,
 *   --table-header-bg, --table-stripe-bg, --border-decoration
 *
 * Additionally emits the worker-side aliases (--color-primary, --color-bg, etc.)
 * for backward compatibility with the inline block CSS below.
 */
function getThemeVariables(theme: string): string {
  const themes: Record<string, string> = {
    'classic-parchment': `
      /* Client theme vars */
      --page-bg: #f4e4c1;
      --text-color: #1a1a1a;
      --heading-font: 'Cinzel', serif;
      --body-font: 'Crimson Text', serif;
      --accent-color: #58180d;
      --accent-secondary: #c9ad6a;
      --stat-block-bg: #fdf1dc;
      --stat-block-border: #e69a28;
      --callout-bg: #e0d6c2;
      --read-aloud-bg: #e8dcc8;
      --read-aloud-border: #5c3a1e;
      --sidebar-bg: #e8edf3;
      --table-header-bg: #78350f;
      --table-stripe-bg: #fef3c7;
      --border-decoration: #8b1a1a;
      --spell-card-accent: #7c3aed;
      --magic-item-accent: #16a34a;
      --class-feature-accent: #991b1b;
      --encounter-accent: #2d6a3e;
      /* Worker aliases */
      --color-primary: #58180d;
      --color-secondary: #c9ad6a;
      --color-bg: #fdf1dc;
      --color-text: #1a1a1a;
      --color-accent: #e0d6c2;
      --color-heading: #58180d;
      --color-divider: #8b1a1a;
      --font-heading: 'Cinzel', serif;
      --font-body: 'Crimson Text', serif;
    `,
    'dark-tome': `
      --page-bg: #1a1a2e;
      --text-color: #e0d6c2;
      --heading-font: 'Uncial Antiqua', serif;
      --body-font: 'EB Garamond', serif;
      --accent-color: #c9a84c;
      --accent-secondary: #7b68ae;
      --stat-block-bg: #252545;
      --stat-block-border: #c9a84c;
      --callout-bg: #2a2a4a;
      --read-aloud-bg: #2a2a3e;
      --read-aloud-border: #c9a84c;
      --sidebar-bg: #252540;
      --table-header-bg: #3d2e6b;
      --table-stripe-bg: #22223a;
      --border-decoration: #7b68ae;
      --spell-card-accent: #7b68ae;
      --magic-item-accent: #c9a84c;
      --class-feature-accent: #c9a84c;
      --encounter-accent: #7b68ae;
      --color-primary: #c9a84c;
      --color-secondary: #7b68ae;
      --color-bg: #252545;
      --color-text: #e0d6c2;
      --color-accent: #2a2a4a;
      --color-heading: #c9a84c;
      --color-divider: #7b68ae;
      --font-heading: 'Uncial Antiqua', serif;
      --font-body: 'EB Garamond', serif;
    `,
    'clean-modern': `
      --page-bg: #ffffff;
      --text-color: #1f2937;
      --heading-font: 'Inter', sans-serif;
      --body-font: 'Merriweather', serif;
      --accent-color: #2563eb;
      --accent-secondary: #64748b;
      --stat-block-bg: #f1f5f9;
      --stat-block-border: #2563eb;
      --callout-bg: #eff6ff;
      --read-aloud-bg: #f8fafc;
      --read-aloud-border: #2563eb;
      --sidebar-bg: #f1f5f9;
      --table-header-bg: #1e40af;
      --table-stripe-bg: #f1f5f9;
      --border-decoration: #2563eb;
      --spell-card-accent: #7c3aed;
      --magic-item-accent: #16a34a;
      --class-feature-accent: #dc2626;
      --encounter-accent: #2563eb;
      --color-primary: #2563eb;
      --color-secondary: #64748b;
      --color-bg: #f1f5f9;
      --color-text: #1f2937;
      --color-accent: #eff6ff;
      --color-heading: #1e40af;
      --color-divider: #2563eb;
      --font-heading: 'Inter', sans-serif;
      --font-body: 'Merriweather', serif;
    `,
    'fey-wild': `
      --page-bg: #f0f7ee;
      --text-color: #1a2e1a;
      --heading-font: 'Dancing Script', cursive;
      --body-font: 'Lora', serif;
      --accent-color: #166534;
      --accent-secondary: #ca8a04;
      --stat-block-bg: #e8f5e2;
      --stat-block-border: #22c55e;
      --callout-bg: #dcfce7;
      --read-aloud-bg: #ecfdf5;
      --read-aloud-border: #166534;
      --sidebar-bg: #fefce8;
      --table-header-bg: #166534;
      --table-stripe-bg: #f0fdf4;
      --border-decoration: #22c55e;
      --spell-card-accent: #7c3aed;
      --magic-item-accent: #22c55e;
      --class-feature-accent: #ca8a04;
      --encounter-accent: #166534;
      --color-primary: #166534;
      --color-secondary: #ca8a04;
      --color-bg: #e8f5e2;
      --color-text: #1a2e1a;
      --color-accent: #dcfce7;
      --color-heading: #166534;
      --color-divider: #22c55e;
      --font-heading: 'Dancing Script', cursive;
      --font-body: 'Lora', serif;
    `,
    'infernal': `
      --page-bg: #1c1517;
      --text-color: #e8d5c4;
      --heading-font: 'Pirata One', cursive;
      --body-font: 'Bitter', serif;
      --accent-color: #dc2626;
      --accent-secondary: #ea580c;
      --stat-block-bg: #2a1f1f;
      --stat-block-border: #dc2626;
      --callout-bg: #2a1a1a;
      --read-aloud-bg: #2e1c1c;
      --read-aloud-border: #dc2626;
      --sidebar-bg: #2a1a1a;
      --table-header-bg: #7f1d1d;
      --table-stripe-bg: #231515;
      --border-decoration: #ea580c;
      --spell-card-accent: #ea580c;
      --magic-item-accent: #ea580c;
      --class-feature-accent: #dc2626;
      --encounter-accent: #dc2626;
      --color-primary: #dc2626;
      --color-secondary: #ea580c;
      --color-bg: #2a1f1f;
      --color-text: #e8d5c4;
      --color-accent: #2a1a1a;
      --color-heading: #dc2626;
      --color-divider: #ea580c;
      --font-heading: 'Pirata One', cursive;
      --font-body: 'Bitter', serif;
    `,
    'dmguild': `
      --page-bg: #EEE5CE;
      --text-color: #1a1a1a;
      --heading-font: 'Cinzel Decorative', 'Cinzel', serif;
      --body-font: 'Libre Baskerville', serif;
      --accent-color: #58180D;
      --accent-secondary: #C9AD6A;
      --stat-block-bg: #FDF1DC;
      --stat-block-border: #E69A28;
      --callout-bg: #E0E5C1;
      --read-aloud-bg: #FAF7EA;
      --read-aloud-border: #58180D;
      --sidebar-bg: #E0E5C1;
      --table-header-bg: #58180D;
      --table-stripe-bg: #FDF1DC;
      --border-decoration: #9C2B1B;
      --spell-card-accent: #58180D;
      --magic-item-accent: #58180D;
      --class-feature-accent: #58180D;
      --encounter-accent: #58180D;
      --color-primary: #58180D;
      --color-secondary: #C9AD6A;
      --color-bg: #FDF1DC;
      --color-text: #1a1a1a;
      --color-accent: #E0E5C1;
      --color-heading: #58180D;
      --color-divider: #9C2B1B;
      --font-heading: 'Cinzel Decorative', 'Cinzel', serif;
      --font-body: 'Libre Baskerville', serif;
    `,
  };

  return themes[theme] || themes['classic-parchment'];
}

interface TocEntry {
  level: number; // 1 = chapter header / h1, 2 = h2, 3 = h3
  prefix: string; // e.g. "Chapter 3" or ""
  title: string;
}

/**
 * Recursively scan TipTap JSON for chapterHeader and heading nodes
 * across all documents to build a hierarchical table of contents.
 */
function extractTocEntries(docs: AssembleOptions['documents']): TocEntry[] {
  const entries: TocEntry[] = [];

  function walk(node: DocumentContent) {
    if (node.type === 'chapterHeader') {
      const num = String(node.attrs?.chapterNumber || '');
      entries.push({
        level: 1,
        prefix: num ? `${num}.` : '',
        title: String(node.attrs?.title || 'Untitled Chapter'),
      });
    } else if (node.type === 'heading') {
      const level = Number(node.attrs?.level ?? 2);
      if (level >= 1 && level <= 3) {
        // Extract text content from heading children
        const text = extractTextContent(node);
        if (text) {
          entries.push({ level, prefix: '', title: text });
        }
      }
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  for (const doc of docs) {
    if (doc.content) {
      walk(doc.content);
    }
  }

  return entries;
}

/** Extract plain text from a TipTap node and its children. */
function extractTextContent(node: DocumentContent): string {
  if (node.type === 'text') return node.text || '';
  if (!node.content) return '';
  return node.content.map((c) => extractTextContent(c)).join('');
}

/**
 * Build TOC entry HTML from extracted entries with indentation by level.
 */
function buildTocEntriesHtml(entries: TocEntry[]): string {
  if (entries.length === 0) {
    return `<p class="table-of-contents__note">No chapters or headings found.</p>`;
  }

  return entries.map((entry) => {
    const indent = entry.level > 1 ? ` style="padding-left: ${(entry.level - 1) * 1.2}rem"` : '';
    const prefix = entry.prefix ? `${escapeHtml(entry.prefix)} ` : '';
    return `<div class="table-of-contents__entry"${indent}>
      <span class="table-of-contents__entry-title">${prefix}${escapeHtml(entry.title)}</span>
      <span class="table-of-contents__entry-leader"></span>
      <span class="table-of-contents__entry-page">&mdash;</span>
    </div>`;
  }).join('\n');
}

/**
 * Assemble a complete HTML document from project documents, theme, and title.
 */
export function assembleHtml(options: AssembleOptions): string {
  const { documents, theme, projectTitle } = options;

  // Sort documents by sortOrder
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);

  // Extract chapter headers and headings for TOC population
  const tocEntries = extractTocEntries(sorted);

  // Render each document's TipTap JSON to HTML
  const documentHtmlParts = sorted.map((doc) => {
    const contentHtml = doc.content ? tiptapToHtml(doc.content) : '';
    return `<section class="document" data-title="${escapeHtml(doc.title)}">
      ${contentHtml}
    </section>`;
  });

  // Post-process: inject entries into the first empty TOC entries div
  const tocEntriesHtml = buildTocEntriesHtml(tocEntries);
  let tocInjected = false;
  for (let i = 0; i < documentHtmlParts.length; i++) {
    if (!tocInjected && documentHtmlParts[i].includes('<div class="table-of-contents__entries"></div>')) {
      documentHtmlParts[i] = documentHtmlParts[i].replace(
        '<div class="table-of-contents__entries"></div>',
        `<div class="table-of-contents__entries">${tocEntriesHtml}</div>`,
      );
      tocInjected = true;
    }
  }

  const themeVars = getThemeVariables(theme);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(projectTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Crimson+Text:ital,wght@0,400;0,700;1,400&family=Uncial+Antiqua&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600;700&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Dancing+Script:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=Pirata+One&family=Bitter:ital,wght@0,400;0,700;1,400&family=Cinzel+Decorative:wght@400;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
  <style>
    /* Theme CSS variables */
    :root {
      ${themeVars}
    }

    /* Base styles */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--font-body);
      color: var(--color-text);
      background: var(--page-bg);
      line-height: 1.6;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-heading);
      color: var(--color-heading);
      margin-top: 1em;
      margin-bottom: 0.5em;
    }

    p {
      margin: 0.5em 0;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.85rem;
    }

    th, td {
      padding: 0.4rem 0.6rem;
      text-align: left;
      border-bottom: 1px solid var(--color-accent);
    }

    th {
      font-family: var(--font-heading);
      font-size: 0.8rem;
      color: white;
      background: var(--table-header-bg);
    }

    tr:nth-child(even) td {
      background: var(--table-stripe-bg, rgba(0, 0, 0, 0.04));
    }

    hr {
      border: none;
      height: 2px;
      background: var(--divider-gradient, linear-gradient(to right, transparent, var(--color-divider) 15%, var(--color-divider) 85%, transparent));
      margin: 0.75rem 0;
      position: relative;
    }

    hr.ornamental-divider::before {
      content: var(--divider-ornament, '');
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--page-bg, white);
      padding: 0 0.5rem;
      font-size: 0.9rem;
      color: var(--color-primary);
    }

    a {
      color: var(--color-primary);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
    }

    ul, ol {
      padding-left: 1.5em;
      margin: 0.5em 0;
      line-height: 1.5;
    }

    ul { list-style-type: disc; }
    ol { list-style-type: decimal; }
    ul ul { list-style-type: circle; }
    ul ul ul { list-style-type: square; }

    li {
      margin-bottom: 0.2em;
    }

    li p {
      text-indent: 0;
      margin: 0 0 0.15em;
    }

    blockquote {
      border-left: 4px solid var(--color-primary);
      padding-left: 1rem;
      margin-left: 0;
      color: var(--color-text);
      font-style: italic;
    }

    pre {
      background: var(--color-accent);
      padding: 1rem;
      overflow-x: auto;
      border-radius: 4px;
    }

    code {
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }

    /* Stat Block */
    .stat-block {
      background: var(--stat-block-bg);
      border: 2px solid var(--stat-block-border);
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .stat-block__name {
      font-family: var(--font-heading);
      color: var(--color-primary);
      margin: 0 0 0.1rem;
      font-size: 1.3rem;
    }

    .stat-block__subtitle {
      font-style: italic;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .stat-block__divider {
      border-top-color: var(--color-divider);
      margin: 0.5rem 0;
    }

    .stat-block__property {
      font-size: 0.85rem;
      margin: 0.15rem 0;
    }

    .stat-block__property-name {
      font-weight: bold;
      color: var(--color-primary);
    }

    .stat-block__abilities {
      display: flex;
      justify-content: space-around;
      text-align: center;
      margin: 0.5rem 0;
    }

    .stat-block__ability-name {
      font-weight: bold;
      font-size: 0.75rem;
      color: var(--color-primary);
    }

    .stat-block__ability-score {
      font-size: 0.85rem;
    }

    .stat-block__section-title {
      font-family: var(--font-heading);
      font-size: 1rem;
      color: var(--color-primary);
      border-bottom: 1px solid var(--color-divider);
      margin-top: 0.75rem;
      margin-bottom: 0.3rem;
      padding-bottom: 0.2rem;
    }

    .stat-block__trait {
      font-size: 0.85rem;
      margin: 0.3rem 0;
    }

    .stat-block__trait-name {
      font-weight: bold;
      font-style: italic;
    }

    /* Read Aloud Box */
    .read-aloud-box {
      padding: 1rem;
      margin: 1rem 0;
      border-left: 4px solid var(--read-aloud-border);
      background: var(--read-aloud-bg);
      page-break-inside: avoid;
    }

    .read-aloud-box--parchment {
      background: var(--read-aloud-bg);
    }

    .read-aloud-box--dark {
      background: #2d2d2d;
      color: #d4d4d4;
    }

    .read-aloud-box__label {
      font-family: var(--font-heading);
      font-weight: bold;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-primary);
    }

    /* Sidebar Callout */
    .sidebar-callout {
      padding: 1rem;
      margin: 1rem 0;
      background: var(--callout-bg);
      border: 1px solid var(--color-accent);
      border-radius: 4px;
      page-break-inside: avoid;
    }

    .sidebar-callout--info {
      border-left: 4px solid #2563eb;
    }

    .sidebar-callout--warning {
      border-left: 4px solid #d97706;
    }

    .sidebar-callout--lore {
      border-left: 4px solid #7c3aed;
    }

    .sidebar-callout__title {
      font-family: var(--font-heading);
      font-weight: bold;
      color: var(--color-heading);
      margin-bottom: 0.5rem;
    }

    /* Chapter Header */
    .chapter-header {
      text-align: center;
      padding: 3rem 2rem;
      margin: 2rem 0;
      page-break-before: always;
    }

    .chapter-header__number {
      font-family: var(--font-heading);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-primary);
    }

    .chapter-header__title {
      font-size: 2rem;
      margin: 0.5rem 0;
    }

    .chapter-header__underline {
      width: 4rem;
      height: 3px;
      background: var(--color-divider);
      margin: 0.5rem auto;
    }

    .chapter-header__subtitle {
      font-style: italic;
      color: var(--color-primary);
    }

    /* Spell Card */
    .spell-card {
      background: var(--stat-block-bg);
      border: 2px solid var(--spell-card-accent);
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .spell-card__name {
      font-family: var(--font-heading);
      color: var(--spell-card-accent);
      margin: 0 0 0.1rem;
      font-size: 1.3rem;
    }

    .spell-card__subtitle {
      font-style: italic;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .spell-card__divider {
      border-top-color: var(--spell-card-accent);
    }

    .spell-card__property {
      font-size: 0.85rem;
      margin: 0.15rem 0;
    }

    .spell-card__property-name {
      font-weight: bold;
      color: var(--spell-card-accent);
    }

    .spell-card__description {
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }

    .spell-card__higher-levels {
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }

    .spell-card__higher-levels-label {
      font-weight: bold;
      font-style: italic;
    }

    /* Magic Item */
    .magic-item {
      background: var(--stat-block-bg);
      border: 2px solid var(--magic-item-accent);
      border-top: 4px solid var(--magic-item-accent);
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .magic-item__name {
      font-family: var(--font-heading);
      margin: 0 0 0.1rem;
      font-size: 1.3rem;
    }

    .magic-item__subtitle {
      font-style: italic;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .magic-item__divider {
      margin: 0.5rem 0;
    }

    .magic-item__description {
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }

    .magic-item__properties {
      font-size: 0.85rem;
      margin-top: 0.5rem;
      font-style: italic;
    }

    /* Random Table */
    .random-table {
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .random-table__header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .random-table__title {
      font-family: var(--font-heading);
      color: var(--color-heading);
      margin: 0;
      font-size: 1.1rem;
    }

    .random-table__die-badge {
      background: var(--color-primary);
      color: white;
      font-size: 0.7rem;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-weight: bold;
    }

    /* NPC Profile */
    .npc-profile {
      background: var(--stat-block-bg);
      border: 2px solid var(--color-primary);
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .npc-profile__header {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
    }

    .npc-profile__portrait {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid var(--color-primary);
    }

    .npc-profile__portrait-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .npc-profile__portrait-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-accent);
      font-size: 0.65rem;
      color: #888;
    }

    .npc-profile__name {
      font-family: var(--font-heading);
      color: var(--color-primary);
      margin: 0;
      font-size: 1.2rem;
    }

    .npc-profile__subtitle {
      font-style: italic;
      font-size: 0.85rem;
    }

    .npc-profile__divider {
      border-top-color: var(--color-divider);
    }

    .npc-profile__description {
      font-size: 0.85rem;
      margin: 0.5rem 0;
    }

    .npc-profile__trait {
      font-size: 0.85rem;
      margin: 0.2rem 0;
    }

    .npc-profile__trait-label {
      font-weight: bold;
      font-style: italic;
    }

    /* Encounter Table */
    .encounter-table {
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .encounter-table__header {
      margin-bottom: 0.5rem;
    }

    .encounter-table__title {
      font-family: var(--font-heading);
      color: var(--color-heading);
      margin: 0;
      font-size: 1.1rem;
    }

    .encounter-table__cr-range {
      font-size: 0.8rem;
      font-style: italic;
    }

    /* Class Feature */
    .class-feature {
      background: var(--stat-block-bg);
      border: 2px solid var(--class-feature-accent);
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .class-feature__name {
      font-family: var(--font-heading);
      color: var(--class-feature-accent);
      margin: 0;
      font-size: 1.2rem;
    }

    .class-feature__subtitle {
      font-style: italic;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .class-feature__divider {
      border-top-color: var(--class-feature-accent);
    }

    .class-feature__description {
      font-size: 0.85rem;
    }

    /* Race Block */
    .race-block {
      background: var(--stat-block-bg);
      border: 2px solid var(--color-primary);
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .race-block__name {
      font-family: var(--font-heading);
      color: var(--color-primary);
      margin: 0;
      font-size: 1.3rem;
    }

    .race-block__divider {
      border-top-color: var(--color-divider);
    }

    .race-block__property {
      font-size: 0.85rem;
      margin: 0.15rem 0;
    }

    .race-block__property-name {
      font-weight: bold;
      font-style: italic;
    }

    .race-block__section-title {
      font-family: var(--font-heading);
      font-size: 1rem;
      color: var(--color-primary);
      margin-top: 0.5rem;
      margin-bottom: 0.3rem;
    }

    .race-block__feature {
      font-size: 0.85rem;
      margin: 0.3rem 0;
    }

    .race-block__feature-name {
      font-weight: bold;
      font-style: italic;
    }

    /* Full Bleed Image */
    .full-bleed-image {
      margin: 1rem 0;
      text-align: center;
    }

    .full-bleed-image--full {
      width: 100%;
    }

    .full-bleed-image--half {
      width: 50%;
      margin-left: auto;
      margin-right: auto;
    }

    .full-bleed-image--quarter {
      width: 25%;
      margin-left: auto;
      margin-right: auto;
    }

    .full-bleed-image__img {
      width: 100%;
      height: auto;
    }

    .full-bleed-image__caption {
      font-size: 0.8rem;
      font-style: italic;
      text-align: center;
      margin-top: 0.3rem;
    }

    /* Map Block */
    .map-block {
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .map-block__img {
      width: 100%;
      height: auto;
    }

    .map-block__scale {
      font-size: 0.8rem;
      font-style: italic;
      margin: 0.3rem 0;
    }

    .map-block__scale-label {
      font-weight: bold;
    }

    .map-block__legend {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: var(--color-accent);
      border-radius: 4px;
    }

    .map-block__legend-title {
      font-family: var(--font-heading);
      font-weight: bold;
      font-size: 0.9rem;
      margin-bottom: 0.3rem;
    }

    .map-block__legend-entry {
      font-size: 0.8rem;
      margin: 0.15rem 0;
    }

    .map-block__legend-label {
      font-weight: bold;
    }

    /* Handout */
    .handout {
      padding: 1.5rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .handout--letter {
      background: #f5f0e0;
      border: 1px solid #c0ad8a;
      font-family: 'Libre Baskerville', serif;
    }

    .handout--scroll {
      background: #eee4d0;
      border: 2px solid #8b7355;
      border-radius: 8px;
      font-family: 'Libre Baskerville', serif;
    }

    .handout--poster {
      background: #f5f5f5;
      border: 3px solid #333;
      font-family: 'Inter', sans-serif;
      text-align: center;
    }

    .handout__title {
      font-family: var(--font-heading);
      font-weight: bold;
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }

    .handout__content {
      font-size: 0.9rem;
      white-space: pre-wrap;
    }

    /* Page Border */
    .page-border {
      padding: 0.5rem;
      margin: 1rem 0;
    }

    .page-border__label {
      font-style: italic;
      font-size: 0.8rem;
    }

    /* Page Break */
    .page-break {
      page-break-after: always;
      break-after: page;
      height: 0;
      margin: 0;
      padding: 0;
    }

    /* Column Break */
    .column-break {
      break-before: column;
      height: 0;
      margin: 0;
      padding: 0;
    }

    /* Title Page */
    .title-page {
      text-align: center;
      padding: 4rem 2rem;
      page-break-after: always;
    }

    .title-page__content {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 80vh;
      justify-content: center;
    }

    .title-page__cover-image img {
      max-width: 80%;
      max-height: 40vh;
      margin-bottom: 2rem;
    }

    .title-page__title {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .title-page__subtitle {
      font-size: 1.2rem;
      font-style: italic;
      margin-bottom: 1rem;
    }

    .title-page__ornament {
      font-size: 1.5rem;
      color: var(--color-primary);
      margin: 1rem 0;
    }

    .title-page__author {
      font-size: 1rem;
      font-style: italic;
    }

    /* Table of Contents */
    .table-of-contents {
      page-break-after: always;
      padding: 2rem;
    }

    .table-of-contents__heading {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .table-of-contents__note {
      font-style: italic;
      font-size: 0.8rem;
      text-align: center;
      color: #888;
    }

    .table-of-contents__entry {
      display: flex;
      align-items: baseline;
      margin: 0.3rem 0;
    }

    .table-of-contents__entry-title {
      flex-shrink: 0;
    }

    .table-of-contents__entry-leader {
      flex: 1;
      border-bottom: 1px dotted var(--color-text);
      margin: 0 0.3rem;
      min-width: 1rem;
    }

    .table-of-contents__entry-page {
      flex-shrink: 0;
    }

    /* Credits Page */
    .credits-page {
      page-break-before: always;
      padding: 2rem;
    }

    .credits-page__heading {
      text-align: center;
    }

    .credits-page__credits-text {
      text-align: center;
      margin: 1rem 0;
    }

    .credits-page__divider {
      margin: 1.5rem 0;
    }

    .credits-page__legal-heading {
      font-size: 0.9rem;
    }

    .credits-page__legal-text {
      font-size: 0.75rem;
      color: #666;
    }

    .credits-page__copyright {
      text-align: center;
      font-size: 0.8rem;
      margin-top: 2rem;
      color: #888;
    }

    /* Back Cover */
    .back-cover {
      page-break-before: always;
      padding: 3rem 2rem;
      text-align: center;
    }

    .back-cover__blurb {
      font-size: 1rem;
      font-style: italic;
      max-width: 80%;
      margin: 0 auto 2rem;
    }

    .back-cover__ornament {
      font-size: 1.2rem;
      color: var(--color-primary);
      margin: 1.5rem 0;
    }

    .back-cover__author-section {
      display: flex;
      align-items: center;
      gap: 1rem;
      justify-content: center;
      margin-top: 1.5rem;
    }

    .back-cover__author-image {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      object-fit: cover;
    }

    .back-cover__author-bio {
      font-size: 0.85rem;
      text-align: left;
      max-width: 300px;
    }

    /* Document sections */
    .document {
      margin-bottom: 1rem;
    }

    /* Print styles */
    @media print {
      body {
        background: white;
      }

      @page {
        size: letter;
        margin: 0.75in;
      }

      .page-break {
        page-break-after: always;
        break-after: page;
      }

      .column-break {
        break-before: column;
      }

      .stat-block,
      .spell-card,
      .magic-item,
      .npc-profile,
      .class-feature,
      .race-block,
      .random-table,
      .encounter-table,
      .read-aloud-box,
      .sidebar-callout,
      .map-block,
      .handout {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div id="content">
    ${documentHtmlParts.join('\n    ')}
  </div>
</body>
</html>`;
}

