# Editor & Display Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the editor UI for visual consistency, smooth transitions, and professional feel across all panels, blocks, and chrome.

**Architecture:** Pure CSS/JSX changes — no new deps, no server changes. Unified selection ring color, consistent sidebar widths with CSS transitions, standardized toolbar spacing, and color system alignment (purple for AI, indigo for preview, gray for neutral).

**Tech Stack:** React, TipTap, Tailwind CSS v4, custom CSS files in `client/src/styles/`

---

### Task 1: Unify Block Selection Ring Color

All 21+ custom blocks use different ring colors when selected (amber-500, amber-700, indigo-500, emerald-500, green-700, red-700, amber-800). Standardize to a single ring color.

**Files:**
- Modify: `client/src/components/blocks/SpellCard/SpellCardView.tsx:45`
- Modify: `client/src/components/blocks/NpcProfile/NpcProfileView.tsx:30`
- Modify: `client/src/components/blocks/ClassFeature/ClassFeatureView.tsx:27`
- Modify: `client/src/components/blocks/RaceBlock/RaceBlockView.tsx:66`
- Modify: `client/src/components/blocks/MagicItem/MagicItemView.tsx:75`
- Modify: `client/src/components/blocks/EncounterTable/EncounterTableView.tsx:69`

**Step 1: Standardize all selection rings to `ring-purple-500`**

Purple aligns with the app's primary accent. Change each file's `ring-2 ring-*` class to `ring-2 ring-purple-500 ring-offset-2`. Leave the six blocks already using `ring-amber-500` — they'll be changed too for consistency.

All blocks that need changing (find with `grep -rn "ring-2 ring-" client/src/components/blocks/`):

Replace the ring color in EVERY block view to: `ring-2 ring-purple-500 ring-offset-2`

Also add `transition-shadow` to each block's wrapper div for smooth ring appearance.

**Step 2: Verify visually**

Open the app, insert a stat block, click to select it — should show purple ring with smooth transition.

**Step 3: Commit**

```bash
git add client/src/components/blocks/
git commit -m "polish: unify block selection ring to purple-500 with transition"
```

---

### Task 2: Smooth Right Sidebar Transitions

The AI, Preview, and Properties panels appear/disappear instantly when toggled. Add CSS transitions and standardize sidebar width behavior.

**Files:**
- Modify: `client/src/components/editor/EditorLayout.tsx:64-173`

**Step 1: Replace conditional render with transition wrapper**

Instead of `{showAiChat && <div>...</div>}` which mounts/unmounts (no transition possible), keep all sidebars mounted but use a width/opacity transition:

```tsx
{/* Right sidebar container with transitions */}
<div
  className={`border-l overflow-hidden transition-all duration-200 ease-in-out ${
    showAiChat && !showPreview
      ? 'w-[380px] min-w-[300px] opacity-100'
      : showPreview
        ? 'w-[480px] min-w-[320px] opacity-100'
        : showProperties
          ? 'w-64 opacity-100'
          : 'w-0 min-w-0 opacity-0 border-l-0'
  }`}
>
  {showAiChat && !showPreview && (
    <AiChatPanel projectId={projectId} editor={editor} />
  )}
  {showPreview && (
    <PreviewPanel editor={editor} theme={currentTheme} />
  )}
  {showProperties && !showPreview && !showAiChat && (
    <PropertiesPanel editor={editor} />
  )}
</div>
```

This keeps the outer `div` always mounted with `transition-all duration-200`, so width changes animate smoothly. The inner content still conditionally renders for performance.

**Step 2: Test all sidebar toggles**

Click AI → smooth expand. Click Preview → smooth transition to wider. Close all → smooth collapse. Toggle rapidly → no layout jank.

**Step 3: Commit**

```bash
git add client/src/components/editor/EditorLayout.tsx
git commit -m "polish: add smooth sidebar transitions for AI/Preview/Properties panels"
```

---

### Task 3: Fix Toolbar Spacing and Visual Grouping

The toolbar uses `gap-0.5` (2px) which clusters buttons too tightly. The double-border (toolbar has `border-b`, wrapper div also has `border-b`) creates a visual artifact.

**Files:**
- Modify: `client/src/components/editor/Toolbar.tsx:43`
- Modify: `client/src/components/editor/EditorLayout.tsx:72`

**Step 1: Increase toolbar gap and fix double border**

In `Toolbar.tsx` line 43, change `gap-0.5` to `gap-1`:
```tsx
<div className="flex items-center gap-1 flex-wrap px-3 py-2 sticky top-0 z-10">
```

Remove the `border-b` from the toolbar since the parent wrapper at `EditorLayout.tsx:72` already has one:
```tsx
<div className="flex items-center border-b bg-white">
```

The toolbar no longer needs its own `border-b bg-white` since the wrapper provides it.

