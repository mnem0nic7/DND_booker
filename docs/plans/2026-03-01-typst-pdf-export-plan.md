# Typst PDF Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Puppeteer with Typst for PDF generation, producing professional two-column D&D publications with parchment backgrounds, running footers, and automatic TOC page numbers.

**Architecture:** New rendering pipeline: TipTap JSON -> `tiptap-to-typst.ts` (shared) -> `typst-assembler.ts` (worker) -> `@myriaddreamin/typst-ts-node-compiler` (NAPI) -> PDF buffer. Puppeteer remains for EPUB only.

**Tech Stack:** `@myriaddreamin/typst-ts-node-compiler` (NAPI native addon, compiles `.typ` strings in-process), Typst markup language, Vitest for tests.

**Design Doc:** `docs/plans/2026-03-01-typst-pdf-export-design.md`

---

## Task 1: Install Typst Compiler and Smoke Test

**Files:**
- Modify: `worker/package.json`
- Create: `worker/src/__tests__/typst-compiler.test.ts`

**Step 1: Install the Typst NAPI compiler**

```bash
cd /workspace/DND_booker && npm install @myriaddreamin/typst-ts-node-compiler --workspace=worker
```

The package auto-selects the correct platform binary (linux-x64-musl for Alpine Docker).

**Step 2: Write a smoke test that compiles Typst to PDF**

Create `worker/src/__tests__/typst-compiler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';

describe('Typst Compiler', () => {
  it('should compile a simple Typst string to PDF bytes', () => {
    const compiler = NodeCompiler.create();
    try {
      const pdf = compiler.pdf({ mainFileContent: '= Hello World\n\nThis is a test.' });
      expect(pdf).toBeInstanceOf(Uint8Array);
      expect(pdf.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      const header = new TextDecoder().decode(pdf.slice(0, 5));
      expect(header).toBe('%PDF-');
    } finally {
      compiler.evictCache(0);
    }
  });

  it('should support two-column layout', () => {
    const compiler = NodeCompiler.create();
    try {
      const source = `
#set page(paper: "us-letter", columns: 2)
= Chapter One
#lorem(200)
#colbreak()
= Chapter Two
#lorem(200)
`;
      const pdf = compiler.pdf({ mainFileContent: source });
      expect(pdf).toBeInstanceOf(Uint8Array);
      expect(pdf.length).toBeGreaterThan(0);
    } finally {
      compiler.evictCache(0);
    }
  });
});
```

**Step 3: Run the smoke test**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-compiler.test.ts
```

Expected: Both tests PASS. If the NAPI binary isn't found, check that `@myriaddreamin/typst-ts-node-compiler-linux-x64-musl` was installed as an optional dep.

**Step 4: Commit**

```bash
git add worker/package.json package-lock.json worker/src/__tests__/typst-compiler.test.ts
git commit -m "feat: install typst NAPI compiler and add smoke tests"
```

---

## Task 2: Typst Escape Utility

**Files:**
- Modify: `shared/src/renderers/utils.ts`
- Modify: `shared/src/renderers/index.ts`
- Create: `worker/src/__tests__/typst-utils.test.ts`

**Context:** Typst markup has special characters that must be escaped in text content: `*` (bold), `_` (italic), `` ` `` (code), `#` (function), `@` (reference), `$` (math), `<` / `>` (label), `[` / `]` (content block), `\` (escape itself).

**Step 1: Write failing tests for `escapeTypst`**

Create `worker/src/__tests__/typst-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { escapeTypst } from '@dnd-booker/shared';

