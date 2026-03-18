/**
 * Assembles all project documents into a single HTML page ready for
 * Puppeteer PDF rendering. Includes theme CSS variables, print
 * stylesheet, Google Fonts, and all rendered document content.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DocumentContent,
  LayoutPlan,
  PageModel,
  PagePreset,
  extractTocEntriesFromDocuments,
  getCanonicalLayoutCss,
  renderContentWithLayoutPlan,
  renderFlowContentWithLayoutPlan,
} from '@dnd-booker/shared';
import { escapeHtml } from './utils.js';

export interface AssembleOptions {
  documents: Array<{
    title: string;
    content: DocumentContent | null;
    sortOrder: number;
    kind?: string | null;
    layoutPlan?: LayoutPlan | null;
    pageModel?: PageModel | null;
  }>;
  theme: string;
  projectTitle: string;
  pagePreset?: PagePreset;
  renderMode?: 'paged' | 'flow';
}

function resolveTextureValue(theme: string): string {
  const textureByTheme: Record<string, string | null> = {
    'classic-parchment': 'parchment-classic.jpg',
    'gilded-folio': 'parchment-dmguild.jpg',
    'dmguild': 'parchment-dmguild.jpg',
    'dark-tome': 'parchment-dark.jpg',
    'clean-modern': null,
    'fey-wild': 'parchment-fey.jpg',
    'infernal': 'parchment-infernal.jpg',
  };

  const fileName = textureByTheme[theme] ?? textureByTheme['classic-parchment'];
  if (!fileName) return 'none';

  const texturePath = path.resolve(process.cwd(), 'assets', 'textures', fileName);
  return `url("${pathToFileURL(texturePath).toString()}")`;
}

function getSharedThemeLayoutVariables(theme: string): string {
  const lightTheme = !['dark-tome', 'infernal'].includes(theme);
  return `
      --page-texture: ${resolveTextureValue(theme)};
      --column-rule-color: ${lightTheme ? 'rgba(88, 24, 13, 0.12)' : 'rgba(232, 213, 196, 0.14)'};
      --footer-color: ${lightTheme ? 'rgba(88, 24, 13, 0.72)' : 'rgba(232, 213, 196, 0.72)'};
      --paragraph-indent: 1em;
      --divider-gradient: linear-gradient(to right, transparent, var(--color-divider) 16%, var(--color-divider) 84%, transparent);
  `;
}

/** Map theme name to CSS custom property overrides.
 * Theme names must match client ThemeName type:
 * 'classic-parchment' | 'gilded-folio' | 'dark-tome' | 'clean-modern' | 'fey-wild' | 'infernal' | 'dmguild'
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
    'gilded-folio': `
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

  return `${themes[theme] || themes['classic-parchment']}\n${getSharedThemeLayoutVariables(theme)}`;
}

/**
 * Build TOC entry HTML from extracted entries with indentation by level.
 */