**Step 2: Verify toolbar appearance**

Buttons should have slightly more breathing room. No double border line visible.

**Step 3: Commit**

```bash
git add client/src/components/editor/Toolbar.tsx client/src/components/editor/EditorLayout.tsx
git commit -m "polish: improve toolbar spacing and remove double border"
```

---

### Task 4: Add Toolbar Icon Buttons (Replace Text Labels)

The toolbar uses text labels like "B", "I", "U", "Undo" which look amateur. Replace with proper SVG icons for a professional feel.

**Files:**
- Modify: `client/src/components/editor/Toolbar.tsx`

**Step 1: Replace text with inline SVGs**

Replace the plain text content in each ToolbarButton with small SVG icons (w-4 h-4). Key replacements:

- Bold: `<strong>B</strong>` → SVG bold icon
- Italic: `<em>I</em>` → SVG italic icon
- Underline: `<u>U</u>` → SVG underline icon
- Strikethrough: `<s>S</s>` → SVG strikethrough icon
- H1/H2/H3: Keep text but style better — `<span className="text-xs font-bold">H1</span>`
- Bullet/Ordered list: SVG list icons
- Blockquote: SVG quote icon
- Code: Keep `</>` but use `font-mono text-xs`
- Horizontal rule: SVG horizontal line icon
- Undo/Redo: SVG arrow icons

Use Heroicons 24x24 outlines (already used elsewhere in the app).

**Step 2: Add `aria-label` to each icon-only button**

Since buttons now use icons instead of text, add `aria-label` matching the `title` prop for accessibility.

**Step 3: Verify**

All toolbar buttons render as clean icons. Hover states still work. Active states (indigo-100 bg) still visible.

**Step 4: Commit**

```bash
git add client/src/components/editor/Toolbar.tsx
git commit -m "polish: replace toolbar text labels with SVG icons"
```

---

### Task 5: Standardize Block Delete Buttons

Delete buttons across blocks use inconsistent positioning and styling. Some use CSS classes (`.stat-block__delete-btn`), others may differ. All should have the same hover-reveal, same color, same size.

**Files:**
- Modify: `client/src/styles/ai-chat.css` — add shared `.block-delete-btn` class
- Modify: All block CSS files that define `__delete-btn`

**Step 1: Create shared delete button styles in index.css**

Add a universal `.block-delete-btn` class at the end of `client/src/index.css`:

```css
/* Shared block controls */
.block-delete-btn {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 0.15rem 0.4rem;
  font-size: 0.65rem;
  font-weight: 500;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 5;
}
```

Then replace each block's custom `__delete-btn` CSS with the shared class.

**Step 2: Update block view TSX files to use `block-delete-btn`**

In each block view component, change the delete button's className from e.g. `stat-block__delete-btn` to `block-delete-btn`. The parent block still needs `position: relative` and `:hover .block-delete-btn { opacity: 1 }`.

**Step 3: Commit**

```bash
git add client/src/index.css client/src/styles/blocks/ client/src/components/blocks/
git commit -m "polish: standardize block delete buttons with shared CSS class"
```

---

### Task 6: Add Focus Ring Consistency

Some inputs have `focus:ring-purple-500 focus:border-purple-500`, others lack focus rings entirely. Standardize.

**Files:**
- Modify: `client/src/index.css`

**Step 1: Add global focus ring styles**

Add to `client/src/index.css`:

```css
/* Global focus ring — consistent purple ring on all interactive inputs */
.editor-themed-content input:focus,
.editor-themed-content select:focus,
.editor-themed-content textarea:focus,
.stat-block__edit-panel input:focus,
.stat-block__edit-panel select:focus,
.stat-block__edit-panel textarea:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
}
```

This catches ALL block edit panel inputs without needing to modify each individual block's CSS.

**Step 2: Verify by clicking into a stat block edit field**

Should see consistent purple focus ring.

**Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "polish: add consistent purple focus rings to all block inputs"
```

---

### Task 7: Polish Block Palette Sidebar

The block palette lacks visual hierarchy and could benefit from search, better icons, and subtle hover states.

**Files:**
- Modify: `client/src/components/sidebar/BlockPalette.tsx`

**Step 1: Add a search/filter input at the top**

```tsx
const [filter, setFilter] = useState('');
// Filter blocks by label match
const filteredBlocks = BLOCK_TYPES.filter(b =>
  b.label.toLowerCase().includes(filter.toLowerCase())
);
```

Add input above the categories:
```tsx
<input
  value={filter}
  onChange={(e) => setFilter(e.target.value)}
  placeholder="Search blocks..."
  className="w-full mb-3 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-purple-500 focus:border-purple-500 bg-white"
