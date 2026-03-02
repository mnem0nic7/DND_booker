/**
 * Assembles all project documents into a single Typst source string
 * ready for compilation into a PDF. Includes theme variables, page
 * setup, typography, heading show rules, and rendered document content.
 */

import { DocumentContent } from '@dnd-booker/shared';
import { tiptapToTypst } from './tiptap-to-typst.js';
import { getTypstThemeVariables } from './typst-themes.js';

export interface AssembleTypstOptions {
  documents: Array<{ title: string; content: DocumentContent | null; sortOrder: number }>;
  theme: string;
  projectTitle: string;
  printReady?: boolean;
}

/**
 * Assemble a complete Typst source document from project documents,
 * theme, and title.
 */
export function assembleTypst(options: AssembleTypstOptions): string {
  const { documents, theme, projectTitle, printReady = false } = options;

  // Sort documents by sortOrder
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);

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
  t += `#show heading.where(level: 1): it => {\n`;
  t += `  set text(font: heading-font, size: 23pt, fill: theme-primary, weight: "bold")\n`;
  t += `  v(12pt)\n`;
  t += `  it.body\n`;
  t += `  v(4pt)\n`;
  t += `}\n\n`;

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
  for (const doc of sorted) {
    if (doc.content == null) continue;
    t += tiptapToTypst(doc.content);
  }

  return t;
}

/** Escape double quotes in a string for use inside Typst string literals. */
function escapeTypstString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