function buildTocEntriesHtml(entries: Array<{ level: number; prefix: string; title: string }>): string {
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
  const { documents, theme, projectTitle, pagePreset = 'standard_pdf', renderMode = 'paged' } = options;

  // Sort documents by sortOrder
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);

  // Extract chapter headers and headings for TOC population
  const tocEntries = extractTocEntriesFromDocuments(sorted);

  // Render each document's canonical layout HTML
  let pageNumberOffset = 0;
  const documentHtmlParts = sorted.map((doc) => {
    const rendered = doc.content
      ? (renderMode === 'flow'
        ? renderFlowContentWithLayoutPlan({
            content: doc.content,
            layoutPlan: doc.layoutPlan ?? null,
            preset: pagePreset,
            options: {
              documentKind: doc.kind ?? null,
              documentTitle: doc.title,
            },
          })
        : renderContentWithLayoutPlan({
            content: doc.content,
            layoutPlan: doc.layoutPlan ?? null,
            pageModel: doc.pageModel ?? null,
            preset: pagePreset,
            options: {
              documentKind: doc.kind ?? null,
              documentTitle: doc.title,
            },
            footerTitle: projectTitle,
            pageNumberOffset,
          }))
      : null;
    if (renderMode === 'paged' && rendered?.pageModel) {
      pageNumberOffset += rendered.pageModel.pages.length;
    }
    return `<section class="document" data-title="${escapeHtml(doc.title)}" data-kind="${escapeHtml(String(doc.kind ?? ''))}">
      <div class="ProseMirror">
        ${rendered?.html ?? ''}
      </div>
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
  const pageMargin = renderMode === 'paged'
    ? '0in'
    : pagePreset === 'print_pdf'
      ? '0.875in 0.75in 0.875in 0.75in'
      : '0.75in';

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

    ${getCanonicalLayoutCss()}

    /* Base styles */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--font-body);
      color: var(--color-text);
      background: #3d4656;
      line-height: 1.36;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    #content {
      padding: ${renderMode === 'paged' ? '0' : '0.5rem 0'};
    }

    .page-canvas {
      --page-width: 816px;
      --page-height: 1056px;
      --page-padding: ${pagePreset === 'print_pdf' ? '56px' : '60px'};
      --content-height: calc(var(--page-height) - (var(--page-padding) * 2));
      --page-content-height: calc(var(--content-height) - 56px);
      --margin-reserve: 56px;
      --layout-column-gap: 18px;

      width: var(--page-width);
      height: var(--page-height);
      min-height: var(--page-height);
      margin: 0 auto;
      padding: var(--page-padding);
      box-sizing: border-box;
      background-color: var(--page-bg);
      background-image:
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(121, 84, 33, 0.04) 40%, rgba(0, 0, 0, 0.04)),
        radial-gradient(circle at top left, rgba(255, 255, 255, 0.22), transparent 32%),
        radial-gradient(circle at bottom right, rgba(88, 24, 13, 0.09), transparent 36%),
        linear-gradient(90deg, rgba(78, 41, 10, 0.07), transparent 5%, transparent 95%, rgba(78, 41, 10, 0.07)),
        var(--page-texture);
      background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, var(--page-width) var(--page-height);
      background-repeat: repeat-y;
      background-position: top center;
      background-blend-mode: normal, screen, multiply, multiply, normal;
      position: relative;
      color: var(--text-color);
      font-family: var(--body-font);
      font-size: 8.55pt;
      font-feature-settings: 'kern' 1, 'liga' 1;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow: hidden;
      border: 1px solid rgba(71, 42, 15, 0.2);
      box-shadow:
        0 18px 40px rgba(0, 0, 0, 0.28),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }

    .page-canvas .ProseMirror {
      min-height: var(--page-content-height);
      color: inherit;
    }

    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-heading);
      color: var(--color-heading);
      margin-top: 0.9em;
      margin-bottom: 0.35em;
    }

    p {
      margin: 0.22em 0;
      text-align: justify;
      text-indent: var(--paragraph-indent, 1em);
      line-height: 1.24;
      widows: 2;
      orphans: 2;
    }

    p:first-child,
    h1 + p,
    h2 + p,
    h3 + p,
    h4 + p {
      text-indent: 0;
    }

    h1 {
      font-size: 15pt;
      margin-top: 1.15em;
      margin-bottom: 0.35em;
    }

    h2 {
      font-size: 12.4pt;
      margin-top: 0.95em;
      margin-bottom: 0.28em;
    }

    h3 {
      font-size: 10.7pt;
      margin-top: 0.8em;
      margin-bottom: 0.24em;
    }

    h4 {
      font-size: 9.7pt;
      margin-top: 0.62em;
      margin-bottom: 0.16em;
      font-weight: bold;
    }

    .page-footer {
      position: absolute;
      bottom: 20px;
      left: var(--page-padding);
      right: var(--page-padding);
      font-size: 0.65rem;
      color: var(--footer-color, rgba(0, 0, 0, 0.45));
      display: flex;
      justify-content: space-between;
      font-family: var(--body-font);
      pointer-events: none;
      user-select: none;
    }

    .layout-page.page-canvas {
      display: grid;
      grid-template-rows: minmax(0, var(--page-content-height, calc(var(--content-height, 912px) - 56px))) auto;
      align-content: start;
    }

    .layout-page.page-canvas .layout-page__body {
      min-height: 0;
      max-height: var(--page-content-height, calc(var(--content-height, 912px) - 56px));
    }

    .layout-page.page-canvas > .page-footer {
      position: relative;
      bottom: auto;
      left: auto;
      right: auto;
      margin-top: 0.15rem;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    .document .ProseMirror {
      display: block;
    }

    .document + .document[data-kind="chapter"],
    .document + .document[data-kind="appendix"],
    .document + .document[data-kind="back_matter"] {
      break-before: page;
      page-break-before: always;
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

    hr.section-divider {
      border: none;
      height: 2px;
      background: var(--color-divider);
      margin: 0.75rem 0;
    }

    hr.ornamental-divider {
      border: none;
      height: 4px;
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
      margin: 0.35em 0;
      line-height: 1.35;
    }

    ul { list-style-type: disc; }
    ol { list-style-type: decimal; }
    ul ul { list-style-type: circle; }
    ul ul ul { list-style-type: square; }

    li {
      margin-bottom: 0.12em;
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
      padding: 0.72rem;
      margin: 0.7rem 0;
      page-break-inside: avoid;
    }

    .stat-block__name {
      font-family: var(--font-heading);
      color: var(--color-primary);
      margin: 0 0 0.1rem;
      font-size: 1.16rem;
    }

    .stat-block__subtitle {
      font-style: italic;
      font-size: 0.78rem;
      margin-bottom: 0.34rem;
    }

    .stat-block__divider {
      border: 0;
      border-top: 1px solid var(--color-divider);
      background: none;
      height: 0;
      margin: 0.34rem 0;
    }

    .stat-block__property {
      font-size: 0.8rem;
      line-height: 1.25;
      margin: 0.12rem 0;
    }

    .stat-block__property-name {
      font-weight: bold;
      color: var(--color-primary);
    }

    .stat-block__abilities {
      display: flex;
      justify-content: space-around;
      text-align: center;
      margin: 0.3rem 0;
    }

    .stat-block__ability-name {
      font-weight: bold;
      font-size: 0.75rem;
      color: var(--color-primary);
    }

    .stat-block__ability-score {
      font-size: 0.78rem;
    }

    .stat-block__section-title {
      font-family: var(--font-heading);
      font-size: 0.92rem;
      color: var(--color-primary);
      border-bottom: 1px solid var(--color-divider);
      margin-top: 0.5rem;
      margin-bottom: 0.2rem;
      padding-bottom: 0.2rem;
    }

    .stat-block__trait {
      font-size: 0.8rem;
      line-height: 1.25;
      margin: 0.22rem 0;
    }

    .stat-block__trait-name {
      font-weight: bold;
      font-style: italic;
    }

    /* Read Aloud Box */
    .read-aloud-box {
      padding: 0.68rem 0.8rem;
      margin: 0.55rem 0;
      border-left: 4px solid var(--read-aloud-border);
      background: var(--read-aloud-bg);
      page-break-inside: avoid;
      font-size: 0.84rem;
      line-height: 1.4;
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
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-primary);
    }

    /* Sidebar Callout */
    .sidebar-callout {
      padding: 0.8rem;
      margin: 0.65rem 0;
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
      padding: 1.65rem 1.1rem 1rem;
      margin: 0;
    }

    .chapter-header__number {
      font-family: var(--font-heading);
      font-size: 0.8rem;
      text-transform: none;
      font-variant: small-caps;
      letter-spacing: 0.02em;
      color: var(--color-primary);
      white-space: nowrap;
    }

    .chapter-header__title {
      font-size: 1.48rem;
      margin: 0.25rem 0;
    }

    .chapter-header__underline {
      width: 3.25rem;
      height: 3px;
      background: var(--color-divider);
      margin: 0.35rem auto;
    }

    .chapter-header__subtitle {
      font-style: italic;
      color: var(--color-primary);
      margin-top: 0.18rem;
      font-size: 0.92rem;
    }

    /* Spell Card */
    .spell-card {
      background: var(--stat-block-bg);
      border: 2px solid var(--spell-card-accent);
      padding: 0.85rem;
      margin: 0.7rem 0;
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
      padding: 0.85rem;
      margin: 0.7rem 0;
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
      margin: 0.45rem 0;
      page-break-inside: avoid;
    }

    .random-table__header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.18rem;
    }

    .random-table__title {
      font-family: var(--font-heading);
      color: var(--color-heading);
      margin: 0;
      font-size: 0.9rem;
    }

    .random-table__die-badge {
      background: var(--color-primary);
      color: white;
      font-size: 0.62rem;
      padding: 0.08rem 0.34rem;
      border-radius: 3px;
      font-weight: bold;
    }

    /* NPC Profile */
    .npc-profile {
      background: var(--stat-block-bg);
      border: 2px solid var(--color-primary);
      padding: 0.72rem 0.76rem 0.86rem;
      margin: 0.7rem 0;
      page-break-inside: avoid;
    }

    .npc-profile__header {
      display: flex;
      gap: 0.68rem;
      align-items: flex-start;
    }

    .npc-profile__portrait {
      width: 72px;
      height: 72px;
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
      font-size: 1.08rem;
    }

    .npc-profile__subtitle {
      font-style: italic;
      font-size: 0.78rem;
    }

    .npc-profile__divider {
      border: 0;
      border-top: 1px solid var(--color-divider);
      background: none;
      height: 0;
      margin: 0.34rem 0;
    }

    .npc-profile__description {
      font-size: 0.8rem;
      line-height: 1.28;
      margin: 0.34rem 0;
    }

    .npc-profile__trait {
      font-size: 0.8rem;
      line-height: 1.24;
      margin: 0.14rem 0 0.24rem;
    }

    .npc-profile__trait-label {
      font-weight: bold;
      font-style: italic;
    }

    /* Encounter Table */
    .encounter-table {
      margin: 0.55rem 0;
      page-break-inside: avoid;
    }

    .encounter-table__header {
      margin-bottom: 0.34rem;
    }

    .encounter-table__title {
      font-family: var(--font-heading);
      color: var(--color-heading);
      margin: 0;
      font-size: 1rem;
    }

    .encounter-table__cr-range {
      font-size: 0.74rem;
      font-style: italic;
    }

    .encounter-table__details {
      margin-top: 0.38rem;
      display: grid;
      gap: 0.2rem;
    }

    .encounter-table__detail {
      font-size: 0.78rem;
      line-height: 1.24;
    }

    .encounter-table__detail-label {
      font-weight: bold;
      color: var(--color-primary);
      font-style: italic;
    }

    /* Class Feature */
    .class-feature {
      background: var(--stat-block-bg);
      border: 2px solid var(--class-feature-accent);
      padding: 0.85rem;
      margin: 0.7rem 0;
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
      padding: 0.85rem;
      margin: 0.7rem 0;
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

    .layout-fragment.layout-placement-side_panel .full-bleed-image {
      margin: 0.35rem 0 0.6rem;
      text-align: right;
    }

    .layout-fragment.layout-placement-side_panel .full-bleed-image--half {
      width: 68%;
      margin-left: auto;
      margin-right: 0;
    }

    .layout-fragment.layout-placement-side_panel .full-bleed-image--quarter {
      width: 46%;
      margin-left: auto;
      margin-right: 0;
    }

    .layout-fragment.layout-placement-side_panel .full-bleed-image--art-role-column_fill_art,
    .layout-fragment.layout-placement-side_panel .full-bleed-image--art-role-spot_art,
    .layout-fragment.layout-placement-side_panel .full-bleed-image--art-role-overflow_spot_art {
      width: 100%;
      margin-left: 0;
      margin-right: 0;
      text-align: left;
    }

    .layout-fragment.layout-placement-side_panel .full-bleed-image--art-role-column_fill_art .full-bleed-image__img,
    .layout-fragment.layout-placement-side_panel .full-bleed-image--art-role-spot_art .full-bleed-image__img,
    .layout-fragment.layout-placement-side_panel .full-bleed-image--art-role-overflow_spot_art .full-bleed-image__img {
      min-height: 18rem;
      max-height: 24rem;
      object-fit: cover;
      object-position: center;
    }

    .layout-fragment.layout-placement-bottom_panel .full-bleed-image {
      margin: 0.6rem 0 0.2rem;
    }

    .layout-fragment.layout-placement-bottom_panel .full-bleed-image--art-role-sparse_page_repair {
      margin-top: 0.95rem;
      padding-top: 0.45rem;
      border-top: 1px solid var(--color-divider, #8b1a1a);
    }

    .layout-fragment.layout-placement-bottom_panel .full-bleed-image__img {
      min-height: 20rem;
      max-height: 24rem;
      object-fit: cover;
      object-position: center;
    }

    .layout-fragment.layout-placement-bottom_panel .full-bleed-image--art-role-sparse_page_repair .full-bleed-image__img {
      min-height: 38rem;
      max-height: 46rem;
      border: 1px solid rgba(88, 24, 13, 0.2);
      box-shadow: 0 10px 24px rgba(24, 18, 8, 0.12);
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
      padding: 0.6rem 0.55rem 0.55rem;
    }

    .title-page__content {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: calc(var(--content-height) - 72px);
      justify-content: flex-start;
      gap: 0.38rem;
      padding-top: 0.2rem;
    }

    .title-page__cover-image {
      width: 100%;
      display: flex;
      justify-content: center;
    }

    .title-page__cover-image img {
      width: min(100%, 640px);
      max-height: 620px;
      object-fit: contain;
      margin-bottom: 0.32rem;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
    }

    .title-page__title {
      font-size: 2.15rem;
      margin-bottom: 0.18rem;
    }

    .title-page__subtitle {
      font-size: 0.98rem;
      font-style: italic;
      margin-bottom: 0.42rem;
    }

    .title-page__ornament {
      font-size: 1.15rem;
      color: var(--color-primary);
      margin: 0.32rem 0 0.46rem;
    }

    .title-page__author {
      font-size: 1rem;
      font-style: italic;
    }

    /* Table of Contents */
    .table-of-contents {
      padding: 0.95rem 0.8rem;
    }

    .table-of-contents__heading {
      text-align: center;
      margin-bottom: 0.8rem;
      font-size: 1.08rem;
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
      margin: 0.18rem 0;
      font-size: 0.8rem;
      line-height: 1.2;
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
      padding: 1.5rem 1rem;
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
      padding: 2rem 1.5rem;
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
      margin-bottom: 0;
    }

    /* Print styles */
    @media print {
      body {
        background: white;
      }

      @page {
        size: letter;
        margin: ${pageMargin};
      }

      .page-break {
        page-break-after: always;
        break-after: page;
      }

      .column-break {
        break-before: column;
      }

      .layout-page-stack {
        gap: 0 !important;
      }

      .layout-page {
        margin: 0 auto !important;
      }

      .page-canvas {
        box-shadow: none;
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
