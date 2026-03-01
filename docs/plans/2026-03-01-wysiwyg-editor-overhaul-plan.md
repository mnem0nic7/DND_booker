# WYSIWYG Editor Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the editor from a flat themed text area into a page-simulated WYSIWYG editor with two-column layout, parchment textures, ribbon toolbar, publication-quality typography, ornamental dividers, and floating block picker.

**Architecture:** CSS multi-column layout inside page-sized canvas containers. TipTap content flows naturally into CSS columns. Ribbon toolbar replaces flat toolbar. Floating block picker replaces left sidebar. Theme CSS extended with texture and typography variables.

**Tech Stack:** TipTap v3, CSS multi-column, CSS custom properties, React 19, Tailwind CSS 4, `@tiptap/extension-text-align`.

**Design Doc:** `docs/plans/2026-03-01-wysiwyg-editor-overhaul-design.md`

---

## Task 1: Copy Parchment Textures to Client Public Directory

The parchment texture images currently live in `worker/assets/textures/` (used by PDF export). The editor needs to serve them as static assets from the client.

**Files:**
- Copy: `worker/assets/textures/*.jpg` → `client/public/textures/`

**Step 1: Copy texture files**

```bash
mkdir -p client/public/textures
cp worker/assets/textures/parchment-classic.jpg client/public/textures/
cp worker/assets/textures/parchment-dark.jpg client/public/textures/
cp worker/assets/textures/parchment-fey.jpg client/public/textures/
cp worker/assets/textures/parchment-infernal.jpg client/public/textures/
cp worker/assets/textures/parchment-dmguild.jpg client/public/textures/
```

**Step 2: Verify files are accessible**

Start the Vite dev server and open `http://localhost:3000/textures/parchment-classic.jpg` — should display the parchment image. Vite serves files from `client/public/` at the root URL.

**Step 3: Commit**

```bash
git add client/public/textures/
git commit -m "chore: copy parchment textures to client public directory"
```

---

## Task 2: Add New CSS Variables to All 6 Theme Files

Each theme needs new variables for page textures, typography, divider ornaments, and drop caps.

**Files:**
- Modify: `client/src/styles/themes/classic-parchment.css`
- Modify: `client/src/styles/themes/dark-tome.css`
- Modify: `client/src/styles/themes/clean-modern.css`
- Modify: `client/src/styles/themes/fey-wild.css`
- Modify: `client/src/styles/themes/infernal.css`
- Modify: `client/src/styles/themes/dmguild.css`

**Step 1: Add variables to classic-parchment.css**

Add these lines inside the existing `[data-theme="classic-parchment"]` block, after the existing variables:

```css
  /* Page simulation */
  --page-texture: url('/textures/parchment-classic.jpg');
  --column-rule-color: rgba(0, 0, 0, 0.06);
  --footer-color: rgba(0, 0, 0, 0.4);

  /* Typography */
  --drop-cap-font: 'Cinzel', serif;
  --paragraph-indent: 1em;

  /* Decorative elements */
  --divider-ornament: '\2726';
  --divider-gradient: linear-gradient(to right, transparent, #58180d 15%, #58180d 85%, transparent);
  --divider-height: 2px;
  --blockquote-border: 3px solid #c9ad6a;
  --blockquote-bg: rgba(88, 24, 13, 0.04);

  /* Heading decoration */
  --h1-border-bottom: 2px solid #c9ad6a;
  --h1-padding-bottom: 0.25rem;
```

**Step 2: Add variables to dark-tome.css**

```css
  --page-texture: url('/textures/parchment-dark.jpg');
  --column-rule-color: rgba(255, 255, 255, 0.06);
  --footer-color: rgba(255, 255, 255, 0.3);
  --drop-cap-font: 'Cinzel', serif;
  --paragraph-indent: 1em;
  --divider-ornament: '\2666';
  --divider-gradient: linear-gradient(to right, transparent, #9f7aea 15%, #9f7aea 85%, transparent);
  --divider-height: 2px;
  --blockquote-border: 3px solid #9f7aea;
  --blockquote-bg: rgba(159, 122, 234, 0.08);
  --h1-border-bottom: none;
  --h1-padding-bottom: 0;
```

**Step 3: Add variables to clean-modern.css**

```css
  --page-texture: none;
  --column-rule-color: rgba(0, 0, 0, 0.08);
  --footer-color: rgba(0, 0, 0, 0.35);
  --drop-cap-font: 'Inter', sans-serif;
  --paragraph-indent: 0;
  --divider-ornament: '';
  --divider-gradient: linear-gradient(to right, transparent, #94a3b8 20%, #94a3b8 80%, transparent);
  --divider-height: 1px;
  --blockquote-border: 3px solid #6366f1;
  --blockquote-bg: rgba(99, 102, 241, 0.04);
  --h1-border-bottom: 2px solid #6366f1;
  --h1-padding-bottom: 0.25rem;
```

