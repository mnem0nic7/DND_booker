/**
 * Assembles all project documents into a single HTML page ready for
 * Puppeteer PDF rendering. Includes theme CSS variables, print
 * stylesheet, Google Fonts, and all rendered document content.
 */

import { tiptapToHtml } from './tiptap-to-html.js';

export interface AssembleOptions {
  documents: Array<{ title: string; content: any; sortOrder: number }>;
  theme: string;
  projectTitle: string;
}

/** Map theme name to CSS custom property overrides. */
function getThemeVariables(theme: string): string {
  switch (theme) {
    case 'classic':
      return `
        --color-primary: #58180d;
        --color-secondary: #c0ad8a;
        --color-bg: #fdf1dc;
        --color-text: #1a1a1a;
        --color-accent: #e0cda9;
        --color-heading: #58180d;
        --color-divider: #9c2b1b;
        --font-heading: 'MrEaves', 'Libre Baskerville', serif;
        --font-body: 'Bookinsanity', 'Noto Serif', serif;
      `;

    case 'dark':
      return `
        --color-primary: #bb9f65;
        --color-secondary: #3a3a3a;
        --color-bg: #1e1e1e;
        --color-text: #d4d4d4;
        --color-accent: #2d2d2d;
        --color-heading: #bb9f65;
        --color-divider: #bb9f65;
        --font-heading: 'Libre Baskerville', serif;
        --font-body: 'Noto Serif', serif;
      `;

    case 'modern':
      return `
        --color-primary: #2563eb;
        --color-secondary: #e5e7eb;
        --color-bg: #ffffff;
        --color-text: #1f2937;
        --color-accent: #f3f4f6;
        --color-heading: #1e40af;
        --color-divider: #3b82f6;
        --font-heading: 'Inter', sans-serif;
        --font-body: 'Inter', sans-serif;
      `;

    case 'elven':
      return `
        --color-primary: #2d5016;
        --color-secondary: #d4e0c8;
        --color-bg: #f0f5e8;
        --color-text: #1a2e0a;
        --color-accent: #c8d9b8;
        --color-heading: #2d5016;
        --color-divider: #4a7a28;
        --font-heading: 'Libre Baskerville', serif;
        --font-body: 'Noto Serif', serif;
      `;

    default:
      // Default to classic
      return `
        --color-primary: #58180d;
        --color-secondary: #c0ad8a;
        --color-bg: #fdf1dc;
        --color-text: #1a1a1a;
        --color-accent: #e0cda9;
        --color-heading: #58180d;
        --color-divider: #9c2b1b;
        --font-heading: 'Libre Baskerville', serif;
        --font-body: 'Noto Serif', serif;
      `;
  }
}

/**
 * Assemble a complete HTML document from project documents, theme, and title.
 */
export function assembleHtml(options: AssembleOptions): string {
  const { documents, theme, projectTitle } = options;

  // Sort documents by sortOrder
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);

  // Render each document's TipTap JSON to HTML
  const documentHtmlParts = sorted.map((doc) => {
    const contentHtml = doc.content ? tiptapToHtml(doc.content) : '';
    return `<section class="document" data-title="${escapeAttr(doc.title)}">
      ${contentHtml}
    </section>`;
  });

  const themeVars = getThemeVariables(theme);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(projectTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Noto+Serif:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
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
      background: var(--color-bg);
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
    }

    th, td {
      padding: 0.4rem 0.6rem;
      text-align: left;
      border-bottom: 1px solid var(--color-accent);
    }

    th {
      font-family: var(--font-heading);
      color: var(--color-heading);
      background: var(--color-accent);
    }

    hr {
      border: none;
      border-top: 2px solid var(--color-divider);
      margin: 0.75rem 0;
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
      background: var(--color-bg);
      border: 2px solid var(--color-primary);
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
      border-left: 4px solid var(--color-primary);
      page-break-inside: avoid;
    }

    .read-aloud-box--parchment {
      background: var(--color-accent);
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
      background: var(--color-bg);
      border: 2px solid #4338ca;
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .spell-card__name {
      font-family: var(--font-heading);
      color: #4338ca;
      margin: 0 0 0.1rem;
      font-size: 1.3rem;
    }

    .spell-card__subtitle {
      font-style: italic;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .spell-card__divider {
      border-top-color: #4338ca;
    }

    .spell-card__property {
      font-size: 0.85rem;
      margin: 0.15rem 0;
    }

    .spell-card__property-name {
      font-weight: bold;
      color: #4338ca;
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
      background: var(--color-bg);
      border: 2px solid #16a34a;
      border-top: 4px solid #16a34a;
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
      background: var(--color-bg);
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
      background: var(--color-bg);
      border: 2px solid #991b1b;
      padding: 1rem;
      margin: 1rem 0;
      page-break-inside: avoid;
    }

    .class-feature__name {
      font-family: var(--font-heading);
      color: #991b1b;
      margin: 0;
      font-size: 1.2rem;
    }

    .class-feature__subtitle {
      font-style: italic;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }

    .class-feature__divider {
      border-top-color: #991b1b;
    }

    .class-feature__description {
      font-size: 0.85rem;
    }

    /* Race Block */
    .race-block {
      background: var(--color-bg);
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