/>
```

**Step 2: Add subtle left accent color to category headers**

```tsx
<h4 className="text-xs font-medium text-gray-400 uppercase mb-2 pl-2 border-l-2 border-gray-200">
  {category}
</h4>
```

**Step 3: Improve block button hover with left accent**

```tsx
className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-r hover:bg-gray-100 hover:border-l-2 hover:border-purple-400 transition-colors"
```

**Step 4: Commit**

```bash
git add client/src/components/sidebar/BlockPalette.tsx
git commit -m "polish: add search filter and improved hover states to block palette"
```

---

### Task 8: Polish AI Chat Panel

Minor visual refinements to the AI chat sidebar for a more polished feel.

**Files:**
- Modify: `client/src/components/ai/AiChatPanel.tsx`
- Modify: `client/src/styles/ai-chat.css`

**Step 1: Add subtle animations to suggestion buttons**

The empty-state suggestion buttons should have a staggered fade-in:

```css
/* In ai-chat.css */
.ai-suggestion-btn {
  animation: fadeInUp 0.3s ease forwards;
  opacity: 0;
}
.ai-suggestion-btn:nth-child(1) { animation-delay: 0.05s; }
.ai-suggestion-btn:nth-child(2) { animation-delay: 0.1s; }
.ai-suggestion-btn:nth-child(3) { animation-delay: 0.15s; }
.ai-suggestion-btn:nth-child(4) { animation-delay: 0.2s; }

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

Update the suggestion button className in `AiChatPanel.tsx` to include `ai-suggestion-btn`.

**Step 2: Improve the streaming cursor**

Replace the rectangular block cursor with a smoother blinking dot:

```tsx
{isStreaming && (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse ml-1 mb-0.5 align-baseline" />
)}
```

**Step 3: Commit**

```bash
git add client/src/components/ai/AiChatPanel.tsx client/src/styles/ai-chat.css
git commit -m "polish: add suggestion animations and improved streaming cursor"
```

---

### Task 9: Polish Preview Panel

The preview panel zoom controls and overall chrome could be refined.

**Files:**
- Modify: `client/src/components/preview/PreviewPanel.tsx`

**Step 1: Add dropdown-style zoom control**

Replace the three hardcoded zoom buttons with a cleaner segmented control:

```tsx
<div className="inline-flex rounded-md border border-gray-200 bg-gray-50">
  {ZOOM_OPTIONS.map((level, i) => (
    <button
      key={level}
      onClick={() => setZoom(level)}
      className={`px-2.5 py-1 text-xs transition-colors ${
        i > 0 ? 'border-l border-gray-200' : ''
      } ${
        zoom === level
          ? 'bg-white text-indigo-700 font-medium shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {level}%
    </button>
  ))}
</div>
```

**Step 2: Add paper shadow and border refinement**

The preview page container gets a more realistic paper look:

```tsx
className="mx-auto bg-white shadow-xl rounded border border-gray-200 origin-top"
```

**Step 3: Commit**

```bash
git add client/src/components/preview/PreviewPanel.tsx
git commit -m "polish: refine preview panel zoom controls and paper shadow"
```

---

### Task 10: Final Sweep — Accessibility & aria-labels

Add `aria-label` attributes to all icon-only buttons that lack text content.

**Files:**
- Modify: `client/src/components/editor/EditorLayout.tsx` — sidebar toggle buttons
- Modify: `client/src/components/ai/AiChatPanel.tsx` — send/cancel buttons
- Modify: `client/src/components/ai/AiPlanPanel.tsx` — delete/reset buttons

**Step 1: Add aria-labels**

For every `<button>` that has a `title` but no visible text (icon-only), add `aria-label={title}`.

EditorLayout.tsx toggles:
```tsx
<button aria-label="Toggle block palette" ... >
```

AiChatPanel.tsx send button:
```tsx
<button aria-label="Send message" ... >
```

AiChatPanel.tsx cancel button:
```tsx
<button aria-label="Stop generating" ... >
```

**Step 2: Commit**

```bash
git add client/src/components/
git commit -m "polish: add aria-labels to all icon-only buttons"
```

---

## Implementation Order

| Task | Focus | Risk | Time |
|------|-------|------|------|
| 1 | Selection rings | Low | ~5 min |
| 2 | Sidebar transitions | Medium | ~10 min |
| 3 | Toolbar spacing | Low | ~3 min |
| 4 | Toolbar icons | Medium | ~15 min |
| 5 | Delete buttons | Low | ~10 min |
| 6 | Focus rings | Low | ~3 min |
| 7 | Block palette | Low | ~10 min |
| 8 | AI chat polish | Low | ~5 min |
| 9 | Preview polish | Low | ~5 min |
| 10 | Accessibility | Low | ~5 min |

Total: ~10 tasks, all CSS/JSX only, no server changes, no new dependencies.