**Step 4: Add variables to fey-wild.css**

```css
  --page-texture: url('/textures/parchment-fey.jpg');
  --column-rule-color: rgba(0, 0, 0, 0.05);
  --footer-color: rgba(0, 0, 0, 0.35);
  --drop-cap-font: 'Dancing Script', cursive;
  --paragraph-indent: 1em;
  --divider-ornament: '\2766';
  --divider-gradient: linear-gradient(to right, transparent, #16a34a 15%, #16a34a 85%, transparent);
  --divider-height: 2px;
  --blockquote-border: 3px solid #16a34a;
  --blockquote-bg: rgba(22, 163, 74, 0.05);
  --h1-border-bottom: 2px solid #16a34a;
  --h1-padding-bottom: 0.25rem;
```

**Step 5: Add variables to infernal.css**

```css
  --page-texture: url('/textures/parchment-infernal.jpg');
  --column-rule-color: rgba(255, 255, 255, 0.05);
  --footer-color: rgba(255, 255, 255, 0.3);
  --drop-cap-font: 'Pirata One', serif;
  --paragraph-indent: 1em;
  --divider-ornament: '\2620';
  --divider-gradient: linear-gradient(to right, transparent, #dc2626 15%, #dc2626 85%, transparent);
  --divider-height: 3px;
  --blockquote-border: 3px solid #dc2626;
  --blockquote-bg: rgba(220, 38, 38, 0.06);
  --h1-border-bottom: none;
  --h1-padding-bottom: 0;
```

**Step 6: Add variables to dmguild.css**

Add after the existing variable block (before the drop cap rules at line 23):

```css
  --page-texture: url('/textures/parchment-dmguild.jpg');
  --column-rule-color: rgba(0, 0, 0, 0.06);
  --footer-color: rgba(0, 0, 0, 0.4);
  --drop-cap-font: 'Cinzel Decorative', 'Cinzel', serif;
  --paragraph-indent: 1em;
  --divider-ornament: '';
  --divider-gradient: linear-gradient(to right, transparent, #9C2B1B 15%, #9C2B1B 85%, transparent);
  --divider-height: 4px;
  --blockquote-border: 3px solid #C9AD6A;
  --blockquote-bg: rgba(201, 173, 106, 0.08);
  --h1-border-bottom: 2px solid #C9AD6A;
  --h1-padding-bottom: 0.25rem;
```

**Step 7: Verify — check TypeScript compilation**

```bash
cd client && npx tsc --noEmit
```