describe('escapeTypst', () => {
  it('should pass through plain text unchanged', () => {
    expect(escapeTypst('Hello World 123')).toBe('Hello World 123');
  });

  it('should escape asterisks (bold marker)', () => {
    expect(escapeTypst('2 * 3 = 6')).toBe('2 \\* 3 = 6');
  });

  it('should escape underscores (italic marker)', () => {
    expect(escapeTypst('my_variable')).toBe('my\\_variable');
  });

  it('should escape hash (function marker)', () => {
    expect(escapeTypst('#todo fix this')).toBe('\\#todo fix this');
  });

  it('should escape backticks (code marker)', () => {
    expect(escapeTypst('use `code` here')).toBe('use \\`code\\` here');
  });

  it('should escape at-sign (reference marker)', () => {
    expect(escapeTypst('email@test.com')).toBe('email\\@test.com');
  });

  it('should escape dollar sign (math marker)', () => {
    expect(escapeTypst('costs $5')).toBe('costs \\$5');
  });

  it('should escape angle brackets (label markers)', () => {
    expect(escapeTypst('a < b > c')).toBe('a \\< b \\> c');
  });

  it('should escape square brackets (content block markers)', () => {
    expect(escapeTypst('array[0]')).toBe('array\\[0\\]');
  });

  it('should escape backslashes', () => {
    expect(escapeTypst('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('should handle multiple special characters together', () => {
    expect(escapeTypst('*bold* and _italic_')).toBe('\\*bold\\* and \\_italic\\_');
  });

  it('should handle empty string', () => {
    expect(escapeTypst('')).toBe('');
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-utils.test.ts
```

Expected: FAIL — `escapeTypst` not exported from `@dnd-booker/shared`.

**Step 3: Implement `escapeTypst` in `shared/src/renderers/utils.ts`**

Add to the bottom of `shared/src/renderers/utils.ts`:

```typescript
/**
 * Escape special Typst markup characters in plain text.
 * Must be applied to all user-generated text before embedding in Typst source.
 */
export function escapeTypst(text: string): string {
  return text.replace(/[\\*_`#@$<>\[\]]/g, (ch) => `\\${ch}`);
}
```

**Step 4: Export from `shared/src/renderers/index.ts`**

Add `escapeTypst` to the utils export:

```typescript
export { escapeHtml, safeUrl, safeCssUrl, escapeTypst } from './utils';
```

**Step 5: Run tests — verify they pass**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-utils.test.ts
```

Expected: All 12 tests PASS.

**Step 6: Commit**

```bash
git add shared/src/renderers/utils.ts shared/src/renderers/index.ts worker/src/__tests__/typst-utils.test.ts
git commit -m "feat: add escapeTypst utility for Typst markup escaping"
```

---

## Task 3: TipTap-to-Typst Renderer — Basic Nodes

**Files:**
- Create: `shared/src/renderers/tiptap-to-typst.ts`
- Modify: `shared/src/renderers/index.ts`
- Create: `worker/src/renderers/tiptap-to-typst.ts` (re-export)
- Create: `worker/src/__tests__/tiptap-to-typst.test.ts`

**Context:** This is the core renderer. It mirrors `tiptap-to-html.ts` but outputs Typst markup. This task covers basic nodes only: text (with marks), paragraph, heading, lists, blockquote, codeBlock, horizontalRule, hardBreak, pageBreak, columnBreak, doc.

**Step 1: Write failing tests for basic node rendering**

Create `worker/src/__tests__/tiptap-to-typst.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Will be created in step 3
import { renderTypstNode, tiptapToTypst } from '../renderers/tiptap-to-typst.js';

describe('tiptap-to-typst — basic nodes', () => {
  describe('text and marks', () => {
    it('should render plain text with escaping', () => {
      expect(renderTypstNode({ type: 'text', text: 'Hello world' })).toBe('Hello world');
    });

    it('should escape special Typst characters', () => {
      expect(renderTypstNode({ type: 'text', text: 'a * b' })).toBe('a \\* b');
    });

    it('should render bold', () => {
      expect(renderTypstNode({
        type: 'text', text: 'bold',
        marks: [{ type: 'bold' }],
      })).toBe('*bold*');
    });

    it('should render italic', () => {
      expect(renderTypstNode({
        type: 'text', text: 'italic',
        marks: [{ type: 'italic' }],
      })).toBe('_italic_');
    });

    it('should render inline code', () => {
      expect(renderTypstNode({
        type: 'text', text: 'code',
        marks: [{ type: 'code' }],
      })).toBe('`code`');
    });

    it('should render strikethrough', () => {
      expect(renderTypstNode({
        type: 'text', text: 'struck',
        marks: [{ type: 'strike' }],
      })).toBe('#strike[struck]');
    });

    it('should render underline', () => {
      expect(renderTypstNode({
        type: 'text', text: 'underlined',
        marks: [{ type: 'underline' }],
      })).toBe('#underline[underlined]');
    });

    it('should render link', () => {
      expect(renderTypstNode({
        type: 'text', text: 'click',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      })).toBe('#link("https://example.com")[click]');
    });

    it('should nest bold + italic', () => {
      expect(renderTypstNode({
        type: 'text', text: 'both',
        marks: [{ type: 'bold' }, { type: 'italic' }],
      })).toBe('_*both*_');
    });
  });

  describe('paragraphs and headings', () => {
    it('should render paragraph with trailing newlines', () => {
      const result = renderTypstNode({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello' }],
      });
      expect(result).toBe('Hello\n\n');
    });

    it('should render empty paragraph as blank line', () => {
      expect(renderTypstNode({ type: 'paragraph' })).toBe('\n');
    });

    it('should render h1', () => {
      const result = renderTypstNode({
        type: 'heading', attrs: { level: 1 },
        content: [{ type: 'text', text: 'Title' }],
      });
      expect(result).toBe('= Title\n');
    });

    it('should render h2', () => {
      const result = renderTypstNode({
        type: 'heading', attrs: { level: 2 },
        content: [{ type: 'text', text: 'Section' }],
      });
      expect(result).toBe('== Section\n');
    });

    it('should render h3', () => {
      const result = renderTypstNode({
        type: 'heading', attrs: { level: 3 },
        content: [{ type: 'text', text: 'Sub' }],
      });
      expect(result).toBe('=== Sub\n');
    });
  });

  describe('lists', () => {
    it('should render bullet list', () => {
      const result = renderTypstNode({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] },
        ],
      });
      expect(result).toContain('- One');
      expect(result).toContain('- Two');
    });

    it('should render ordered list', () => {
      const result = renderTypstNode({
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
        ],
      });
      expect(result).toContain('+ First');
      expect(result).toContain('+ Second');
    });
  });

  describe('misc blocks', () => {
    it('should render blockquote', () => {
      const result = renderTypstNode({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted' }] }],
      });
      expect(result).toContain('#quote[');
      expect(result).toContain('Quoted');
    });

    it('should render horizontal rule', () => {
      expect(renderTypstNode({ type: 'horizontalRule' })).toContain('#line(length: 100%)');
    });

    it('should render hard break', () => {
      expect(renderTypstNode({ type: 'hardBreak' })).toBe('#linebreak()\n');
    });

    it('should render page break', () => {
      expect(renderTypstNode({ type: 'pageBreak' })).toBe('#pagebreak()\n');
    });

    it('should render column break', () => {
      expect(renderTypstNode({ type: 'columnBreak' })).toBe('#colbreak()\n');
    });

    it('should render code block', () => {
      const result = renderTypstNode({
        type: 'codeBlock', attrs: { language: 'python' },
        content: [{ type: 'text', text: 'print("hi")' }],
      });
      expect(result).toContain('```python');
      expect(result).toContain('print("hi")');
      expect(result).toContain('```');
    });
  });

  describe('doc root', () => {
    it('should render doc by rendering children', () => {
      const result = tiptapToTypst({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Body text.' }] },
        ],
      });
      expect(result).toContain('= Title');
      expect(result).toContain('Body text.');
    });
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `shared/src/renderers/tiptap-to-typst.ts`**

Create the file with basic node support:

```typescript
/**
 * Shared TipTap JSON to Typst renderer.
 * Used by the worker for PDF export via the Typst compiler.
 * Converts TipTap document JSON into a Typst markup string.
 */

import type { DocumentContent } from '../types/document';
import { escapeTypst } from './utils';

type TipTapNode = DocumentContent;

interface NameDesc {
  name: string;
  description: string;
}

function getModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function levelLabel(level: number, school: string): string {
  if (level === 0) return `${school} cantrip`;
  const suffix =
    level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix}-level ${school}`;
}

function rarityLabel(rarity: string): string {
  return rarity === 'very_rare' ? 'very rare' : rarity;
}

/** Render inline marks (bold, italic, code, etc.) around text content. */
function renderMarks(text: string, marks?: TipTapNode['marks']): string {
  if (!marks || marks.length === 0) return escapeTypst(text);

  // For code marks, don't escape (backticks protect content)
  const hasCode = marks.some((m) => m.type === 'code');
  let result = hasCode ? text : escapeTypst(text);

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `*${result}*`;
        break;
      case 'italic':
        result = `_${result}_`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'strike':
        result = `#strike[${result}]`;
        break;
      case 'underline':
        result = `#underline[${result}]`;
        break;
      case 'link': {
        const href = String(mark.attrs?.href || '');
        result = `#link("${href}")[${result}]`;
        break;
      }
      default:
        break;
    }
  }

  return result;
}

/** Recursively render an array of TipTap nodes to Typst. */
function renderChildren(nodes?: TipTapNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map((node) => renderTypstNode(node)).join('');
}

/**
 * Extract inline text content from children, suitable for
 * use inside Typst function arguments (no trailing newlines).
 */
function renderInlineChildren(nodes?: TipTapNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') return renderMarks(node.text || '', node.marks);
      if (node.type === 'paragraph') return renderInlineChildren(node.content);
      return renderChildren(node.content);
    })
    .join('');
}

/** Render a single TipTap node to Typst markup. */
export function renderTypstNode(node: TipTapNode): string {
  const attrs = node.attrs || {};

  switch (node.type) {
    // ── Text node ──
    case 'text':
      return renderMarks(node.text || '', node.marks);

    // ── Basic blocks ──
    case 'paragraph': {
      const content = renderChildren(node.content);
      if (!content) return '\n';
      return `${content}\n\n`;
    }

    case 'heading': {
      const level = Math.min(Math.max(Number(attrs.level) || 1, 1), 6);
      const prefix = '='.repeat(level);
      return `${prefix} ${renderInlineChildren(node.content)}\n`;
    }

    case 'bulletList':
      return renderChildren(node.content) + '\n';

    case 'orderedList':
      return renderChildren(node.content) + '\n';

    case 'listItem': {
      // Determine list type from parent context — use '-' for bullet, '+' for ordered
      // Since we don't have parent context, we use the convention:
      // listItem inside bulletList renders '- ', inside orderedList renders '+ '
      // The caller (bulletList/orderedList) handles context.
      // For now, items render their content with a prefix determined by a marker.
      const content = renderInlineChildren(node.content);
      // The marker is set by the parent list render; default to '-'
      const marker = (node as any)._listMarker || '- ';
      return `${marker}${content}\n`;
    }

    case 'blockquote':
      return `#quote[\n${renderChildren(node.content)}]\n\n`;

    case 'codeBlock': {
      const language = String(attrs.language || '');
      // Inside code blocks, text is NOT escaped
      const content = node.content?.map((c) => c.text || '').join('') || '';
      return `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
    }

    case 'horizontalRule':
      return '#line(length: 100%)\n\n';

    case 'hardBreak':
      return '#linebreak()\n';

    case 'pageBreak':
      return '#pagebreak()\n';

    case 'columnBreak':
      return '#colbreak()\n';

    // ── D&D Blocks — implemented in later tasks ──
    case 'statBlock':
      return renderStatBlock(attrs);

    case 'readAloudBox':
      return renderReadAloudBox(attrs, node.content);

    case 'sidebarCallout':
      return renderSidebarCallout(attrs, node.content);

    case 'chapterHeader':
      return renderChapterHeader(attrs);

    case 'spellCard':
      return renderSpellCard(attrs);

    case 'magicItem':
      return renderMagicItem(attrs);

    case 'randomTable':
      return renderRandomTable(attrs);

    case 'npcProfile':
      return renderNpcProfile(attrs);

    case 'encounterTable':
      return renderEncounterTable(attrs);

    case 'classFeature':
      return renderClassFeature(attrs);

    case 'raceBlock':
      return renderRaceBlock(attrs);

    // ── Layout blocks ──
    case 'fullBleedImage':
      return renderFullBleedImage(attrs);

    case 'mapBlock':
      return renderMapBlock(attrs);

    case 'handout':
      return renderHandout(attrs);

    case 'pageBorder':
      return renderPageBorder(attrs);

    // ── Structure blocks ──
    case 'titlePage':
      return renderTitlePage(attrs);

    case 'tableOfContents':
      return renderTableOfContents(attrs);

    case 'creditsPage':
      return renderCreditsPage(attrs);

    case 'backCover':
      return renderBackCover(attrs);

    // ── Document root ──
    case 'doc':
      return renderChildren(node.content);

    default:
      return renderChildren(node.content);
  }
}

// ── D&D Block Renderers ──
// Each renders a self-contained Typst block using #block(), #table(), #text() etc.
// Theme variables (theme-primary, theme-stat-block-bg, etc.) are defined by the assembler.

function renderStatBlock(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const size = escapeTypst(String(attrs.size || ''));
  const type = escapeTypst(String(attrs.type || ''));
  const alignment = escapeTypst(String(attrs.alignment || ''));
  const ac = Number(attrs.ac) || 0;
  const acType = String(attrs.acType || '');
  const hp = Number(attrs.hp) || 0;
  const hitDice = String(attrs.hitDice || '');
  const speed = escapeTypst(String(attrs.speed || ''));

  const abilityNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const abilityLabels = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  let typ = `#block(
  fill: theme-stat-block-bg,
  stroke: (paint: theme-stat-block-border, thickness: 2pt),
  inset: 1em,
  width: 100%,
  breakable: false,
)[\n`;

  // Name and subtitle
  typ += `  #text(font: heading-font, fill: theme-primary, size: 1.3em, weight: "bold")[${name}]\n`;
  typ += `  #text(style: "italic", size: 0.85em)[${size} ${type}, ${alignment}]\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;

  // Core stats
  typ += `  *Armor Class* ${ac}${acType ? ` (${escapeTypst(acType)})` : ''}\n`;
  typ += `  *Hit Points* ${hp}${hitDice ? ` (${escapeTypst(hitDice)})` : ''}\n`;
  typ += `  *Speed* ${speed}\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;

  // Ability scores table
  typ += `  #table(\n`;
  typ += `    columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr),\n`;
  typ += `    align: center,\n`;
  typ += `    stroke: none,\n`;
  for (let i = 0; i < abilityNames.length; i++) {
    const score = Number(attrs[abilityNames[i]]) || 10;
    typ += `    [*${abilityLabels[i]}*\\ ${score} (${getModifier(score)})],\n`;
  }
  typ += `  )\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;

  // Optional properties
  const optionalProps: Array<[string, string]> = [
    ['savingThrows', 'Saving Throws'],
    ['skills', 'Skills'],
    ['damageResistances', 'Damage Resistances'],
    ['damageImmunities', 'Damage Immunities'],
    ['conditionImmunities', 'Condition Immunities'],
    ['senses', 'Senses'],
    ['languages', 'Languages'],
  ];
  for (const [key, label] of optionalProps) {
    const value = String(attrs[key] || '');
    if (value) {
      typ += `  *${label}* ${escapeTypst(value)}\n`;
    }
  }

  // Challenge rating
  const cr = String(attrs.cr || '');
  const xp = String(attrs.xp || '');
  if (cr || xp) {
    typ += `  *Challenge* ${escapeTypst(cr)}${xp ? ` (${escapeTypst(xp)} XP)` : ''}\n`;
  }

  // Traits
  const traits = parseJsonArray<NameDesc>(String(attrs.traits || '[]'));
  if (traits.length > 0) {
    typ += `  #line(length: 100%, stroke: theme-divider)\n`;
    for (const trait of traits) {
      typ += `  _*${escapeTypst(trait.name)}.*_ ${escapeTypst(trait.description)}\n\n`;
    }
  }

  // Actions
  const actions = parseJsonArray<NameDesc>(String(attrs.actions || '[]'));
  if (actions.length > 0) {
    typ += `  #text(font: heading-font, fill: theme-primary, size: 1em)[Actions]\n`;
    typ += `  #line(length: 100%, stroke: theme-divider)\n`;
    for (const action of actions) {
      typ += `  _*${escapeTypst(action.name)}.*_ ${escapeTypst(action.description)}\n\n`;
    }
  }

  // Reactions
  const reactions = parseJsonArray<NameDesc>(String(attrs.reactions || '[]'));
  if (reactions.length > 0) {
    typ += `  #text(font: heading-font, fill: theme-primary, size: 1em)[Reactions]\n`;
    typ += `  #line(length: 100%, stroke: theme-divider)\n`;
    for (const reaction of reactions) {
      typ += `  _*${escapeTypst(reaction.name)}.*_ ${escapeTypst(reaction.description)}\n\n`;
    }
  }

  // Legendary Actions
  const legendaryActions = parseJsonArray<NameDesc>(String(attrs.legendaryActions || '[]'));
  if (legendaryActions.length > 0) {
    typ += `  #text(font: heading-font, fill: theme-primary, size: 1em)[Legendary Actions]\n`;
    typ += `  #line(length: 100%, stroke: theme-divider)\n`;
    const legendaryDescription = String(attrs.legendaryDescription || '');
    if (legendaryDescription) {
      typ += `  ${escapeTypst(legendaryDescription)}\n\n`;
    }
    for (const la of legendaryActions) {
      typ += `  _*${escapeTypst(la.name)}.*_ ${escapeTypst(la.description)}\n\n`;
    }
  }

  typ += `]\n\n`;
  return typ;
}

function renderReadAloudBox(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  return `#block(
  fill: theme-read-aloud-bg,
  stroke: (left: (paint: theme-read-aloud-border, thickness: 4pt)),
  inset: 1em,
  width: 100%,
)[
  #text(weight: "bold", size: 0.8em)[Read Aloud]
  ${renderChildren(content)}
]\n\n`;
}

function renderSidebarCallout(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  const title = escapeTypst(String(attrs.title || 'Note'));
  return `#block(
  fill: theme-sidebar-bg,
  inset: 1em,
  width: 100%,
)[
  #text(font: heading-font, fill: theme-primary, weight: "bold")[${title}]

  ${renderChildren(content)}
]\n\n`;
}

function renderChapterHeader(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const subtitle = String(attrs.subtitle || '');
  const chapterNumber = String(attrs.chapterNumber || '');

  let typ = '';
  if (chapterNumber) {
    typ += `#text(font: heading-font, fill: theme-primary, size: 0.9em)[Chapter ${escapeTypst(chapterNumber)}]\n\n`;
  }
  typ += `= ${title}\n`;
  typ += `#line(length: 100%, stroke: (paint: theme-divider, thickness: 2pt))\n`;
  if (subtitle) {
    typ += `#text(style: "italic")[${escapeTypst(subtitle)}]\n\n`;
  }
  return typ;
}

function renderSpellCard(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const level = Number(attrs.level) || 0;
  const school = String(attrs.school || 'evocation');
  const castingTime = escapeTypst(String(attrs.castingTime || ''));
  const range = escapeTypst(String(attrs.range || ''));
  const components = escapeTypst(String(attrs.components || ''));
  const duration = escapeTypst(String(attrs.duration || ''));
  const description = escapeTypst(String(attrs.description || ''));
  const higherLevels = String(attrs.higherLevels || '');

  let typ = `#block(
  fill: theme-stat-block-bg,
  stroke: (paint: theme-spell-card-accent, thickness: 2pt),
  inset: 1em,
  width: 100%,
  breakable: false,
)[\n`;
  typ += `  #text(font: heading-font, fill: theme-primary, size: 1.2em, weight: "bold")[${name}]\n`;
  typ += `  #text(style: "italic", size: 0.85em)[${escapeTypst(levelLabel(level, school))}]\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;
  typ += `  *Casting Time* ${castingTime}\n`;
  typ += `  *Range* ${range}\n`;
  typ += `  *Components* ${components}\n`;
  typ += `  *Duration* ${duration}\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;
  typ += `  ${description}\n`;
  if (higherLevels) {
    typ += `\n  _*At Higher Levels.*_ ${escapeTypst(higherLevels)}\n`;
  }
  typ += `]\n\n`;
  return typ;
}

function renderMagicItem(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const type = String(attrs.type || 'wondrous');
  const rarity = String(attrs.rarity || 'uncommon');
  const requiresAttunement = Boolean(attrs.requiresAttunement);
  const attunementRequirement = String(attrs.attunementRequirement || '');
  const description = escapeTypst(String(attrs.description || ''));

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const rarityText = rarityLabel(rarity);
  let subtitle = `${typeLabel}, ${rarityText}`;
  if (requiresAttunement) {
    subtitle += attunementRequirement
      ? ` (requires attunement ${attunementRequirement})`
      : ' (requires attunement)';
  }

  let typ = `#block(
  fill: theme-stat-block-bg,
  stroke: (paint: theme-magic-item-accent, thickness: 2pt),
  inset: 1em,
  width: 100%,
  breakable: false,
)[\n`;
  typ += `  #text(font: heading-font, fill: theme-primary, size: 1.2em, weight: "bold")[${name}]\n`;
  typ += `  #text(style: "italic", size: 0.85em)[${escapeTypst(subtitle)}]\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;
  typ += `  ${description}\n`;
  typ += `]\n\n`;
  return typ;
}

function renderRandomTable(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const dieType = escapeTypst(String(attrs.dieType || 'd6'));
  const entries = parseJsonArray<{ roll: string; result: string }>(String(attrs.entries || '[]'));

  let typ = `#text(font: heading-font, fill: theme-primary, size: 1.1em, weight: "bold")[${title}] #text(size: 0.85em)[(${dieType})]\n\n`;
  typ += `#table(\n`;
  typ += `  columns: (auto, 1fr),\n`;
  typ += `  fill: (x, y) => if y == 0 { theme-table-header-bg } else if calc.odd(y) { theme-table-stripe-bg } else { none },\n`;
  typ += `  [*${dieType}*], [*Result*],\n`;
  for (const entry of entries) {
    typ += `  [${escapeTypst(entry.roll)}], [${escapeTypst(entry.result)}],\n`;
  }
  typ += `)\n\n`;
  return typ;
}

function renderNpcProfile(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const race = escapeTypst(String(attrs.race || ''));
  const npcClass = escapeTypst(String(attrs.class || ''));
  const description = String(attrs.description || '');
  const personalityTraits = String(attrs.personalityTraits || '');
  const ideals = String(attrs.ideals || '');
  const bonds = String(attrs.bonds || '');
  const flaws = String(attrs.flaws || '');
  const portraitUrl = String(attrs.portraitUrl || '');

  let typ = `#block(
  fill: theme-stat-block-bg,
  stroke: (paint: theme-stat-block-border, thickness: 2pt),
  inset: 1em,
  width: 100%,
  breakable: false,
)[\n`;

  // Header with optional portrait
  if (portraitUrl) {
    typ += `  #grid(columns: (60pt, 1fr), gutter: 1em,\n`;
    typ += `    image("${portraitUrl}", width: 60pt),\n`;
    typ += `    [\n`;
    typ += `      #text(font: heading-font, fill: theme-primary, size: 1.2em, weight: "bold")[${name}]\n`;
    typ += `      #text(style: "italic", size: 0.85em)[${race} ${npcClass}]\n`;
    typ += `    ],\n`;
    typ += `  )\n`;
  } else {
    typ += `  #text(font: heading-font, fill: theme-primary, size: 1.2em, weight: "bold")[${name}]\n`;
    typ += `  #text(style: "italic", size: 0.85em)[${race} ${npcClass}]\n`;
  }

  typ += `  #line(length: 100%, stroke: theme-divider)\n`;

  if (description) {
    typ += `  ${escapeTypst(description)}\n\n`;
  }

  if (personalityTraits) {
    typ += `  _*Personality Traits.*_ ${escapeTypst(personalityTraits)}\n\n`;
  }
  if (ideals) {
    typ += `  _*Ideals.*_ ${escapeTypst(ideals)}\n\n`;
  }
  if (bonds) {
    typ += `  _*Bonds.*_ ${escapeTypst(bonds)}\n\n`;
  }
  if (flaws) {
    typ += `  _*Flaws.*_ ${escapeTypst(flaws)}\n\n`;
  }

  typ += `]\n\n`;
  return typ;
}

function renderEncounterTable(attrs: Record<string, unknown>): string {
  const environment = escapeTypst(String(attrs.environment || ''));
  const crRange = escapeTypst(String(attrs.crRange || ''));
  const entries = parseJsonArray<{ weight: number; description: string; cr: string }>(String(attrs.entries || '[]'));

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);

  let typ = `#text(font: heading-font, fill: theme-primary, size: 1.1em, weight: "bold")[${environment} Encounters] #text(size: 0.85em)[CR Range: ${crRange}]\n\n`;
  typ += `#table(\n`;
  typ += `  columns: (auto, 1fr, auto),\n`;
  typ += `  fill: (x, y) => if y == 0 { theme-table-header-bg } else if calc.odd(y) { theme-table-stripe-bg } else { none },\n`;
  typ += `  [*d${totalWeight}*], [*Encounter*], [*CR*],\n`;

  let running = 0;
  for (const entry of entries) {
    const from = running + 1;
    running += entry.weight;
    const to = running;
    const rangeStr = from === to ? `${from}` : `${from}\u2013${to}`;
    typ += `  [${rangeStr}], [${escapeTypst(entry.description)}], [${escapeTypst(entry.cr)}],\n`;
  }
  typ += `)\n\n`;
  return typ;
}

function renderClassFeature(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const level = Number(attrs.level) || 1;
  const className = escapeTypst(String(attrs.className || ''));
  const description = escapeTypst(String(attrs.description || ''));

  let typ = `#block(
  fill: theme-stat-block-bg,
  stroke: (paint: theme-class-feature-accent, thickness: 2pt),
  inset: 1em,
  width: 100%,
  breakable: false,
)[\n`;
  typ += `  #text(font: heading-font, fill: theme-primary, size: 1.2em, weight: "bold")[${name}]\n`;
  typ += `  #text(style: "italic", size: 0.85em)[Level ${level} ${className} Feature]\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;
  typ += `  ${description}\n`;
  typ += `]\n\n`;
  return typ;
}

function renderRaceBlock(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const abilityScoreIncreases = escapeTypst(String(attrs.abilityScoreIncreases || ''));
  const size = escapeTypst(String(attrs.size || ''));
  const speed = escapeTypst(String(attrs.speed || ''));
  const languages = escapeTypst(String(attrs.languages || ''));
  const features = parseJsonArray<NameDesc>(String(attrs.features || '[]'));

  let typ = `#block(
  fill: theme-stat-block-bg,
  stroke: (paint: theme-stat-block-border, thickness: 2pt),
  inset: 1em,
  width: 100%,
  breakable: false,
)[\n`;
  typ += `  #text(font: heading-font, fill: theme-primary, size: 1.2em, weight: "bold")[${name}]\n`;
  typ += `  #line(length: 100%, stroke: theme-divider)\n`;
  typ += `  _*Ability Score Increase.*_ ${abilityScoreIncreases}\n\n`;
  typ += `  _*Size.*_ ${size}\n\n`;
  typ += `  _*Speed.*_ ${speed}\n\n`;
  typ += `  _*Languages.*_ ${languages}\n\n`;

  if (features.length > 0) {
    typ += `  #line(length: 100%, stroke: theme-divider)\n`;
    typ += `  #text(font: heading-font, fill: theme-primary, size: 1em)[Racial Features]\n`;
    for (const feature of features) {
      typ += `  _*${escapeTypst(feature.name)}.*_ ${escapeTypst(feature.description)}\n\n`;
    }
  }

  typ += `]\n\n`;
  return typ;
}

// ── Layout Block Renderers ──

function renderFullBleedImage(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  const caption = String(attrs.caption || '');
  if (!src) return '\n';

  let typ = `#figure(\n  image("${src}", width: 100%),\n`;
  if (caption) {
    typ += `  caption: [${escapeTypst(caption)}],\n`;
  }
  typ += `)\n\n`;
  return typ;
}

function renderMapBlock(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  const scale = String(attrs.scale || '');
  const keyEntries = parseJsonArray<{ label: string; description: string }>(String(attrs.keyEntries || '[]'));

  let typ = '';
  if (src) {
    typ += `#figure(image("${src}", width: 100%))\n\n`;
  }
  if (scale) {
    typ += `*Scale:* ${escapeTypst(scale)}\n\n`;
  }
  if (keyEntries.length > 0) {
    typ += `*Map Key*\n\n`;
    for (const entry of keyEntries) {
      typ += `*${escapeTypst(entry.label)}.* ${escapeTypst(entry.description)}\n\n`;
    }
  }
  return typ;
}

function renderHandout(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const style = String(attrs.style || 'letter');
  const content = escapeTypst(String(attrs.content || ''));

  const fill = style === 'letter' ? 'rgb("#FAF3E0")' : style === 'scroll' ? 'rgb("#F5E6C8")' : 'rgb("#FAF3E0")';

  return `#block(
  fill: ${fill},
  stroke: (paint: theme-divider, thickness: 1pt),
  inset: 1.5em,
  width: 100%,
)[
  #text(font: heading-font, fill: theme-primary, weight: "bold")[${title}]

  ${content}
]\n\n`;
}

function renderPageBorder(attrs: Record<string, unknown>): string {
  // Page borders in Typst are decorative — render as a styled separator
  const borderStyle = String(attrs.borderStyle || 'simple');
  return `#line(length: 100%, stroke: (paint: theme-divider, thickness: 2pt, dash: "dashed"))\n\n`;
}

// ── Structure Block Renderers ──

function renderTitlePage(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const subtitle = String(attrs.subtitle || '');
  const author = String(attrs.author || '');
  const coverImageUrl = String(attrs.coverImageUrl || '');

  // Title page: single column, centered, full page
  let typ = '#set page(columns: 1)\n';
  typ += '#align(center + horizon)[\n';

  if (coverImageUrl) {
    typ += `  #image("${coverImageUrl}", width: 80%)\n`;
    typ += `  #v(2em)\n`;
  }

  typ += `  #text(font: heading-font, fill: theme-primary, size: 2.5em, weight: "bold")[${title}]\n`;
  if (subtitle) {
    typ += `  #v(0.5em)\n`;
    typ += `  #text(style: "italic", size: 1.2em)[${escapeTypst(subtitle)}]\n`;
  }
  typ += `  #v(1em)\n`;
  typ += `  #text(fill: theme-primary, size: 1.5em)[\\u{2726}]\n`;
  if (author) {
    typ += `  #v(0.5em)\n`;
    typ += `  #text(style: "italic")[by ${escapeTypst(author)}]\n`;
  }

  typ += ']\n';
  typ += '#pagebreak()\n';
  typ += '#set page(columns: 2)\n\n';
  return typ;
}

function renderTableOfContents(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || 'Table of Contents'));

  // Typst's #outline() auto-generates the TOC with real page numbers!
  let typ = '#set page(columns: 1)\n';
  typ += `#align(center)[#text(font: heading-font, fill: theme-primary, size: 1.5em, weight: "bold")[${title}]]\n`;
  typ += '#v(1em)\n';
  typ += '#outline(title: none, depth: 3)\n';
  typ += '#pagebreak()\n';
  typ += '#set page(columns: 2)\n\n';
  return typ;
}

