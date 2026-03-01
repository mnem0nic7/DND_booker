# WYSIWYG Editor Overhaul Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the editor from a basic themed text area into a professional page-simulated WYSIWYG editor with two-column layout, parchment textures, ribbon toolbar, and publication-quality typography.

**Architecture:** CSS multi-column layout on TipTap content within page-sized canvas containers. Ribbon toolbar replaces flat toolbar. Floating block picker replaces sidebar palette. Theme-aware decorative elements throughout.

**Tech Stack:** TipTap v3, CSS multi-column, CSS custom properties (existing theme system), React, Tailwind CSS 4, existing Google Fonts.

---

## 1. Page Canvas & Layout

### Page Container
Replace the current free-flowing editor area with a vertical stack of page canvases, each sized to US Letter proportions (816px x 1056px at 96dpi).

Each page has:
- **Parchment texture background** from `worker/assets/` (parchment-classic.jpg, parchment-dmguild.jpg, etc.) via CSS `background-image` using a new `--page-texture` CSS variable per theme
- **Proper margins** matching the PDF: 72px top/bottom, 72px inside (gutter), 60px outside
- **Two-column layout** via CSS `column-count: 2; column-gap: 48px` (0.5in)
- **Running footer** showing section name (nearest H1) and page number, non-editable

### CSS Structure
```css
.editor-outer {
  background: #374151; /* gray-700 background outside pages */
  overflow-y: auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem; /* gap between pages */
}

.page-canvas {
  width: 816px;
  min-height: 1056px;
  padding: 72px 60px 72px 72px;
  background-color: var(--page-bg);
  background-image: var(--page-texture);
  background-size: cover;
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
  position: relative;
}

.page-canvas .page-content {
  column-count: 2;
  column-gap: 48px;
  column-rule: 1px solid rgba(0,0,0,0.06);
}

.page-footer {
  position: absolute;
  bottom: 24px;
  left: 72px;
  right: 60px;
  font-size: 0.7rem;
  color: var(--text-color);
  opacity: 0.5;
  display: flex;
  justify-content: space-between;
}
```

### Paging Behavior
TipTap renders into a single continuous content div with `column-count: 2`. JavaScript measures content height and inserts visual page break indicators at correct positions. Not pixel-perfect pagination — a close approximation of where pages break.

### Full-Width Content
Title pages, TOC, full-width images, and chapter headers use `column-span: all` to stretch across both columns. The ColumnBreak node uses `break-after: column` to force content to the next column.

### New CSS Variables Per Theme
Each theme adds:
- `--page-texture`: url to parchment/texture image (or `none` for clean themes)
- `--column-rule-color`: subtle column divider color
- `--footer-color`: running footer text color

---

## 2. Ribbon Toolbar

Replace the flat horizontal toolbar strip with a grouped ribbon organized into labeled sections.

### Layout
```
| Text                  | Paragraph                           | Insert              | Layout          | Theme        |
| B I U S ~ Link       | Left Center Right Justify | Drop | H1 H2 H3 | UL OL  | Divider ColBrk PageBrk Block | 1-Col 2-Col Width | Theme Texture |
```

### Text Group
- **Bold, Italic, Underline, Strikethrough** — icon buttons (existing)
- **Link** — link insertion (existing)
- **Font size** — dropdown: Small / Normal / Large (maps to CSS classes)
- **Text color** — color picker pulling from active theme palette

### Paragraph Group
- **Alignment** — 4 buttons: Left, Center, Right, Justify (TipTap TextAlign extension)
- **Drop cap** — toggle button, applies `drop-cap` class to first paragraph after heading
- **Heading levels** — H1, H2, H3 (moved from current toolbar)
- **Lists** — Bullet, Ordered (moved from current toolbar)

### Insert Group
- **Ornamental divider** — inserts theme-aware decorative `<hr>`
- **Column break** — inserts column break marker
- **Page break** — inserts page break marker
- **Block** — opens floating block picker panel

### Layout Group
- **Column mode** — toggle: 1 column / 2 columns for current section
- **Block width** — when D&D block selected: half-width / full-width toggle

### Theme Group
- **Theme picker** — dropdown showing 6 themes with color swatches
- **Texture toggle** — on/off for page texture backgrounds

### Visual Design
- White/light background, thin bottom border
- Each group has tiny gray label below ("Text", "Paragraph", etc.)
- Compact icon-only buttons with tooltips
- Purple accent for active states (consistent with existing design)
- Thin vertical dividers between groups

---

## 3. Typography & Decorative Elements

### Justified Text with First-Line Indent
Default paragraph styling in the editor:
```css
.page-content p {
  text-align: justify;
  text-indent: 1em;
}
.page-content p:first-child,
.page-content h1 + p,
.page-content h2 + p,
.page-content h3 + p {
  text-indent: 0; /* No indent after headings */
}
```
Users can override per-paragraph via the Paragraph alignment buttons.