Expected: PASS (CSS changes don't affect TS)

**Step 8: Commit**

```bash
git add client/src/styles/themes/
git commit -m "feat: add page texture, typography, and decoration CSS variables to all themes"
```

---

## Task 3: Page Canvas CSS and Editor Layout Overhaul

Transform the editor from a free-flowing prose area into a page-simulated canvas with two-column layout, textures, and dark surrounding background.

**Files:**
- Modify: `client/src/index.css` (add page canvas styles)
- Modify: `client/src/components/editor/EditorLayout.tsx` (restructure layout)

**Step 1: Add page canvas CSS to index.css**

Add after the existing `[data-theme]` rules (after line 93):

```css
/* ── Page Canvas Simulation ─────────────────────────────────── */

.editor-outer {
  background: #374151;
  overflow-y: auto;
  padding: 2rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-height: 0;
}

.page-canvas {
  width: 816px;
  min-height: 1056px;
  margin-bottom: 2rem;
  padding: 72px 60px 72px 72px;
  background-color: var(--page-bg);
  background-image: var(--page-texture);
  background-size: cover;
  background-position: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  position: relative;
  color: var(--text-color);
  font-family: var(--body-font);
}

.page-canvas[data-texture-off] {
  background-image: none;
}

.page-canvas .ProseMirror {
  column-count: 2;
  column-gap: 48px;
  column-rule: 1px solid var(--column-rule-color, rgba(0,0,0,0.06));
  outline: none;
  min-height: 912px; /* 1056 - 72 - 72 padding */
}

.page-canvas[data-columns="1"] .ProseMirror {
  column-count: 1;
}

/* Prevent blocks from splitting across columns */
.page-canvas .ProseMirror > * {
  break-inside: avoid;
}

/* Column break support */
.page-canvas .ProseMirror [data-column-break] {
  break-after: column;
}

/* Page break visual indicator in page mode */
.page-canvas .ProseMirror [data-page-break] {
  break-after: page;
}

/* Running footer */
.page-footer {
  position: absolute;
  bottom: 24px;
  left: 72px;
  right: 60px;
  font-size: 0.65rem;
  color: var(--footer-color, rgba(0,0,0,0.4));
  display: flex;
  justify-content: space-between;
  font-family: var(--body-font);
  pointer-events: none;
  user-select: none;
}

/* Full-width blocks span both columns */
.page-canvas .title-page,
.page-canvas .credits-page,
.page-canvas .back-cover,
.page-canvas .table-of-contents,
.page-canvas .chapter-header,
.page-canvas .full-bleed-image {
  column-span: all;
}
```

**Step 2: Add typography styles to index.css**

Add after the page canvas styles:

```css
/* ── Publication Typography ────────────────────────────────── */

/* Justified text with first-line indent */
.page-canvas .ProseMirror p {
  text-align: justify;
  text-indent: var(--paragraph-indent, 1em);
  line-height: 1.5;
  margin-bottom: 0.5em;
}

/* No indent on first paragraph after heading or at start */
.page-canvas .ProseMirror > p:first-child,
.page-canvas .ProseMirror h1 + p,
.page-canvas .ProseMirror h2 + p,
.page-canvas .ProseMirror h3 + p {
  text-indent: 0;
}

/* Themed heading styles */
.page-canvas .ProseMirror h1,
.page-canvas .ProseMirror h2,
.page-canvas .ProseMirror h3 {
  font-family: var(--heading-font);
  color: var(--accent-color);
  column-span: all;
}

.page-canvas .ProseMirror h1 {
  font-size: 1.75rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  border-bottom: var(--h1-border-bottom, none);
  padding-bottom: var(--h1-padding-bottom, 0);
}

.page-canvas .ProseMirror h2 {
  font-size: 1.35rem;
  margin-top: 1.25rem;
  margin-bottom: 0.4rem;
}

.page-canvas .ProseMirror h3 {
  font-size: 1.1rem;
  margin-top: 1rem;
  margin-bottom: 0.3rem;
}

/* Drop caps */
.page-canvas .ProseMirror .drop-cap::first-letter {
  font-family: var(--drop-cap-font, var(--heading-font));
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  padding-right: 0.1em;
  color: var(--accent-color);
}

/* Ornamental dividers */
.page-canvas .ProseMirror hr {
  border: none;
  height: var(--divider-height, 2px);
  background: var(--divider-gradient);
  margin: 1.5rem 0;
  position: relative;
  column-span: all;
}

.page-canvas .ProseMirror hr::before {
  content: var(--divider-ornament, '');
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--page-bg);
  padding: 0 0.5rem;
  font-size: 0.9rem;
  color: var(--accent-color);
}

/* Themed blockquotes */
.page-canvas .ProseMirror blockquote {
  border-left: var(--blockquote-border, 3px solid #ccc);
  background: var(--blockquote-bg, transparent);
  padding: 0.75rem 1rem;
  margin: 1rem 0;
  border-radius: 0 4px 4px 0;
}

/* Themed table styling */
.page-canvas .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.85rem;
}

.page-canvas .ProseMirror th {
  background: var(--table-header-bg);
  color: white;
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-family: var(--heading-font);
  font-size: 0.8rem;
}

.page-canvas .ProseMirror td {
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.page-canvas .ProseMirror tr:nth-child(even) td {
  background: var(--table-stripe-bg);
}

/* Lists inside page canvas */
.page-canvas .ProseMirror ul,
.page-canvas .ProseMirror ol {
  padding-left: 1.5em;
  margin-bottom: 0.5em;
}

.page-canvas .ProseMirror li {
  margin-bottom: 0.2em;
}

.page-canvas .ProseMirror li p {
  text-indent: 0;
  margin-bottom: 0.15em;
}
```

**Step 3: Modify EditorLayout.tsx — restructure the editor container**

In `EditorLayout.tsx`, replace the editor content area (lines 150-159). The current code:

```tsx
<div className="flex-1 overflow-y-auto p-8" data-theme={currentTheme}>
  <div className="max-w-3xl mx-auto prose prose-lg max-w-none editor-themed-content">
    {editor && (
      <ErrorBoundary fallbackMessage="...">
        <EditorContent editor={editor} />
      </ErrorBoundary>
    )}
  </div>
</div>
```

Replace with:

```tsx
<div className="editor-outer" data-theme={currentTheme}>
  <div
    className="page-canvas editor-themed-content"
    data-columns={columnCount}
    {...(!showTexture ? { 'data-texture-off': '' } : {})}
  >
    {editor && (
      <ErrorBoundary fallbackMessage="A block encountered an error. Try removing the last edited block.">
        <EditorContent editor={editor} />
      </ErrorBoundary>
    )}
    <div className="page-footer">
      <span>{sectionName}</span>
      <span>1</span>
    </div>
  </div>
</div>
```

**Step 4: Add state for column count, texture toggle, and section name**

Near the top of the `EditorLayout` component (after existing state declarations), add:

```tsx
const [columnCount, setColumnCount] = useState<1 | 2>(2);
const [showTexture, setShowTexture] = useState(true);
const [sectionName, setSectionName] = useState('');
```

Add a useEffect to track the current section name from the nearest H1:

```tsx
useEffect(() => {
  if (!editor) return;
  const updateSection = () => {
    const { $anchor } = editor.state.selection;
    // Walk backwards from cursor to find nearest h1
    for (let d = $anchor.depth; d >= 0; d--) {
      const node = $anchor.node(d);
      if (node.type.name === 'heading' && node.attrs.level === 1) {
        setSectionName(node.textContent);
        return;
      }
    }
    // Check siblings before cursor position
    const resolved = editor.state.doc.resolve($anchor.pos);
    let found = '';
    editor.state.doc.nodesBetween(0, $anchor.pos, (node) => {
      if (node.type.name === 'heading' && node.attrs.level === 1) {
        found = node.textContent;
      }
    });
    setSectionName(found);
  };
  editor.on('selectionUpdate', updateSection);
  editor.on('update', updateSection);
  return () => {
    editor.off('selectionUpdate', updateSection);
    editor.off('update', updateSection);
  };
}, [editor]);
```

**Step 5: Pass columnCount, setColumnCount, showTexture, setShowTexture to Toolbar**

Update the Toolbar render to pass new props:

```tsx
<Toolbar
  editor={editor}
  columnCount={columnCount}
  setColumnCount={setColumnCount}
  showTexture={showTexture}
  setShowTexture={setShowTexture}
/>
```

**Step 6: Verify the build compiles**

```bash
cd client && npx tsc --noEmit
```

Fix any type errors (Toolbar props will fail until Task 4 updates Toolbar).

**Step 7: Commit**

```bash
git add client/src/index.css client/src/components/editor/EditorLayout.tsx
git commit -m "feat: page canvas layout with two-column CSS, textures, and typography"
```

---

## Task 4: Ribbon Toolbar

Replace the flat toolbar with a grouped ribbon containing Text, Paragraph, Insert, Layout, and Theme sections.

**Files:**
- Modify: `client/src/components/editor/Toolbar.tsx` (complete rewrite)

**Step 1: Install the TextAlign TipTap extension**

```bash
npm install @tiptap/extension-text-align --workspace=client
```

**Step 2: Register TextAlign in EditorLayout.tsx**

Add import at top of `EditorLayout.tsx`:

```tsx
import TextAlign from '@tiptap/extension-text-align';
```

Add to the extensions array (line ~57):

```tsx
TextAlign.configure({ types: ['heading', 'paragraph'] }),
```

**Step 3: Rewrite Toolbar.tsx**

Replace the entire `Toolbar.tsx` with the ribbon toolbar. The component accepts new props:

```tsx
import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { useThemeStore } from '../../stores/themeStore';
import type { ThemeName } from '../../stores/themeStore';

interface ToolbarProps {
  editor: Editor;
  columnCount: 1 | 2;
  setColumnCount: (n: 1 | 2) => void;
  showTexture: boolean;
  setShowTexture: (v: boolean) => void;
}

/* ── Small helpers ───────────────────────────────── */

function Icon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function Btn({
  onClick, isActive, disabled, title, children,
}: {
  onClick: () => void; isActive?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`px-1.5 py-1 rounded text-xs transition-colors flex-shrink-0 ${
        isActive ? 'bg-purple-100 text-purple-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] text-gray-400 uppercase tracking-wider text-center mt-0.5 select-none">{children}</div>;
}

function GroupDivider() {
  return <div className="w-px self-stretch bg-gray-200 mx-1.5 flex-shrink-0" />;
}

/* ── Theme metadata ────────────────────────────── */

const THEMES: { value: ThemeName; label: string; swatch: string }[] = [
  { value: 'classic-parchment', label: 'Classic Parchment', swatch: '#f4e4c1' },
  { value: 'dmguild', label: 'DMGuild', swatch: '#EEE5CE' },
  { value: 'dark-tome', label: 'Dark Tome', swatch: '#1a1a2e' },
  { value: 'clean-modern', label: 'Clean Modern', swatch: '#ffffff' },
  { value: 'fey-wild', label: 'Fey Wild', swatch: '#e8f5e9' },
  { value: 'infernal', label: 'Infernal', swatch: '#1a0a0a' },
];

/* ── Main component ─────────────────────────────── */

export function Toolbar({ editor, columnCount, setColumnCount, showTexture, setShowTexture }: ToolbarProps) {
  const { currentTheme, setTheme } = useThemeStore();
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!editor) return;
    const handler = () => setTick((t) => t + 1);
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor]);

  if (!editor) return null;

  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <div className="border-b bg-white">
      <div className="flex items-start gap-0 px-2 py-1.5 overflow-x-auto scrollbar-none">

        {/* ── Text Group ───────────────────────── */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().toggleBold().run()} isActive={is('bold')} title="Bold">
              <span className="font-bold text-sm">B</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={is('italic')} title="Italic">
              <span className="italic text-sm">I</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={is('underline')} title="Underline">
              <span className="underline text-sm">U</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={is('strike')} title="Strikethrough">
              <span className="line-through text-sm">S</span>
            </Btn>
            <Btn
              onClick={() => {
                if (is('link')) { editor.chain().focus().unsetLink().run(); return; }
                const url = window.prompt('URL:');
                if (url) editor.chain().focus().setLink({ href: url }).run();
              }}
              isActive={is('link')}
              title="Link"
            >
              <Icon d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.388a4.5 4.5 0 00-6.364-6.364L4.5 8.25" />
            </Btn>
          </div>
          <GroupLabel>Text</GroupLabel>
        </div>

        <GroupDivider />

        {/* ── Paragraph Group ──────────────────── */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Align left">
              <Icon d="M3 6h18M3 12h12M3 18h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Align center">
              <Icon d="M3 6h18M6 12h12M3 18h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Align right">
              <Icon d="M3 6h18M9 12h12M3 18h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justify">
              <Icon d="M3 6h18M3 12h18M3 18h18" />
            </Btn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={is('heading', { level: 1 })} title="Heading 1">
              <span className="text-[11px] font-bold">H1</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={is('heading', { level: 2 })} title="Heading 2">
              <span className="text-[11px] font-bold">H2</span>
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={is('heading', { level: 3 })} title="Heading 3">
              <span className="text-[11px] font-bold">H3</span>
            </Btn>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={is('bulletList')} title="Bullet list">
              <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={is('orderedList')} title="Ordered list">
              <Icon d="M8 6h13M8 12h13M8 18h13M3.5 6V3l-1 .5M4 18.5H2.5l1.25-1.5c.5-.5.75-1 .25-1.5s-1.25 0-1.5.5" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={is('blockquote')} title="Blockquote">
              <Icon d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.024-.516c1.577-.233 2.713-1.612 2.713-3.228V6.741c0-1.616-1.136-2.995-2.713-3.228A48.4 48.4 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </Btn>
          </div>
          <GroupLabel>Paragraph</GroupLabel>
        </div>

        <GroupDivider />

        {/* ── Insert Group ─────────────────────── */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Ornamental divider">
              <Icon d="M3 12h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().insertContent({ type: 'columnBreak' }).run()} title="Column break">
              <Icon d="M9 4v16M15 4v16" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()} title="Page break">
              <Icon d="M3 10h18M3 14h18" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={is('codeBlock')} title="Code block">
              <Icon d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </Btn>
          </div>
          <GroupLabel>Insert</GroupLabel>
        </div>

        <GroupDivider />

        {/* ── Layout Group ─────────────────────── */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => setColumnCount(1)} isActive={columnCount === 1} title="Single column">
              <span className="text-[10px] font-bold">1-Col</span>
            </Btn>
            <Btn onClick={() => setColumnCount(2)} isActive={columnCount === 2} title="Two columns">
              <span className="text-[10px] font-bold">2-Col</span>
            </Btn>
          </div>
          <GroupLabel>Layout</GroupLabel>
        </div>

        <GroupDivider />

        {/* ── Theme Group ──────────────────────── */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <div className="relative">
              <Btn onClick={() => setShowThemeDropdown(!showThemeDropdown)} title="Theme">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full border border-gray-300" style={{ background: THEMES.find(t => t.value === currentTheme)?.swatch }} />
                  <span className="text-[10px]">Theme</span>
                  <Icon d="M19 9l-7 7-7-7" />
                </div>
              </Btn>
              {showThemeDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1 z-50 w-44">
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      onMouseDown={(e) => { e.preventDefault(); setTheme(t.value); setShowThemeDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 ${currentTheme === t.value ? 'bg-purple-50 text-purple-700' : 'text-gray-700'}`}
                    >
                      <span className="w-4 h-4 rounded-full border" style={{ background: t.swatch }} />
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Btn onClick={() => setShowTexture(!showTexture)} isActive={showTexture} title="Toggle page texture">
              <Icon d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </Btn>
          </div>
          <GroupLabel>Theme</GroupLabel>
        </div>

        <GroupDivider />

        {/* ── History ──────────────────────────── */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-0.5">
            <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!canUndo} title="Undo">
              <Icon d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </Btn>
            <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!canRedo} title="Redo">
              <Icon d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
            </Btn>
          </div>
          <GroupLabel>History</GroupLabel>
        </div>

      </div>
    </div>
  );
}
```

**Step 4: Verify build**

```bash
cd client && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add client/src/components/editor/Toolbar.tsx client/src/components/editor/EditorLayout.tsx
git commit -m "feat: ribbon toolbar with text align, layout controls, and theme picker"
```

---

## Task 5: Floating Block Picker (Replaces Left Sidebar)

Remove the always-visible left sidebar and create a floating block picker panel that opens from the ribbon's Insert button or the `/` slash command.

**Files:**
- Create: `client/src/components/editor/FloatingBlockPicker.tsx`
- Modify: `client/src/components/editor/EditorLayout.tsx` (remove BlockPalette, add FloatingBlockPicker)

**Step 1: Create FloatingBlockPicker.tsx**

Create a new component that reuses the block definitions from the sidebar but renders as a floating, searchable panel:

```tsx
import { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

interface BlockType {
  name: string;
  label: string;
  icon: string;
  category: string;
  insertContent: (editor: Editor) => void;
}

const CATEGORY_STYLES: Record<string, { iconBg: string; iconText: string }> = {
  Basic:     { iconBg: 'bg-gray-100',   iconText: 'text-gray-600' },
  'D&D':     { iconBg: 'bg-amber-100',  iconText: 'text-amber-800' },
  Layout:    { iconBg: 'bg-blue-100',    iconText: 'text-blue-800' },
  Structure: { iconBg: 'bg-rose-100',    iconText: 'text-rose-800' },
};

// Same block definitions as BlockPalette.tsx — extract to a shared constant later
const BLOCK_TYPES: BlockType[] = [
  // -- Copy the entire BLOCK_TYPES array from BlockPalette.tsx --
  // This is the same list of 21+ blocks with their insertContent functions
];

const CATEGORY_ORDER = ['Basic', 'D&D', 'Layout', 'Structure'];

interface FloatingBlockPickerProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

export function FloatingBlockPicker({ editor, isOpen, onClose, anchorRef }: FloatingBlockPickerProps) {
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = search.trim()
    ? BLOCK_TYPES.filter((b) => b.label.toLowerCase().includes(search.toLowerCase()))
    : BLOCK_TYPES;

  const categories = CATEGORY_ORDER.reduce<Record<string, BlockType[]>>((acc, cat) => {
    const blocks = filtered.filter((b) => b.category === cat);
    if (blocks.length) acc[cat] = blocks;
    return acc;
  }, {});

  return (
    <div
      ref={panelRef}
      className="absolute top-full left-0 mt-1 w-72 bg-white rounded-lg shadow-xl border z-50 max-h-96 overflow-hidden flex flex-col"
    >
      <div className="p-2 border-b">
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter blocks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>
      <div className="overflow-y-auto p-2">
        {Object.entries(categories).map(([category, blocks]) => {
          const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.Basic;
          return (
            <div key={category} className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 px-1">
                {category}
              </div>
              {blocks.map((block) => (
                <button
                  key={block.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    block.insertContent(editor);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold ${style.iconBg} ${style.iconText}`}>
                    {block.icon}
                  </span>
                  <span className="truncate">{block.label}</span>
                </button>
              ))}
            </div>
          );
        })}
        {Object.keys(categories).length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No matching blocks</p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Extract shared block definitions**

Move the `BLOCK_TYPES` array out of `BlockPalette.tsx` into a shared file:

Create `client/src/components/editor/blockDefinitions.ts`:

```typescript
import type { Editor } from '@tiptap/react';

export interface BlockType {
  name: string;
  label: string;
  icon: string;
  category: string;
  insertContent: (editor: Editor) => void;
}

// Copy the full BLOCK_TYPES array from BlockPalette.tsx here
export const BLOCK_TYPES: BlockType[] = [
  // ... all 21+ block definitions
];

export const CATEGORY_ORDER = ['Basic', 'D&D', 'Layout', 'Structure'];
```

Update both `BlockPalette.tsx` and `FloatingBlockPicker.tsx` to import from this shared file.

**Step 3: Update EditorLayout.tsx**

Remove the `BlockPalette` import and the `showBlockPalette` state. Remove the left sidebar from the layout. Add the floating block picker state and connect it to the Toolbar's Insert > Block button.

Add state:
```tsx
const [showBlockPicker, setShowBlockPicker] = useState(false);
```

Pass to Toolbar:
```tsx
<Toolbar
  editor={editor}
  columnCount={columnCount}
  setColumnCount={setColumnCount}
  showTexture={showTexture}
  setShowTexture={setShowTexture}
  onOpenBlockPicker={() => setShowBlockPicker(true)}
/>
```

Add the floating picker in the editor area:
```tsx
<FloatingBlockPicker
  editor={editor}
  isOpen={showBlockPicker}
  onClose={() => setShowBlockPicker(false)}
/>
```

**Step 4: Update Toolbar Insert group**

Replace the existing Insert group's Block button with:

```tsx
<Btn onClick={() => onOpenBlockPicker()} title="Insert block">
  <span className="text-[10px] font-bold">Block</span>
</Btn>
```

Add `onOpenBlockPicker` to the `ToolbarProps` interface.

**Step 5: Remove the BlockPalette sidebar toggle from the toolbar area**

In EditorLayout.tsx, remove the hamburger menu button that toggles the block palette (lines 73-83 approximately).

**Step 6: Verify build**

```bash
cd client && npx tsc --noEmit
```

**Step 7: Commit**

```bash
git add client/src/components/editor/
git commit -m "feat: floating block picker replaces left sidebar palette"
```

---

## Task 6: Update tiptap-to-html Renderer for New Attributes

The shared renderer needs to handle text alignment and other new attributes so Preview and Export match the editor.

**Files:**
- Modify: `shared/src/renderers/tiptap-to-html.ts`

**Step 1: Update paragraph rendering to include textAlign**

In `tiptap-to-html.ts`, find the paragraph case (line ~96) and update:

```typescript
case 'paragraph': {
  const align = attrs.textAlign;
  const style = align && align !== 'left' ? ` style="text-align: ${escapeHtml(String(align))}"` : '';
  return `<p${style}>${renderChildren(node.content)}</p>`;
}
```

**Step 2: Update heading rendering to include textAlign**

Find the heading case (line ~99) and update:

```typescript
case 'heading': {
  const level = Number(attrs.level) || 1;
  const tag = `h${Math.min(Math.max(level, 1), 6)}`;
  const align = attrs.textAlign;
  const style = align && align !== 'left' ? ` style="text-align: ${escapeHtml(String(align))}"` : '';
  return `<${tag}${style}>${renderChildren(node.content)}</${tag}>`;
}
```

**Step 3: Update horizontal rule to use ornamental class**

Find the horizontalRule case (line ~124) and update:

```typescript
case 'horizontalRule':
  return '<hr class="ornamental-divider" />';
```

**Step 4: Verify shared package builds**

```bash
npm run typecheck --workspace=shared
```

**Step 5: Commit**

```bash
git add shared/src/renderers/tiptap-to-html.ts
git commit -m "feat: update HTML renderer for text alignment and ornamental dividers"
```

---

## Task 7: Update DMGuild Theme CSS for Page Canvas Compatibility

The DMGuild theme already has drop caps and decorative HR styles, but they target `.editor-themed-content` selectors that won't match the new `.page-canvas` structure. Update selectors.

**Files:**
- Modify: `client/src/styles/themes/dmguild.css`

**Step 1: Update drop cap selectors**

The existing selectors at lines 23-34 target `.editor-themed-content h1 + p::first-letter`. These need to also work with the new `.page-canvas .ProseMirror` structure.

Update the selectors to use both paths:

```css
[data-theme="dmguild"] .editor-themed-content h1 + p::first-letter,
[data-theme="dmguild"] .editor-themed-content h2 + p::first-letter,
[data-theme="dmguild"] .editor-themed-content h3 + p::first-letter,
[data-theme="dmguild"] .page-canvas .ProseMirror h1 + p::first-letter,
[data-theme="dmguild"] .page-canvas .ProseMirror h2 + p::first-letter,
[data-theme="dmguild"] .page-canvas .ProseMirror h3 + p::first-letter {
  font-family: 'Cinzel Decorative', 'Cinzel', serif;
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  margin-right: 0.08em;
  margin-top: 0.05em;
  color: #58180D;
}
```

**Step 2: Verify the existing HR styles work**

The decorative HR rules at lines 36-60 target `.editor-themed-content hr`. Since the page canvas adds its own HR styling via `.page-canvas .ProseMirror hr`, verify there are no conflicts. The `.page-canvas` rules should take precedence (more specific), but the DMGuild-specific gradient should still apply.

Add DMGuild-specific override if needed:

```css
[data-theme="dmguild"] .page-canvas .ProseMirror hr {
  height: 4px;
  background: linear-gradient(to right, transparent, #9C2B1B 15%, #9C2B1B 85%, transparent);
}

[data-theme="dmguild"] .page-canvas .ProseMirror hr::after {
  content: '';
  position: absolute;
  top: 6px;
  left: 15%;
  right: 15%;
  height: 1px;
  background: #9C2B1B;
  opacity: 0.5;
}
```

**Step 3: Update heading styles for page canvas**

```css
[data-theme="dmguild"] .page-canvas .ProseMirror h1 {
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  border-bottom: 2px solid #C9AD6A;
  padding-bottom: 0.25rem;
}

[data-theme="dmguild"] .page-canvas .ProseMirror h2 {
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

[data-theme="dmguild"] .page-canvas .ProseMirror h3 {
  margin-top: 1.25rem;
  margin-bottom: 0.4rem;
}
```

**Step 4: Commit**

```bash
git add client/src/styles/themes/dmguild.css
git commit -m "fix: update DMGuild theme selectors for page canvas compatibility"
```

---

## Task 8: Remove BlockPalette Sidebar and Clean Up

Remove the old BlockPalette component and related toggle state/UI from EditorLayout.

**Files:**
- Delete: `client/src/components/sidebar/BlockPalette.tsx` (or keep for reference, remove from imports)
- Modify: `client/src/components/editor/EditorLayout.tsx`

**Step 1: Remove BlockPalette import and usage**

In `EditorLayout.tsx`, remove:
- The `BlockPalette` import
- The `showBlockPalette` state
- The `{showBlockPalette && <BlockPalette editor={editor} />}` render
- The hamburger button that toggles `showBlockPalette`

**Step 2: Remove the toolbar area buttons for palette toggle, and simplify the top bar**

The top bar currently has: hamburger (palette toggle), Toolbar component, Export, AI, Settings, Preview, Properties buttons.

Keep: Toolbar (ribbon), Export, AI, Preview, Properties.
Remove: hamburger/palette toggle.

**Step 3: Verify build**

```bash
cd client && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add client/src/components/editor/EditorLayout.tsx
git commit -m "refactor: remove left sidebar block palette, use floating picker only"
```

---

## Task 9: Visual Polish and Responsive Adjustments

Final polish pass on the page canvas, ribbon, and overall editor appearance.

**Files:**
- Modify: `client/src/index.css` (responsive adjustments)
- Modify: `client/src/components/editor/EditorLayout.tsx` (minor tweaks)

**Step 1: Add responsive scaling for page canvas**

For screens narrower than the 816px page width, scale the page down:

```css
@media (max-width: 900px) {
  .page-canvas {
    transform: scale(0.85);
    transform-origin: top center;
  }
}

@media (max-width: 700px) {
  .page-canvas {
    transform: scale(0.65);
    transform-origin: top center;
  }
}
```

**Step 2: Add smooth transitions to page canvas**

```css
.page-canvas {
  transition: background-image 0.3s ease, background-color 0.3s ease;
}
```

**Step 3: Style the editor when no document is selected (empty state)**

Ensure the dark gray background and empty page canvas look intentional when no content exists.

**Step 4: Test across all 6 themes**

Manually switch between all themes and verify:
- Textures load correctly
- Typography variables apply
- Heading decorations show
- Drop caps appear (DMGuild especially)
- Divider ornaments render
- Two-column layout works
- Column breaks function

**Step 5: Commit**

```bash
git add client/src/index.css client/src/components/editor/EditorLayout.tsx
git commit -m "polish: responsive scaling, transitions, and visual refinements"
```

---

## Task 10: Update Preview Panel for Consistency

Ensure the preview panel uses the same new CSS so it matches the editor.

**Files:**
- Modify: `client/src/components/preview/PreviewRenderer.tsx`

**Step 1: Verify preview uses same stylesheets**

The PreviewRenderer already injects all parent stylesheets into its iframe. Since the new typography and ornamental styles are in `index.css`, they should automatically appear in the preview. Verify this by opening the preview panel and comparing with the editor.

**Step 2: Add page-canvas class to preview container if needed**

If the preview doesn't use the `.page-canvas` selector, the new typography rules won't apply. Add the class to the preview's content container, or duplicate the necessary rules for the preview's `.preview-content` selector.

**Step 3: Commit**

```bash
git add client/src/components/preview/
git commit -m "fix: ensure preview panel uses page canvas typography styles"
```

---

## Task 11: Integration Test — Full Export Roundtrip

Verify the entire pipeline still works: editor → save → export → PDF.

**Step 1: Start all services**

```bash
docker compose up -d
npm run dev --workspace=client
```

**Step 2: Create a test document**

In the editor, add:
- H1 heading
- Several paragraphs (verify justified text, first-line indent)
- A stat block
- A horizontal rule (verify ornamental divider)
- A column break
- More text in the second column
- Switch themes and verify all look correct

**Step 3: Export to PDF**

Click Export → PDF → Download. Open the PDF and verify:
- Content matches what was in the editor
- Two-column layout is correct
- Blocks render properly
- Dividers are ornamental

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from full export roundtrip test"
```

---

## Summary

| Task | Component | Key Change |
|------|-----------|------------|
| 1 | Textures | Copy parchment images to client/public |
| 2 | Theme CSS | Add texture, typography, decoration variables |
| 3 | Page Canvas | Two-column CSS layout, page simulation |
| 4 | Ribbon Toolbar | Grouped toolbar with alignment, layout, theme |
| 5 | Block Picker | Floating panel replaces sidebar |
| 6 | HTML Renderer | Support textAlign and ornamental dividers |
| 7 | DMGuild CSS | Update selectors for page canvas |
| 8 | Cleanup | Remove old sidebar |
| 9 | Polish | Responsive, transitions, cross-theme testing |
| 10 | Preview | Ensure consistency with editor |
| 11 | Integration | Full export roundtrip test |