function renderCreditsPage(attrs: Record<string, unknown>): string {
  const credits = String(attrs.credits || '');
  const legalText = String(attrs.legalText || '');
  const copyrightYear = String(attrs.copyrightYear || '');

  let typ = '#set page(columns: 1)\n';
  typ += '#align(center)[#text(font: heading-font, fill: theme-primary, size: 1.5em, weight: "bold")[Credits]]\n';
  typ += '#v(1em)\n';

  const lines = credits.split('\n');
  for (const line of lines) {
    typ += `#align(center)[${escapeTypst(line)}]\n`;
  }

  typ += '#v(2em)\n';
  typ += '#line(length: 100%, stroke: theme-divider)\n';
  typ += '#v(1em)\n';
  typ += '#text(weight: "bold", size: 0.9em)[Legal]\n\n';
  typ += `#text(size: 0.75em)[${escapeTypst(legalText)}]\n\n`;
  typ += `#align(center)[#text(size: 0.8em, fill: rgb("#888"))[(C) ${escapeTypst(copyrightYear)} All rights reserved.]]\n`;
  typ += '#pagebreak()\n';
  typ += '#set page(columns: 2)\n\n';
  return typ;
}

function renderBackCover(attrs: Record<string, unknown>): string {
  const blurb = escapeTypst(String(attrs.blurb || ''));
  const authorBio = escapeTypst(String(attrs.authorBio || ''));
  const authorImageUrl = String(attrs.authorImageUrl || '');

  let typ = '#set page(columns: 1)\n';
  typ += '#align(center + horizon)[\n';
  typ += `  #text(style: "italic")[${blurb}]\n`;
  typ += `  #v(2em)\n`;
  typ += `  #text(fill: theme-primary, size: 1.2em)[\\u{2726} \\u{2726} \\u{2726}]\n`;
  typ += `  #v(2em)\n`;

  if (authorImageUrl) {
    typ += `  #grid(columns: (60pt, 1fr), gutter: 1em,\n`;
    typ += `    image("${authorImageUrl}", width: 60pt),\n`;
    typ += `    align(left)[#text(size: 0.85em)[${authorBio}]],\n`;
    typ += `  )\n`;
  } else {
    typ += `  #text(size: 0.85em)[${authorBio}]\n`;
  }

  typ += ']\n\n';
  return typ;
}