### Themed Heading Decorations
Each theme applies decorative rules to headings:
- **Classic Parchment / DMGuild**: H1 gets `border-bottom: 2px solid var(--accent-secondary)`
- **Dark Tome**: H1 gets subtle glow via `text-shadow`
- **Fey Wild**: H1 gets vine-like underline decoration
- **All themes**: Tighter heading spacing matching PDF output

### Drop Caps
When enabled, first letter of first paragraph after heading:
```css
.drop-cap::first-letter {
  font-family: var(--heading-font);
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  padding-right: 0.1em;
  color: var(--accent-color);
}
```
DMGuild uses `Cinzel Decorative` (already loaded). Other themes use their heading font.

### Ornamental Dividers
Replace plain `<hr>` with theme-aware decorative dividers:
- **Classic Parchment**: Thin gradient line fading at edges + center star ornament (unicode)
- **DMGuild**: Thick gradient line matching PHB style (existing CSS)
- **Dark Tome**: Glowing ember line
- **Clean Modern**: Simple thin rule
- **Fey Wild**: Vine-like decorative line
- **Infernal**: Flame-colored gradient

Use `::before` / `::after` pseudo-elements for ornaments — no images needed.

### Table Styling
Tables get alternating row striping and colored headers using existing theme variables (`--table-header-bg`, `--table-stripe-bg`).

### Decorative Blockquotes
Enhanced blockquote styling per theme — ornamental borders, background tints, styled quote marks.

---

## 4. Block Palette & Sidebar Changes

### Floating Block Picker (replaces left sidebar)
Remove the always-visible left block palette sidebar. Replace with:
- **Ribbon "Block" button** opens a floating block picker panel
- **Slash commands** — typing `/` in the editor opens the same picker inline
- Panel is searchable, grouped by category (Basic, D&D Content, Layout, Front/Back Matter)
- Same content as current palette, presented as floating panel

### Right Sidebar
Keep existing (AI Chat, Preview, Properties) with minor adjustments:
- Preview panel becomes supplementary (editor itself now shows page layout)
- Properties and AI Chat unchanged

### Editor Background
Area outside page canvases gets neutral dark gray (`#374151`) background, making parchment pages visually prominent — matches Google Docs page-on-gray pattern.

---

## 5. New TipTap Extensions Needed

### TextAlign Extension
TipTap's official `@tiptap/extension-text-align` — adds alignment attribute to paragraphs and headings.

### DropCap Mark/Decoration
Custom TipTap extension that adds a `dropCap` attribute to paragraph nodes. When set, applies the `.drop-cap` CSS class.

### OrnamentalDivider Node
Extends the existing HorizontalRule or creates a new node type that renders theme-aware decorative dividers instead of plain `<hr>`.

### SlashCommands Extension
TipTap suggestion-based extension that shows the block picker on `/` keystroke (like Notion).

---

## 6. Theme Variable Additions

Each theme CSS file gets these new variables:

```css
[data-theme="theme-name"] {
  /* Existing variables unchanged */

  /* New additions */
  --page-texture: url('/textures/parchment-classic.jpg'); /* or none */
  --column-rule-color: rgba(0,0,0,0.06);
  --footer-color: rgba(0,0,0,0.4);
  --divider-ornament: '\2726'; /* unicode ornament character */
  --divider-gradient: linear-gradient(to right, transparent, var(--accent-color) 15%, var(--accent-color) 85%, transparent);
  --drop-cap-font: var(--heading-font); /* or Cinzel Decorative for DMGuild */
  --blockquote-border: 3px solid var(--accent-secondary);
  --blockquote-bg: rgba(0,0,0,0.03);
}
```

---

## 7. Data Model

No schema changes needed. Content is still TipTap JSON stored in `Document.content`. New attributes (alignment, drop cap, etc.) are stored as TipTap node attributes within the JSON — this is TipTap's native mechanism.

The shared `tiptapToHtml` renderer in `shared/src/renderers/` will need updates to emit the new CSS classes for alignment, drop caps, and ornamental dividers so that Preview and Export continue to match the editor.

---

## 8. What This Does NOT Include

- Pixel-perfect page break prediction (approximate only)
- Print-ready bleed marks in editor (export-only)
- Custom font uploads
- CMYK color management
- Real-time multi-user editing
- Mobile/responsive editor layout (desktop-first)

---

## Summary of Changes

| Area | Current | After |
|------|---------|-------|
| Editor area | Flat colored background, single column, free-flowing | Page canvas with textures, two-column, page breaks |
| Toolbar | Flat strip with icons | Ribbon with labeled groups |
| Typography | Left-aligned, browser defaults | Justified, first-line indent, themed headings |
| Decorative | Plain `<hr>`, basic blockquotes | Ornamental dividers, styled blockquotes, drop caps |
| Block palette | Always-visible left sidebar | Floating panel via ribbon or `/` command |
| Background | Theme page color fills the area | Dark gray with page-canvas "sheets" |
| Tables | Basic HTML tables | Themed striped rows, colored headers |
