# Typst-Based Professional PDF Export

**Date:** 2026-03-01
**Status:** Approved
**Goal:** Replace Puppeteer PDF rendering with Typst to match the professional quality of DMGuild publications (Champions of Darkness, Down the Garden Path).

## Problem

Current PDF export uses Puppeteer (Chrome headless) which produces single-column, flat-background PDFs with basic centered page numbers. Professional D&D publications require two-column layouts, parchment background textures, running footers with section names, justified typography with paragraph indentation, and automatic TOC page numbers — none of which Puppeteer supports well.

## Decision

Use **Typst** (typst.app) — a modern typesetting engine with first-class support for multi-column layout, running headers/footers, page backgrounds, and PDF bookmarks. Typst accepts its own markup language (not HTML), so we build a new `tiptap-to-typst.ts` renderer parallel to the existing `tiptap-to-html.ts`.

### Why Typst over alternatives

- **vs Puppeteer CSS-only:** Puppeteer's `headerTemplate`/`footerTemplate` runs in an isolated context — no access to DOM for running section names. CSS `column-count` works but Chrome doesn't support `break-before: column` reliably. No `@page` margin boxes.
- **vs WeasyPrint:** Accepts HTML+CSS (closer to current pipeline) but doesn't support column breaks (`break-before: column`), needs Python + system libs in Docker, and has `@page background-image` margin coverage bugs.
- **vs Typst:** Native column breaks (`#colbreak()`), running headers via `context` queries, page backgrounds via `page(background: ...)`, automatic TOC with real page numbers, PDF bookmarks. npm package available — no Python/system deps.

## Architecture

```
TipTap JSON
    │
    ├── tiptap-to-html.ts (existing, used for editor preview + EPUB)
    │
    └── tiptap-to-typst.ts (NEW, used for PDF export)
            │
            ▼
    typst-assembler.ts (NEW, adds theme + page setup + TOC)
            │
            ▼
    typst.generator.ts (NEW, calls `typst` npm package to compile)
            │
            ▼
        PDF Buffer
```

Puppeteer remains for EPUB export and as a fallback.

## New Files

### 1. `shared/src/renderers/tiptap-to-typst.ts`

Parallel to `tiptap-to-html.ts`. Converts TipTap JSON nodes to Typst markup strings.

**Node type mapping:**

| TipTap Node | Typst Output |
|---|---|
| `text` (bold) | `*text*` |
| `text` (italic) | `_text_` |
| `text` (code) | `` `text` `` |
| `text` (link) | `#link("url")[text]` |
| `paragraph` | bare text + newline |
| `heading` (1-3) | `=`, `==`, `===` |
| `bulletList` / `listItem` | `- item` |
| `orderedList` / `listItem` | `+ item` |
| `blockquote` | `#quote[...]` |
| `horizontalRule` | `#line(length: 100%)` |
| `hardBreak` | `#linebreak()` |
| `pageBreak` | `#pagebreak()` |
| `columnBreak` | `#colbreak()` |
| `statBlock` | Custom `#block()` with `#table()` layout |
| `readAloudBox` | `#block(fill: theme-read-aloud-bg, ...)[...]` |
| `sidebarCallout` | `#block(fill: theme-sidebar-bg, ...)[...]` |
| `spellCard` | Custom `#block()` layout |
| `magicItem` | Custom `#block()` layout |
| `randomTable` | `#table(...)` with themed header |
| `npcProfile` | `#block()` with optional image |
| `encounterTable` | `#table(...)` with themed header |
| `classFeature` | Custom `#block()` layout |
| `raceBlock` | Custom `#block()` layout |
| `fullBleedImage` | `#image(...)` (full-width via `place`) |
| `mapBlock` | `#image(...)` + legend table |
| `handout` | `#block()` with handout styling |
| `pageBorder` | Decorative border via `#rect()` or `#block(stroke: ...)` |
| `titlePage` | Full-page centered layout (single-column) |
| `tableOfContents` | `#outline()` (automatic page numbers!) |
| `creditsPage` | Full-page single-column layout |
| `backCover` | Full-page centered layout |
| `chapterHeader` | Custom heading with numbering + underline |

### 2. `worker/src/renderers/typst-themes.ts`

Exports theme definitions as Typst `#let` variable blocks. Maps the 6 existing themes (classic-parchment, dark-tome, clean-modern, fey-wild, infernal, dmguild) to Typst variables.

Each theme provides:
- Color variables: `theme-bg`, `theme-text`, `theme-primary`, `theme-accent`, `theme-secondary`
- Font variables: `heading-font`, `body-font`
- Block-specific: `stat-block-bg`, `stat-block-border`, `read-aloud-bg`, etc.
- Background texture filename

### 3. `worker/src/renderers/typst-assembler.ts`

Parallel to `html-assembler.ts`. Assembles complete `.typ` source:

1. Theme `#let` variable declarations
2. `#set page(...)` with:
   - `paper: "us-letter"`
   - `columns: 2` (content pages only; title/TOC/credits use single column)
   - `margin: (top: 0.75in, bottom: 0.75in, inside: 0.75in, outside: 0.625in)`
   - `background: image("parchment-<theme>.png", width: 100%, height: 100%)`
   - `footer: context { ... }` with running section name + page number
   - `numbering: "1"`
3. `#set text(font: body-font, size: 9.5pt)`
4. `#set par(justify: true, first-line-indent: 1em, leading: 0.65em)`
5. `#set heading(...)` with themed colors, underline show rules
6. Content from `tiptapToTypst()` for each document
7. `#outline()` injected where `tableOfContents` node appears

**Print-ready variant:** Different margins (+ 0.125in bleed), no footer, crop marks.

### 4. `worker/src/generators/typst.generator.ts`

Calls the `typst` npm package to compile `.typ` source to PDF:

```typescript
import { compile } from 'typst';

export async function generateTypstPdf(
  typstSource: string,
  fontPaths?: string[],
  rootPath?: string,
): Promise<Buffer> {
  const pdf = await compile(typstSource, { fontPaths, root: rootPath });
  return Buffer.from(pdf);
}
```

### 5. `worker/assets/`

Static assets directory containing:
- `fonts/` — TTF files for all Google Fonts used (Cinzel, Cinzel Decorative, Libre Baskerville, Crimson Text, EB Garamond, Inter, Merriweather, etc.)
- `textures/` — Parchment PNG textures per theme (classic-parchment.png, dark-tome.png, fey-wild.png, etc.)

## Modified Files

### `worker/src/jobs/export.job.ts`

Add Typst path alongside existing Puppeteer path:

```typescript
if (format === 'pdf') {
  const typstSource = assembleTypst({ documents, theme, projectTitle });
  buffer = await generateTypstPdf(typstSource, [fontsDir], assetsDir);
} else if (format === 'print_pdf') {
  const typstSource = assembleTypst({ documents, theme, projectTitle, printReady: true });
  buffer = await generateTypstPdf(typstSource, [fontsDir], assetsDir);
} else if (format === 'epub') {
  // EPUB still uses HTML + Puppeteer pipeline
  const html = assembleHtml({ documents, theme, projectTitle });
  buffer = await generateEpub(resolvedHtml, projectTitle);
}
```

### `worker/Dockerfile`

Add font and texture assets:

```dockerfile
# Existing: Chromium (for EPUB) + Pandoc
RUN apk add --no-cache chromium pandoc

# New: copy static assets (fonts + textures)
COPY worker/assets/ worker/assets/
```

No new system packages needed — the `typst` npm package is self-contained.

### `worker/package.json`

Add `typst` dependency.

## What We Gain

| Feature | Before (Puppeteer) | After (Typst) |
|---|---|---|
| Two-column layout | None | Full support with `#colbreak()` |
| Parchment background | Flat CSS color | Full-page texture image |
| Running footer | Centered page number only | "SECTION NAME \| page #" |
| TOC page numbers | Placeholder dashes (—) | Real page numbers |
| Typography | Left-aligned, margin-spaced | Justified, first-line indent |
| Heading decorations | None | Red underline rules |
| PDF bookmarks | None | Automatic from headings |
| Column breaks | CSS exists but never activates | Native `#colbreak()` |

## What We Keep

- **HTML renderer** — still powers editor preview and EPUB export
- **Puppeteer** — still used for EPUB generation
- **Theme CSS variables** — client-side themes unchanged
- **All 22+ block types** — each gets a Typst rendering counterpart
- **Export job flow** — same BullMQ queue, same API, just different generator

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `typst` npm package API changes (pre-1.0) | Pin exact version, wrap in thin abstraction |
| Font rendering differences between editor (Chrome) and Typst | Use same font files, test side-by-side |
| Large parchment textures increase PDF size | Optimize PNGs, use JPEG for photo textures |
| Complex D&D blocks may need iteration to match editor appearance | Build incrementally, test each block type |
| Image URLs in content (uploads) need resolution | Pass `root` path or resolve to absolute URLs before Typst compilation |

## Implementation Order

1. Install `typst` npm package, verify it works in Docker
2. Create `tiptap-to-typst.ts` — start with basic nodes (text, paragraph, heading, lists)
3. Create `typst-themes.ts` — port all 6 themes
4. Create `typst-assembler.ts` — page setup, two-column, footer, background
5. Create `typst.generator.ts` — compile wrapper
6. Wire into `export.job.ts` for `pdf` format
7. Add D&D block renderers one by one (stat block first, then others)
8. Add font files and texture assets
9. Test end-to-end with real project content
10. Update Docker build