/**
 * Convert a complete TipTap document JSON to Typst markup.
 */
export function tiptapToTypst(doc: TipTapNode): string {
  return renderTypstNode(doc);
}
```

**Step 4: Add exports**

Add to `shared/src/renderers/index.ts`:

```typescript
export { tiptapToTypst, renderTypstNode } from './tiptap-to-typst';
```

Create `worker/src/renderers/tiptap-to-typst.ts`:

```typescript
/**
 * Re-export the shared TipTap JSON to Typst renderer.
 * The canonical implementation lives in @dnd-booker/shared.
 */
export { tiptapToTypst, renderTypstNode } from '@dnd-booker/shared';
```

**Step 5: Fix list item rendering**

The `listItem` node needs parent context to know its marker. Override `bulletList` and `orderedList` to inject markers:

In the `bulletList` case of the switch statement, replace with:

```typescript
case 'bulletList': {
  if (!node.content) return '\n';
  return node.content.map((item) => {
    const content = renderInlineChildren(item.content);
    return `- ${content}\n`;
  }).join('') + '\n';
}

case 'orderedList': {
  if (!node.content) return '\n';
  return node.content.map((item) => {
    const content = renderInlineChildren(item.content);
    return `+ ${content}\n`;
  }).join('') + '\n';
}
```

And change the `listItem` case to just render children (fallback if encountered outside a list):

```typescript
case 'listItem':
  return renderInlineChildren(node.content) + '\n';
```

**Step 6: Run all tests**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts
```

Expected: All tests PASS.

**Step 7: Commit**

```bash
git add shared/src/renderers/tiptap-to-typst.ts shared/src/renderers/index.ts worker/src/renderers/tiptap-to-typst.ts worker/src/__tests__/tiptap-to-typst.test.ts
git commit -m "feat: add TipTap-to-Typst renderer with all 22+ node types"
```

---

## Task 4: Typst Theme Definitions

**Files:**
- Create: `worker/src/renderers/typst-themes.ts`
- Create: `worker/src/__tests__/typst-themes.test.ts`

**Context:** Each theme is a block of `#let` variable declarations in Typst. Theme variables use Typst's `rgb()` function for colors and string literals for font names. These get prepended to every Typst document.

**Step 1: Write failing tests**

Create `worker/src/__tests__/typst-themes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getTypstThemeVariables } from '../renderers/typst-themes.js';

describe('Typst Themes', () => {
  it('should return Typst let declarations for classic-parchment', () => {
    const vars = getTypstThemeVariables('classic-parchment');
    expect(vars).toContain('#let theme-primary = rgb("#58180d")');
    expect(vars).toContain('#let heading-font = "Cinzel"');
    expect(vars).toContain('#let body-font = "Crimson Text"');
    expect(vars).toContain('#let theme-stat-block-bg = rgb("#fdf1dc")');
  });

  it('should return Typst let declarations for dmguild', () => {
    const vars = getTypstThemeVariables('dmguild');
    expect(vars).toContain('#let theme-primary = rgb("#58180D")');
    expect(vars).toContain('#let heading-font = "Cinzel Decorative"');
    expect(vars).toContain('#let body-font = "Libre Baskerville"');
  });

  it('should return Typst let declarations for dark-tome', () => {
    const vars = getTypstThemeVariables('dark-tome');
    expect(vars).toContain('#let theme-primary = rgb("#c9a84c")');
    expect(vars).toContain('#let heading-font = "Uncial Antiqua"');
  });

  it('should fall back to classic-parchment for unknown theme', () => {
    const vars = getTypstThemeVariables('nonexistent');
    expect(vars).toContain('#let theme-primary = rgb("#58180d")');
  });

  it('should include all required theme variables', () => {
    const vars = getTypstThemeVariables('classic-parchment');
    const requiredVars = [
      'theme-bg', 'theme-text', 'theme-primary', 'theme-secondary',
      'theme-stat-block-bg', 'theme-stat-block-border',
      'theme-read-aloud-bg', 'theme-read-aloud-border',
      'theme-sidebar-bg', 'theme-table-header-bg', 'theme-table-stripe-bg',
      'theme-divider', 'theme-spell-card-accent', 'theme-magic-item-accent',
      'theme-class-feature-accent', 'heading-font', 'body-font',
      'theme-texture',
    ];
    for (const v of requiredVars) {
      expect(vars).toContain(`#let ${v}`);
    }
  });

  it('should return the texture filename', () => {
    const vars = getTypstThemeVariables('classic-parchment');
    expect(vars).toContain('#let theme-texture = "parchment-classic.jpg"');
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-themes.test.ts
```

**Step 3: Implement `worker/src/renderers/typst-themes.ts`**

```typescript
/**
 * Typst theme variable definitions.
 * Returns Typst `#let` declarations for all theme colors, fonts, and texture.
 * Variable names match those used by tiptap-to-typst.ts block renderers.
 */

interface TypstTheme {
  bg: string;
  text: string;
  primary: string;
  secondary: string;
  statBlockBg: string;
  statBlockBorder: string;
  readAloudBg: string;
  readAloudBorder: string;
  sidebarBg: string;
  tableHeaderBg: string;
  tableStripeBg: string;
  divider: string;
  spellCardAccent: string;
  magicItemAccent: string;
  classFeatureAccent: string;
  headingFont: string;
  bodyFont: string;
  texture: string;
}

const themes: Record<string, TypstTheme> = {
  'classic-parchment': {
    bg: '#f4e4c1',
    text: '#1a1a1a',
    primary: '#58180d',
    secondary: '#c9ad6a',
    statBlockBg: '#fdf1dc',
    statBlockBorder: '#e69a28',
    readAloudBg: '#e8dcc8',
    readAloudBorder: '#5c3a1e',
    sidebarBg: '#e8edf3',
    tableHeaderBg: '#78350f',
    tableStripeBg: '#fef3c7',
    divider: '#8b1a1a',
    spellCardAccent: '#7c3aed',
    magicItemAccent: '#16a34a',
    classFeatureAccent: '#991b1b',
    headingFont: 'Cinzel',
    bodyFont: 'Crimson Text',
    texture: 'parchment-classic.jpg',
  },
  'dark-tome': {
    bg: '#1a1a2e',
    text: '#e0d6c2',
    primary: '#c9a84c',
    secondary: '#7b68ae',
    statBlockBg: '#252545',
    statBlockBorder: '#c9a84c',
    readAloudBg: '#2a2a3e',
    readAloudBorder: '#c9a84c',
    sidebarBg: '#252540',
    tableHeaderBg: '#3d2e6b',
    tableStripeBg: '#22223a',
    divider: '#7b68ae',
    spellCardAccent: '#7b68ae',
    magicItemAccent: '#c9a84c',
    classFeatureAccent: '#c9a84c',
    headingFont: 'Uncial Antiqua',
    bodyFont: 'EB Garamond',
    texture: 'parchment-dark.jpg',
  },
  'clean-modern': {
    bg: '#ffffff',
    text: '#1f2937',
    primary: '#2563eb',
    secondary: '#64748b',
    statBlockBg: '#f1f5f9',
    statBlockBorder: '#2563eb',
    readAloudBg: '#f8fafc',
    readAloudBorder: '#2563eb',
    sidebarBg: '#f1f5f9',
    tableHeaderBg: '#1e40af',
    tableStripeBg: '#f1f5f9',
    divider: '#2563eb',
    spellCardAccent: '#7c3aed',
    magicItemAccent: '#16a34a',
    classFeatureAccent: '#dc2626',
    headingFont: 'Inter',
    bodyFont: 'Merriweather',
    texture: '',
  },
  'fey-wild': {
    bg: '#f0f7ee',
    text: '#1a2e1a',
    primary: '#166534',
    secondary: '#ca8a04',
    statBlockBg: '#e8f5e2',
    statBlockBorder: '#22c55e',
    readAloudBg: '#ecfdf5',
    readAloudBorder: '#166534',
    sidebarBg: '#fefce8',
    tableHeaderBg: '#166534',
    tableStripeBg: '#f0fdf4',
    divider: '#22c55e',
    spellCardAccent: '#7c3aed',
    magicItemAccent: '#22c55e',
    classFeatureAccent: '#ca8a04',
    headingFont: 'Dancing Script',
    bodyFont: 'Lora',
    texture: 'parchment-fey.jpg',
  },
  'infernal': {
    bg: '#1c1517',
    text: '#e8d5c4',
    primary: '#dc2626',
    secondary: '#ea580c',
    statBlockBg: '#2a1f1f',
    statBlockBorder: '#dc2626',
    readAloudBg: '#2e1c1c',
    readAloudBorder: '#dc2626',
    sidebarBg: '#2a1a1a',
    tableHeaderBg: '#7f1d1d',
    tableStripeBg: '#231515',
    divider: '#ea580c',
    spellCardAccent: '#ea580c',
    magicItemAccent: '#ea580c',
    classFeatureAccent: '#dc2626',
    headingFont: 'Pirata One',
    bodyFont: 'Bitter',
    texture: 'parchment-infernal.jpg',
  },
  'dmguild': {
    bg: '#EEE5CE',
    text: '#1a1a1a',
    primary: '#58180D',
    secondary: '#C9AD6A',
    statBlockBg: '#FDF1DC',
    statBlockBorder: '#E69A28',
    readAloudBg: '#FAF7EA',
    readAloudBorder: '#58180D',
    sidebarBg: '#E0E5C1',
    tableHeaderBg: '#58180D',
    tableStripeBg: '#FDF1DC',
    divider: '#9C2B1B',
    spellCardAccent: '#58180D',
    magicItemAccent: '#58180D',
    classFeatureAccent: '#58180D',
    headingFont: 'Cinzel Decorative',
    bodyFont: 'Libre Baskerville',
    texture: 'parchment-dmguild.jpg',
  },
};

/**
 * Return Typst `#let` variable declarations for the given theme.
 * Falls back to classic-parchment for unknown theme names.
 */
export function getTypstThemeVariables(theme: string): string {
  const t = themes[theme] || themes['classic-parchment'];
  return `// Theme: ${theme}
#let theme-bg = rgb("${t.bg}")
#let theme-text = rgb("${t.text}")
#let theme-primary = rgb("${t.primary}")
#let theme-secondary = rgb("${t.secondary}")
#let theme-stat-block-bg = rgb("${t.statBlockBg}")
#let theme-stat-block-border = rgb("${t.statBlockBorder}")
#let theme-read-aloud-bg = rgb("${t.readAloudBg}")
#let theme-read-aloud-border = rgb("${t.readAloudBorder}")
#let theme-sidebar-bg = rgb("${t.sidebarBg}")
#let theme-table-header-bg = rgb("${t.tableHeaderBg}")
#let theme-table-stripe-bg = rgb("${t.tableStripeBg}")
#let theme-divider = rgb("${t.divider}")
#let theme-spell-card-accent = rgb("${t.spellCardAccent}")
#let theme-magic-item-accent = rgb("${t.magicItemAccent}")
#let theme-class-feature-accent = rgb("${t.classFeatureAccent}")
#let heading-font = "${t.headingFont}"
#let body-font = "${t.bodyFont}"
#let theme-texture = "${t.texture}"
`;
}
```

**Step 4: Run tests — verify they pass**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-themes.test.ts
```

**Step 5: Commit**

```bash
git add worker/src/renderers/typst-themes.ts worker/src/__tests__/typst-themes.test.ts
git commit -m "feat: add Typst theme definitions for all 6 themes"
```

---

## Task 5: Typst Assembler

**Files:**
- Create: `worker/src/renderers/typst-assembler.ts`
- Create: `worker/src/__tests__/typst-assembler.test.ts`

**Context:** The assembler combines theme variables + page setup + rendered content into a complete `.typ` source string. This is the Typst equivalent of `html-assembler.ts`. It sets up two-column layout, parchment background, running footer, justified typography, and heading show rules.

**Step 1: Write failing tests**

Create `worker/src/__tests__/typst-assembler.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleTypst } from '../renderers/typst-assembler.js';

describe('Typst Assembler', () => {
  it('should produce a complete Typst document with theme variables', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'classic-parchment',
      projectTitle: 'My Campaign',
    });

    expect(source).toContain('#let theme-primary = rgb("#58180d")');
    expect(source).toContain('#set page(');
    expect(source).toContain('paper: "us-letter"');
    expect(source).toContain('columns: 2');
  });

  it('should set up justified text and paragraph indentation', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'classic-parchment',
      projectTitle: 'Test',
    });

    expect(source).toContain('#set par(justify: true');
    expect(source).toContain('first-line-indent:');
  });

  it('should include running footer with project title', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'classic-parchment',
      projectTitle: 'Champions of Darkness',
    });

    expect(source).toContain('footer:');
    expect(source).toContain('counter(page)');
  });

  it('should include parchment background for themes with texture', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'classic-parchment',
      projectTitle: 'Test',
    });

    expect(source).toContain('background:');
    expect(source).toContain('parchment-classic.jpg');
  });

  it('should not include background for clean-modern (no texture)', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'clean-modern',
      projectTitle: 'Test',
    });

    // clean-modern has empty texture string
    expect(source).not.toContain('background:');
  });

  it('should render documents in sortOrder', () => {
    const source = assembleTypst({
      documents: [
        { title: 'Second', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second Content' }] }] }, sortOrder: 2 },
        { title: 'First', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First Content' }] }] }, sortOrder: 1 },
      ],
      theme: 'classic-parchment',
      projectTitle: 'Test',
    });

    const firstIdx = source.indexOf('First Content');
    const secondIdx = source.indexOf('Second Content');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('should use different margins for printReady mode', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'classic-parchment',
      projectTitle: 'Test',
      printReady: true,
    });

    // Print-ready uses wider margins for bleed
    expect(source).toContain('0.875in');
    // No footer in print-ready
    expect(source).not.toContain('footer:');
  });

  it('should handle null document content', () => {
    const source = assembleTypst({
      documents: [{ title: 'Empty', content: null, sortOrder: 1 }],
      theme: 'classic-parchment',
      projectTitle: 'Test',
    });

    // Should not throw
    expect(source).toContain('#set page(');
  });

  it('should use dmguild theme variables', () => {
    const source = assembleTypst({
      documents: [],
      theme: 'dmguild',
      projectTitle: 'Test',
    });

    expect(source).toContain('#let heading-font = "Cinzel Decorative"');
    expect(source).toContain('#let body-font = "Libre Baskerville"');
  });
});
```

**Step 2: Run tests — verify they fail**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-assembler.test.ts
```

**Step 3: Implement `worker/src/renderers/typst-assembler.ts`**

```typescript
/**
 * Assembles all project documents into a single Typst source string
 * ready for compilation to PDF. Includes theme variables, page setup,
 * typography, running footer, and all rendered content.
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
 * Assemble a complete Typst source document from project documents, theme, and title.
 */
export function assembleTypst(options: AssembleTypstOptions): string {
  const { documents, theme, projectTitle, printReady = false } = options;

  // Sort documents by sortOrder
  const sorted = [...documents].sort((a, b) => a.sortOrder - b.sortOrder);

  // Get theme variable declarations
  const themeVars = getTypstThemeVariables(theme);

  // Extract texture filename from theme vars
  const textureMatch = themeVars.match(/#let theme-texture = "([^"]*)"/);
  const texture = textureMatch?.[1] || '';

  // Build page setup
  const margins = printReady
    ? 'margin: (top: 0.875in, bottom: 0.875in, inside: 0.875in, outside: 0.75in)'
    : 'margin: (top: 0.75in, bottom: 0.75in, inside: 0.75in, outside: 0.625in)';

  const background = texture
    ? `\n  background: image("textures/${texture}", width: 100%, height: 100%),`
    : '';

  // Running footer: section name + page number (not for print-ready)
  const footer = printReady ? '' : `
  footer: context {
    let headings = query(selector(heading.where(level: 1)).before(here()))
    let section-name = if headings.len() > 0 {
      headings.last().body
    } else {
      "${projectTitle.replace(/"/g, '\\"')}"
    }
    set text(size: 8pt)
    grid(
      columns: (1fr, auto, 1fr),
      align(left, text(font: heading-font, upper(section-name))),
      none,
      align(right, counter(page).display()),
    )
  },`;

  let source = `// Generated by DND Booker — Typst PDF Export
${themeVars}
// ── Page Setup ──
#set page(
  paper: "us-letter",
  columns: 2,
  ${margins},${background}${footer}
  numbering: "1",
)

// ── Typography ──
#set text(font: body-font, size: 9.5pt, fill: theme-text)
#set par(justify: true, first-line-indent: 1em, leading: 0.65em)

// ── Heading Styles ──
#show heading.where(level: 1): it => {
  set text(font: heading-font, fill: theme-primary, size: 1.4em, weight: "bold")
  it
  v(0.2em)
  line(length: 100%, stroke: (paint: theme-divider, thickness: 2pt))
  v(0.3em)
}

#show heading.where(level: 2): it => {
  set text(font: heading-font, fill: theme-primary, size: 1.15em, weight: "bold")
  v(0.5em)
  it
  v(0.1em)
  line(length: 100%, stroke: (paint: theme-divider, thickness: 1pt))
  v(0.2em)
}

#show heading.where(level: 3): it => {
  set text(font: heading-font, fill: theme-primary, size: 1em, weight: "bold")
  v(0.3em)
  it
  v(0.1em)
}

// ── Table Header Styling ──
#set table(stroke: 0.5pt + theme-divider)

// ── Content ──
`;

  // Render each document
  for (const doc of sorted) {
    if (doc.content) {
      source += tiptapToTypst(doc.content);
    }
  }

  return source;
}
```

**Step 4: Run tests — verify they pass**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-assembler.test.ts
```

**Step 5: Commit**

```bash
git add worker/src/renderers/typst-assembler.ts worker/src/__tests__/typst-assembler.test.ts
git commit -m "feat: add Typst assembler with page setup, themes, and typography"
```

---

## Task 6: Typst PDF Generator

**Files:**
- Create: `worker/src/generators/typst.generator.ts`
- Create: `worker/src/__tests__/typst-generator.test.ts`

**Context:** Thin wrapper around `@myriaddreamin/typst-ts-node-compiler`. Creates a `NodeCompiler` with font paths and workspace root, compiles `.typ` source to PDF bytes.

**Step 1: Write failing test**

Create `worker/src/__tests__/typst-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateTypstPdf } from '../generators/typst.generator.js';

describe('Typst PDF Generator', () => {
  it('should compile Typst source to a valid PDF buffer', async () => {
    const source = `
#set page(paper: "us-letter")
= Hello World

This is a test document generated by DND Booker.

== Section Two

More content here with *bold* and _italic_ text.
`;
    const buffer = await generateTypstPdf(source);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // Check PDF magic bytes
    expect(buffer.toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('should throw on invalid Typst source', async () => {
    // Unmatched bracket should cause compilation error
    await expect(generateTypstPdf('#block([')).rejects.toThrow();
  });
});
```

**Step 2: Run test — verify it fails**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-generator.test.ts
```

**Step 3: Implement `worker/src/generators/typst.generator.ts`**

```typescript
/**
 * Generate a PDF from a Typst source string using the Typst NAPI compiler.
 *
 * Uses @myriaddreamin/typst-ts-node-compiler which compiles in-process
 * (no child process or temp files needed).
 */
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import path from 'path';

/** Directory containing font files and texture assets. */
const ASSETS_DIR = path.resolve(process.cwd(), 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');

export async function generateTypstPdf(
  typstSource: string,
  fontPaths?: string[],
  workspaceRoot?: string,
): Promise<Buffer> {
  const compiler = NodeCompiler.create({
    workspace: workspaceRoot || ASSETS_DIR,
    fontArgs: [
      { fontPaths: fontPaths || [FONTS_DIR] },
    ],
  });

  try {
    const pdf = compiler.pdf({ mainFileContent: typstSource });

    if (!pdf || pdf.length === 0) {
      throw new Error('Typst compilation produced empty output');
    }

    return Buffer.from(pdf);
  } finally {
    compiler.evictCache(0);
  }
}
```

**Step 4: Run test — verify it passes**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-generator.test.ts
```

Expected: PASS. The compiler uses system/embedded fonts when no font directory exists.

**Step 5: Commit**

```bash
git add worker/src/generators/typst.generator.ts worker/src/__tests__/typst-generator.test.ts
git commit -m "feat: add Typst PDF generator using NAPI compiler"
```

---

## Task 7: Wire Typst into Export Job

**Files:**
- Modify: `worker/src/jobs/export.job.ts`

**Context:** Replace the Puppeteer `generatePdf` call with the Typst pipeline for `pdf` and `print_pdf` formats. EPUB still uses the HTML pipeline.

**Step 1: Update `export.job.ts`**

Add imports at the top:

```typescript
import { assembleTypst } from '../renderers/typst-assembler.js';
import { generateTypstPdf } from '../generators/typst.generator.js';
import path from 'path';
```

Replace the format switch block (lines ~76-86) with:

```typescript
    // Generate output based on requested format
    let buffer: Buffer;
    const theme = (exportJob.project.settings as Record<string, unknown>)?.theme as string || 'classic-parchment';
    const docs = exportJob.project.documents.map((d) => ({
      title: d.title,
      content: d.content as DocumentContent | null,
      sortOrder: d.sortOrder,
    }));

    if (format === 'pdf' || format === 'print_pdf') {
      // Typst pipeline for PDF
      const typstSource = assembleTypst({
        documents: docs,
        theme,
        projectTitle: exportJob.project.title,
        printReady: format === 'print_pdf',
      });

      const assetsDir = path.resolve(process.cwd(), 'assets');
      const fontsDir = path.join(assetsDir, 'fonts');
      buffer = await generateTypstPdf(typstSource, [fontsDir], assetsDir);
    } else if (format === 'epub') {
      // HTML + Puppeteer pipeline for EPUB
      const html = assembleHtml({
        documents: docs,
        theme,
        projectTitle: exportJob.project.title,
      });
      const serverBaseUrl = process.env.SERVER_BASE_URL || 'http://localhost:4000';
      const resolvedHtml = html.replace(/(?:src|href)="(\/uploads\/[^"]+)"/g, (_match, p1) => {
        return `src="${serverBaseUrl}${p1}"`;
      });
      buffer = await generateEpub(resolvedHtml, exportJob.project.title);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }
```

Also remove the now-unused `generatePdf` and `generatePrintPdf` imports (but keep the files — they serve as fallback if needed).

**Step 2: Verify TypeScript compiles**

```bash
cd /workspace/DND_booker/worker && npx tsc --noEmit
```

Expected: No errors.

**Step 3: Run all worker tests**

```bash
cd /workspace/DND_booker/worker && npx vitest run
```

Expected: All tests PASS.

**Step 4: Commit**

```bash
git add worker/src/jobs/export.job.ts
git commit -m "feat: wire Typst PDF pipeline into export job"
```

---

## Task 8: Font and Texture Assets

**Files:**
- Create: `worker/assets/fonts/` — TTF font files
- Create: `worker/assets/textures/` — parchment texture images
- Modify: `worker/Dockerfile`
- Modify: `worker/.gitignore` (if exists)

**Context:** Typst needs local font files (can't fetch from Google Fonts at compile time) and texture images for page backgrounds.

**Step 1: Create asset directories**

```bash
mkdir -p /workspace/DND_booker/worker/assets/fonts
mkdir -p /workspace/DND_booker/worker/assets/textures
```

**Step 2: Download Google Fonts TTF files**

Download the font families used across all 6 themes. Use the Google Fonts API:

```bash
cd /workspace/DND_booker/worker/assets/fonts

# Download each font family (regular + bold + italic weights)
# Cinzel (classic-parchment heading)
curl -L "https://fonts.google.com/download?family=Cinzel" -o cinzel.zip && unzip -o cinzel.zip -d cinzel && cp cinzel/static/*.ttf . && rm -rf cinzel cinzel.zip

# Cinzel Decorative (dmguild heading)
curl -L "https://fonts.google.com/download?family=Cinzel+Decorative" -o cinzel-decorative.zip && unzip -o cinzel-decorative.zip -d cd && cp cd/static/*.ttf . 2>/dev/null || cp cd/*.ttf . && rm -rf cd cinzel-decorative.zip

# Crimson Text (classic-parchment body)
curl -L "https://fonts.google.com/download?family=Crimson+Text" -o crimson-text.zip && unzip -o crimson-text.zip -d ct && cp ct/static/*.ttf . 2>/dev/null || cp ct/*.ttf . && rm -rf ct crimson-text.zip

# Libre Baskerville (dmguild body)
curl -L "https://fonts.google.com/download?family=Libre+Baskerville" -o libre-baskerville.zip && unzip -o libre-baskerville.zip -d lb && cp lb/static/*.ttf . 2>/dev/null || cp lb/*.ttf . && rm -rf lb libre-baskerville.zip

# EB Garamond (dark-tome body)
curl -L "https://fonts.google.com/download?family=EB+Garamond" -o eb-garamond.zip && unzip -o eb-garamond.zip -d eg && cp eg/static/*.ttf . && rm -rf eg eb-garamond.zip

# Uncial Antiqua (dark-tome heading)
curl -L "https://fonts.google.com/download?family=Uncial+Antiqua" -o uncial.zip && unzip -o uncial.zip -d ua && cp ua/*.ttf . && rm -rf ua uncial.zip

# Inter (clean-modern heading)
curl -L "https://fonts.google.com/download?family=Inter" -o inter.zip && unzip -o inter.zip -d inter && cp inter/static/*.ttf . && rm -rf inter inter.zip

# Merriweather (clean-modern body)
curl -L "https://fonts.google.com/download?family=Merriweather" -o merriweather.zip && unzip -o merriweather.zip -d mw && cp mw/static/*.ttf . 2>/dev/null || cp mw/*.ttf . && rm -rf mw merriweather.zip

# Dancing Script (fey-wild heading)
curl -L "https://fonts.google.com/download?family=Dancing+Script" -o dancing.zip && unzip -o dancing.zip -d ds && cp ds/static/*.ttf . && rm -rf ds dancing.zip

# Lora (fey-wild body)
curl -L "https://fonts.google.com/download?family=Lora" -o lora.zip && unzip -o lora.zip -d lora && cp lora/static/*.ttf . && rm -rf lora lora.zip

# Pirata One (infernal heading)
curl -L "https://fonts.google.com/download?family=Pirata+One" -o pirata.zip && unzip -o pirata.zip -d po && cp po/*.ttf . && rm -rf po pirata.zip

# Bitter (infernal body)
curl -L "https://fonts.google.com/download?family=Bitter" -o bitter.zip && unzip -o bitter.zip -d bitter && cp bitter/static/*.ttf . && rm -rf bitter bitter.zip
```

Verify fonts were downloaded:

```bash
ls -la /workspace/DND_booker/worker/assets/fonts/*.ttf | wc -l
```

Expected: 20+ TTF files.

**Step 3: Create placeholder texture images**

For now, create simple solid-color placeholder images. These will be replaced with proper parchment textures later.

```bash
cd /workspace/DND_booker/worker/assets/textures

# Use ImageMagick or create placeholder files
# If ImageMagick is available:
convert -size 612x792 xc:'#f4e4c1' parchment-classic.jpg 2>/dev/null || echo "placeholder" > parchment-classic.jpg
convert -size 612x792 xc:'#1a1a2e' parchment-dark.jpg 2>/dev/null || echo "placeholder" > parchment-dark.jpg
convert -size 612x792 xc:'#f0f7ee' parchment-fey.jpg 2>/dev/null || echo "placeholder" > parchment-fey.jpg
convert -size 612x792 xc:'#1c1517' parchment-infernal.jpg 2>/dev/null || echo "placeholder" > parchment-infernal.jpg
convert -size 612x792 xc:'#EEE5CE' parchment-dmguild.jpg 2>/dev/null || echo "placeholder" > parchment-dmguild.jpg
```

Note: clean-modern has no texture (empty string in theme). Proper parchment textures should be sourced from royalty-free image sites and optimized for file size.

**Step 4: Update Dockerfile**

Add asset copy after the build step in `worker/Dockerfile`:

After the `COPY worker/ worker/` line, add:
```dockerfile
# Copy Typst assets (fonts + textures) for PDF rendering
COPY worker/assets/ worker/assets/
```

Actually — `COPY worker/ worker/` already copies the assets directory. Verify the Dockerfile doesn't have a `.dockerignore` that excludes assets.

**Step 5: Add `.gitattributes` for binary files**

Create or update `.gitattributes` to handle font and image files:

```
worker/assets/fonts/*.ttf binary
worker/assets/textures/*.jpg binary
worker/assets/textures/*.png binary
```

**Step 6: Commit**

```bash
git add worker/assets/ worker/Dockerfile .gitattributes
git commit -m "feat: add font and texture assets for Typst PDF rendering"
```

---

## Task 9: End-to-End Integration Test

**Files:**
- Create: `worker/src/__tests__/typst-e2e.test.ts`

**Context:** Test the complete pipeline: TipTap JSON -> Typst assembler -> Typst compiler -> PDF bytes. Uses real document content with D&D blocks to verify the entire chain works.

**Step 1: Write the integration test**

Create `worker/src/__tests__/typst-e2e.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assembleTypst } from '../renderers/typst-assembler.js';
import { generateTypstPdf } from '../generators/typst.generator.js';

describe('Typst PDF E2E', () => {
  it('should generate a PDF from a project with mixed content', async () => {
    const source = assembleTypst({
      documents: [
        {
          title: 'Title',
          content: {
            type: 'doc',
            content: [
              {
                type: 'titlePage',
                attrs: { title: 'Test Adventure', subtitle: 'A One-Shot', author: 'Test Author' },
              },
            ],
          },
          sortOrder: 0,
        },
        {
          title: 'Chapter 1',
          content: {
            type: 'doc',
            content: [
              { type: 'chapterHeader', attrs: { title: 'The Beginning', chapterNumber: '1', subtitle: '' } },
              { type: 'paragraph', content: [{ type: 'text', text: 'The adventurers arrive at the tavern.' }] },
              {
                type: 'readAloudBox',
                attrs: { style: 'parchment' },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You enter a dimly lit room.' }] }],
              },
              {
                type: 'statBlock',
                attrs: {
                  name: 'Goblin', size: 'Small', type: 'humanoid', alignment: 'neutral evil',
                  ac: 15, acType: 'leather armor', hp: 7, hitDice: '2d6',
                  speed: '30 ft.', str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
                  traits: '[]', actions: JSON.stringify([{ name: 'Scimitar', description: 'Melee Weapon Attack: +4 to hit' }]),
                  reactions: '[]', legendaryActions: '[]',
                },
              },
              { type: 'columnBreak' },
              { type: 'paragraph', content: [{ type: 'text', text: 'More content in the second column.' }] },
            ],
          },
          sortOrder: 1,
        },
      ],
      theme: 'dmguild',
      projectTitle: 'Test Adventure',
    });

    // Verify Typst source looks reasonable
    expect(source).toContain('#let heading-font = "Cinzel Decorative"');
    expect(source).toContain('columns: 2');
    expect(source).toContain('= The Beginning');
    expect(source).toContain('Goblin');
    expect(source).toContain('#colbreak()');

    // Compile to PDF
    const pdf = await generateTypstPdf(source);
    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(1000); // A real PDF with content
    expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
  }, 30_000); // Allow 30s for compilation

  it('should generate a PDF with all 6 themes', async () => {
    const themes = ['classic-parchment', 'dark-tome', 'clean-modern', 'fey-wild', 'infernal', 'dmguild'];

    for (const theme of themes) {
      const source = assembleTypst({
        documents: [{
          title: 'Test',
          content: {
            type: 'doc',
            content: [
              { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Test' }] },
              { type: 'paragraph', content: [{ type: 'text', text: `Content with ${theme} theme.` }] },
            ],
          },
          sortOrder: 0,
        }],
        theme,
        projectTitle: `Test ${theme}`,
      });

      const pdf = await generateTypstPdf(source);
      expect(pdf.toString('ascii', 0, 5)).toBe('%PDF-');
    }
  }, 60_000); // Allow 60s for 6 compilations
});
```

**Step 2: Run the integration test**

```bash
cd /workspace/DND_booker/worker && npx vitest run src/__tests__/typst-e2e.test.ts
```

Expected: Both tests PASS. If font warnings appear (missing Cinzel Decorative etc.), that's OK — Typst will fall back to system fonts. The PDF will still generate.

**Step 3: Run ALL worker tests to verify nothing is broken**

```bash
cd /workspace/DND_booker/worker && npx vitest run
```

Expected: All tests PASS (including existing html-assembler and utils tests).

**Step 4: Commit**

```bash
git add worker/src/__tests__/typst-e2e.test.ts
git commit -m "test: add end-to-end Typst PDF generation integration tests"
```

---

## Task 10: TypeScript Checks and Docker Build

**Step 1: Run TypeScript checks across all packages**

```bash
cd /workspace/DND_booker && npm run typecheck --workspace=shared
cd /workspace/DND_booker/worker && npx tsc --noEmit
cd /workspace/DND_booker/client && npx tsc --noEmit
```

Expected: No errors in any package.

**Step 2: Build the worker Docker image**

```bash
cd /workspace/DND_booker && docker compose build worker
```

Expected: Build succeeds. The `npm ci` step installs `@myriaddreamin/typst-ts-node-compiler` which auto-downloads the musl binary for Alpine.

**Step 3: Test the Docker image runs**

```bash
docker compose up -d worker
docker compose logs worker --tail=20
```

Expected: Worker starts and connects to Redis without errors.

**Step 4: Commit any remaining fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: resolve TypeScript and Docker build issues for Typst pipeline"
```

---

## Task 11: Manual Browser Test

**Step 1: Deploy updated containers**

```bash
cd /workspace/DND_booker && docker compose build worker && docker compose up -d worker
```

**Step 2: Test PDF export in the browser**

1. Navigate to the app, open a project with content
2. Click Export > PDF
3. Verify the exported PDF has:
   - Two-column layout
   - Themed colors matching the editor
   - Running footer with section name + page number
   - Justified text with paragraph indentation
   - Stat blocks, spell cards, etc. rendered correctly
   - Column breaks and page breaks working

**Step 3: Compare against reference PDFs**

Open the exported PDF alongside "Champions of Darkness" or "Down the Garden Path" and note any remaining gaps for follow-up iteration.

---

## Summary of All New/Modified Files

| File | Action | Purpose |
|---|---|---|
| `shared/src/renderers/utils.ts` | Modify | Add `escapeTypst()` |
| `shared/src/renderers/tiptap-to-typst.ts` | Create | TipTap JSON to Typst renderer (all 22+ nodes) |
| `shared/src/renderers/index.ts` | Modify | Export new functions |
| `worker/src/renderers/tiptap-to-typst.ts` | Create | Re-export from shared |
| `worker/src/renderers/typst-themes.ts` | Create | 6 theme definitions as Typst variables |
| `worker/src/renderers/typst-assembler.ts` | Create | Full .typ document assembly |
| `worker/src/generators/typst.generator.ts` | Create | NAPI compiler wrapper |
| `worker/src/jobs/export.job.ts` | Modify | Wire Typst pipeline for PDF formats |
| `worker/package.json` | Modify | Add typst-ts-node-compiler dependency |
| `worker/assets/fonts/*.ttf` | Create | Google Fonts TTF files |
| `worker/assets/textures/*.jpg` | Create | Parchment texture images |
| `worker/Dockerfile` | Modify (if needed) | Ensure assets are copied |
| `worker/src/__tests__/typst-compiler.test.ts` | Create | Smoke test |
| `worker/src/__tests__/typst-utils.test.ts` | Create | escapeTypst tests |
| `worker/src/__tests__/tiptap-to-typst.test.ts` | Create | Renderer tests |
| `worker/src/__tests__/typst-themes.test.ts` | Create | Theme tests |
| `worker/src/__tests__/typst-assembler.test.ts` | Create | Assembler tests |
| `worker/src/__tests__/typst-generator.test.ts` | Create | Generator tests |
| `worker/src/__tests__/typst-e2e.test.ts` | Create | Integration test |
