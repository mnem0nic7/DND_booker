# DMGuild Theme + Block CSS Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an authentic "DMGuild" theme matching the Player's Handbook visual style, and refactor all block CSS files from hardcoded colors/fonts to CSS custom properties so every block is theme-aware.

**Architecture:** Add 4 new CSS custom properties (`--spell-card-accent`, `--magic-item-accent`, `--class-feature-accent`, `--encounter-accent`) to all 6 themes. Replace hardcoded hex colors and font-family declarations in 18 block CSS files with `var()` references. Create a new `dmguild.css` theme file. Register the theme in the store, picker, imports, fonts, and worker export pipeline.

**Tech Stack:** CSS custom properties, Zustand (themeStore), Google Fonts, TipTap editor theming

---

### Task 1: Add new CSS variables to all 5 existing theme files

**Files:**
- Modify: `client/src/styles/themes/classic-parchment.css`
- Modify: `client/src/styles/themes/dark-tome.css`
- Modify: `client/src/styles/themes/clean-modern.css`
- Modify: `client/src/styles/themes/fey-wild.css`
- Modify: `client/src/styles/themes/infernal.css`

**Step 1: Add 4 new variables to classic-parchment.css**

Add before the closing `}`:
```css
  --spell-card-accent: #7c3aed;
  --magic-item-accent: #16a34a;
  --class-feature-accent: #991b1b;
  --encounter-accent: #2d6a3e;
```

These preserve the current hardcoded colors each block uses today, so there's zero visual change.

**Step 2: Add 4 new variables to dark-tome.css**

```css
  --spell-card-accent: #7b68ae;
  --magic-item-accent: #c9a84c;
  --class-feature-accent: #c9a84c;
  --encounter-accent: #7b68ae;
```

**Step 3: Add 4 new variables to clean-modern.css**

```css
  --spell-card-accent: #7c3aed;
  --magic-item-accent: #16a34a;
  --class-feature-accent: #dc2626;
  --encounter-accent: #2563eb;
```

**Step 4: Add 4 new variables to fey-wild.css**

```css
  --spell-card-accent: #7c3aed;
  --magic-item-accent: #22c55e;
  --class-feature-accent: #ca8a04;
  --encounter-accent: #166534;
```

**Step 5: Add 4 new variables to infernal.css**

```css
  --spell-card-accent: #ea580c;
  --magic-item-accent: #ea580c;
  --class-feature-accent: #dc2626;
  --encounter-accent: #dc2626;
```

**Step 6: Commit**

```bash
git add client/src/styles/themes/
git commit -m "feat: add block-accent CSS variables to all themes"
```

---

### Task 2: Create the DMGuild theme CSS file

**Files:**
- Create: `client/src/styles/themes/dmguild.css`

**Step 1: Create the theme file**

```css
[data-theme="dmguild"] {
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
}

/* DMGuild decorative drop caps */
[data-theme="dmguild"] .editor-themed-content h1 + p::first-letter,
[data-theme="dmguild"] .editor-themed-content h2 + p::first-letter,
[data-theme="dmguild"] .editor-themed-content h3 + p::first-letter {
  font-family: 'Cinzel Decorative', 'Cinzel', serif;
  font-size: 3.5em;
  float: left;
  line-height: 0.8;
  margin-right: 0.08em;
  margin-top: 0.05em;
  color: #58180D;
}

/* DMGuild thicker decorative horizontal rules */
[data-theme="dmguild"] .editor-themed-content hr {
  border: none;
  height: 4px;
  background: linear-gradient(
    to right,
    transparent,
    #9C2B1B 15%,
    #9C2B1B 85%,
    transparent
  );
  margin: 1.5rem 0;
  position: relative;
}

[data-theme="dmguild"] .editor-themed-content hr::after {
  content: '';
  position: absolute;
  top: 6px;
  left: 15%;
  right: 15%;
  height: 1px;
  background: #9C2B1B;
  opacity: 0.5;
}

/* DMGuild heading spacing */
[data-theme="dmguild"] .editor-themed-content h1 {
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  border-bottom: 2px solid #C9AD6A;
  padding-bottom: 0.25rem;
}

[data-theme="dmguild"] .editor-themed-content h2 {
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

[data-theme="dmguild"] .editor-themed-content h3 {
  margin-top: 1.25rem;
  margin-bottom: 0.4rem;
}
```

**Step 2: Commit**

```bash
git add client/src/styles/themes/dmguild.css
git commit -m "feat: create DMGuild theme with PHB-authentic styling"
```

---

### Task 3: Register the DMGuild theme in store, picker, CSS imports, and fonts

**Files:**
- Modify: `client/src/stores/themeStore.ts:6-10` — add `'dmguild'` to ThemeName type
- Modify: `client/src/components/editor/ThemePicker.tsx:15-46` — add DMGuild entry to themes array
- Modify: `client/src/index.css:8` — add import after infernal.css
- Modify: `client/index.html:9` — add `Cinzel+Decorative` and `Libre+Baskerville` to Google Fonts URL

**Step 1: Update ThemeName type in themeStore.ts**

Add `| 'dmguild'` to the ThemeName union type at line 10:

```typescript
export type ThemeName =
  | 'classic-parchment'
  | 'dark-tome'
  | 'clean-modern'
  | 'fey-wild'
  | 'infernal'
  | 'dmguild';
```

**Step 2: Add DMGuild to ThemePicker.tsx themes array**

Add after the infernal entry (before the closing `]`):

```typescript
  {
    id: 'dmguild',
    label: 'DMGuild',
    description: "Player's Handbook style",
    colors: { bg: '#EEE5CE', text: '#1a1a1a', accent: '#58180D', secondary: '#C9AD6A' },
  },
```

**Step 3: Add DMGuild import to index.css**

After the infernal import line, add:

```css
@import './styles/themes/dmguild.css';
```

**Step 4: Add fonts to index.html**

In the Google Fonts `<link>` URL, add `&family=Cinzel+Decorative:wght@400;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400` before `&display=swap`.

The full URL becomes:
```
https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Cinzel+Decorative:wght@400;700&family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&family=Uncial+Antiqua&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Dancing+Script:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&family=Pirata+One&family=Bitter:ital,wght@0,400;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap
```

**Step 5: Commit**

```bash
git add client/src/stores/themeStore.ts client/src/components/editor/ThemePicker.tsx client/src/index.css client/index.html
git commit -m "feat: register DMGuild theme in store, picker, CSS, and fonts"
```

---

### Task 4: Refactor stat-block.css to use CSS variables

**Files:**
- Modify: `client/src/styles/blocks/stat-block.css`

**Step 1: Replace hardcoded themed values**

Replace the following (content area only, NOT edit panel):

| Line | Old | New |
|------|-----|-----|
| 2 | `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| 3 | `background: #fdf1dc;` | `background: var(--stat-block-bg);` |
| 5 | `border: 1px solid #e69a28;` | `border: 1px solid var(--stat-block-border);` |
| 6 | `box-shadow: 0 0 0.25rem #e69a28;` | `box-shadow: 0 0 0.25rem var(--stat-block-border);` |
| 12 | `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| 15 | `color: #58180d;` (name) | `color: var(--accent-color);` |
| 24 | `color: #58180d;` (subtitle) | `color: var(--accent-color);` |
| 29 | `background: linear-gradient(to right, #e69a28, transparent);` | `background: linear-gradient(to right, var(--stat-block-border), transparent);` |
| 37 | `color: #1a1a1a;` (property) | `color: var(--text-color);` |
| 42 | `color: #58180d;` (property-name) | `color: var(--accent-color);` |
| 58 | `color: #58180d;` (ability-name) | `color: var(--accent-color);` |
| 70 | `color: #58180d;` (section-title) | `color: var(--accent-color);` |
| 71 | `border-bottom: 1px solid #e69a28;` | `border-bottom: 1px solid var(--stat-block-border);` |
| 78 | `color: #1a1a1a;` (trait-name) | `color: var(--text-color);` |

Leave all edit panel styles (`__edit-panel`, `__edit-row`, `__delete-btn`, `__entry-add`, `__entry-remove`) with hardcoded colors since they are editor UI chrome.

**Step 2: Commit**

```bash
git add client/src/styles/blocks/stat-block.css
git commit -m "refactor: stat-block.css uses CSS theme variables"
```

---

### Task 5: Refactor spell-card.css to use CSS variables

**Files:**
- Modify: `client/src/styles/blocks/spell-card.css`

**Step 1: Replace hardcoded themed values**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #f5f0ff;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #7c3aed;` | `border: 1px solid var(--spell-card-accent);` |
| `box-shadow: 0 0 0.25rem #7c3aed;` | `box-shadow: 0 0 0.25rem var(--spell-card-accent);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #4338ca;` (name, property-name, higher-levels-label) | `color: var(--spell-card-accent);` |
| `color: #6d28d9;` (subtitle) | `color: var(--spell-card-accent);` |
| `background: linear-gradient(to right, #7c3aed, transparent);` (divider) | `background: linear-gradient(to right, var(--spell-card-accent), transparent);` |
| `color: #1a1a1a;` (property, description, higher-levels) | `color: var(--text-color);` |

Leave edit panel colors hardcoded.

**Step 2: Commit**

```bash
git add client/src/styles/blocks/spell-card.css
git commit -m "refactor: spell-card.css uses CSS theme variables"
```

---

### Task 6: Refactor magic-item.css to use CSS variables

**Files:**
- Modify: `client/src/styles/blocks/magic-item.css`

**Step 1: Replace hardcoded themed values**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fafafa;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #d1d5db;` | `border: 1px solid var(--magic-item-accent);` |
| `border-top: 4px solid #6b7280;` | `border-top: 4px solid var(--magic-item-accent);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #6b7280;` (name) | `color: var(--magic-item-accent);` |
| `color: #4b5563;` (subtitle) | `color: var(--magic-item-accent);` |
| `background: linear-gradient(to right, #6b7280, transparent);` (divider) | `background: linear-gradient(to right, var(--magic-item-accent), transparent);` |
| `color: #1a1a1a;` (description, properties) | `color: var(--text-color);` |
| `border-top: 1px solid #e5e7eb;` (properties) | `border-top: 1px solid var(--magic-item-accent);` |

**Step 2: Commit**

```bash
git add client/src/styles/blocks/magic-item.css
git commit -m "refactor: magic-item.css uses CSS theme variables"
```

---

### Task 7: Refactor npc-profile.css to use CSS variables

**Files:**
- Modify: `client/src/styles/blocks/npc-profile.css`

**Step 1: Replace hardcoded themed values**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fdf6e8;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #c9a85c;` | `border: 1px solid var(--accent-secondary);` |
| `box-shadow: 0 0 0.25rem #c9a85c;` | `box-shadow: 0 0 0.25rem var(--accent-secondary);` |
| `border: 2px solid #c9a85c;` (portrait) | `border: 2px solid var(--accent-secondary);` |
| `background: #e8d9b8;` (portrait placeholder) | `background: var(--callout-bg);` |
| `color: #8b6d3f;` (placeholder, subtitle) | `color: var(--accent-secondary);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #7c4a1e;` (name, trait-label) | `color: var(--accent-color);` |
| `background: linear-gradient(to right, #c9a85c, transparent);` (divider) | `background: linear-gradient(to right, var(--accent-secondary), transparent);` |
| `color: #3a2a14;` (description, trait) | `color: var(--text-color);` |

**Step 2: Commit**

```bash
git add client/src/styles/blocks/npc-profile.css
git commit -m "refactor: npc-profile.css uses CSS theme variables"
```

---

### Task 8: Refactor class-feature.css and encounter-table.css

**Files:**
- Modify: `client/src/styles/blocks/class-feature.css`
- Modify: `client/src/styles/blocks/encounter-table.css`

**Step 1: Refactor class-feature.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fdf5f5;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #991b1b;` | `border: 1px solid var(--class-feature-accent);` |
| `border-left: 4px solid #991b1b;` | `border-left: 4px solid var(--class-feature-accent);` |
| `box-shadow: 0 0 0.25rem rgba(153, 27, 27, 0.3);` | `box-shadow: 0 0 0.25rem color-mix(in srgb, var(--class-feature-accent) 30%, transparent);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #991b1b;` (name) | `color: var(--class-feature-accent);` |
| `color: #b91c1c;` (subtitle) | `color: var(--class-feature-accent);` |
| `background: linear-gradient(to right, #991b1b, transparent);` (divider) | `background: linear-gradient(to right, var(--class-feature-accent), transparent);` |
| `color: #1a1a1a;` (description) | `color: var(--text-color);` |

**Step 2: Refactor encounter-table.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #f5f9f5;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #2d6a3e;` | `border: 1px solid var(--encounter-accent);` |
| `box-shadow: 0 0 0.25rem #2d6a3e;` | `box-shadow: 0 0 0.25rem var(--encounter-accent);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #1a5c2e;` (title, td--weight, td--cr) | `color: var(--encounter-accent);` |
| `color: #3a7a4e;` (cr-range) | `color: var(--encounter-accent);` |
| `background: #1a5c2e;` (th) | `background: var(--encounter-accent);` |
| `background: #e8f0e8;` (even row) | `background: var(--table-stripe-bg);` |
| `background: #f5f9f5;` (odd row) | `background: var(--stat-block-bg);` |
| `border-bottom: 1px solid #c5dcc5;` (td) | `border-bottom: 1px solid var(--stat-block-border);` |
| `color: #1a1a1a;` (td) | `color: var(--text-color);` |

Leave edit panel / add/remove buttons hardcoded.

**Step 3: Commit**

```bash
git add client/src/styles/blocks/class-feature.css client/src/styles/blocks/encounter-table.css
git commit -m "refactor: class-feature & encounter-table use CSS theme variables"
```

---

### Task 9: Refactor random-table.css and race-block.css

**Files:**
- Modify: `client/src/styles/blocks/random-table.css`
- Modify: `client/src/styles/blocks/race-block.css`

**Step 1: Refactor random-table.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fffbf0;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #92400e;` | `border: 1px solid var(--table-header-bg);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #78350f;` (title, th, td--roll, die-badge bg) | `color: var(--table-header-bg);` / `background: var(--table-header-bg);` |
| `color: #fef3c7;` (die-badge text, th text) | `color: var(--table-stripe-bg);` |
| `background: #78350f;` (th) | `background: var(--table-header-bg);` |
| `background: #fef3c7;` (even row) | `background: var(--table-stripe-bg);` |
| `background: #fffbeb;` (odd row) | `background: var(--stat-block-bg);` |
| `border-bottom: 1px solid #e5e7eb;` (td) | `border-bottom: 1px solid var(--stat-block-border);` |

**Step 2: Refactor race-block.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #faf6f0;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #a0845c;` | `border: 1px solid var(--accent-secondary);` |
| `box-shadow: 0 0 0.25rem #a0845c;` | `box-shadow: 0 0 0.25rem var(--accent-secondary);` |
| `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `color: #78553a;` (name, property-name, section-title, feature-name) | `color: var(--accent-color);` |
| `background: linear-gradient(to right, #a0845c, transparent);` (divider) | `background: linear-gradient(to right, var(--accent-secondary), transparent);` |
| `color: #1a1a1a;` (property, feature) | `color: var(--text-color);` |

Leave edit panel / add/remove buttons hardcoded.

**Step 3: Commit**

```bash
git add client/src/styles/blocks/random-table.css client/src/styles/blocks/race-block.css
git commit -m "refactor: random-table & race-block use CSS theme variables"
```

---

### Task 10: Refactor read-aloud-box.css and sidebar-callout.css

**Files:**
- Modify: `client/src/styles/blocks/read-aloud-box.css`
- Modify: `client/src/styles/blocks/sidebar-callout.css`

**Step 1: Refactor read-aloud-box.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `font-family: 'Cinzel', 'Georgia', serif;` (label) | `font-family: var(--heading-font);` |
| `.read-aloud-box--parchment` `background: #e8dcc8;` | `background: var(--read-aloud-bg);` |
| `.read-aloud-box--parchment` `border-left: 4px solid #5c3a1e;` | `border-left: 4px solid var(--read-aloud-border);` |
| `.read-aloud-box--parchment` `color: #2a1f14;` | `color: var(--text-color);` |
| `.read-aloud-box--parchment .read-aloud-box__label` `color: #5c3a1e;` | `color: var(--read-aloud-border);` |
| `.read-aloud-box--parchment .read-aloud-box__style-btn` `color: #5c3a1e;` | `color: var(--read-aloud-border);` |

Note: The `--dark` variant uses hardcoded dark-mode colors (`#2a2a2a`, `#c9a84c`, `#f0e6d0`). These stay hardcoded since it's an explicit dark override within the block, not controlled by theme.

**Step 2: Refactor sidebar-callout.css**

| Old | New |
|-----|-----|
| `.sidebar-callout--info` `background: #e8edf3;` | `background: var(--sidebar-bg);` |
| `.sidebar-callout--info` `color: #1a2a3a;` | `color: var(--text-color);` |
| `.sidebar-callout--lore` `background: #e8f0e8;` | `background: var(--callout-bg);` |
| `.sidebar-callout--lore` `color: #1a2a1a;` | `color: var(--text-color);` |
| `.sidebar-callout--warning` `background: #fef3cd;` | Keep hardcoded (warning is intentionally yellow regardless of theme) |
| `.sidebar-callout--info .sidebar-callout__title` `color: #4a6fa5;` | `color: var(--accent-color);` |
| `.sidebar-callout--lore .sidebar-callout__title` `color: #2d5a2d;` | `color: var(--accent-color);` |
| `.sidebar-callout--info` `border-left: 4px solid #4a6fa5;` | `border-left: 4px solid var(--accent-color);` |
| `.sidebar-callout--lore` `border-left: 4px solid #2d5a2d;` | `border-left: 4px solid var(--accent-color);` |
| `.sidebar-callout__type-btn--active` (info) `background: #4a6fa5;` | `background: var(--accent-color);` |
| `.sidebar-callout--lore .sidebar-callout__type-btn--active` `background: #2d5a2d;` | `background: var(--accent-color);` |

**Step 3: Commit**

```bash
git add client/src/styles/blocks/read-aloud-box.css client/src/styles/blocks/sidebar-callout.css
git commit -m "refactor: read-aloud-box & sidebar-callout use CSS theme variables"
```

---

### Task 11: Refactor chapter-header.css, title-page.css, and table-of-contents.css

**Files:**
- Modify: `client/src/styles/blocks/chapter-header.css`
- Modify: `client/src/styles/blocks/title-page.css`
- Modify: `client/src/styles/blocks/table-of-contents.css`

**Step 1: Refactor chapter-header.css**

| Old | New |
|-----|-----|
| `font-family: 'Cinzel', 'Georgia', serif;` (number, title) | `font-family: var(--heading-font);` |
| `color: #58180d;` (number) | `color: var(--accent-color);` |
| `color: #1a1a1a;` (title) | `color: var(--text-color);` |
| `background: #8b1a1a;` (underline) | `background: var(--border-decoration);` |
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` (subtitle) | `font-family: var(--body-font);` |
| `color: #555;` (subtitle) | `color: var(--accent-color);` |

**Step 2: Refactor title-page.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fdf1dc;` | `background: var(--stat-block-bg);` |
| `border: 2px solid #58180d;` | `border: 2px solid var(--accent-color);` |
| `border: 1px solid #c9ad6a;` (cover image) | `border: 1px solid var(--accent-secondary);` |
| `border: 2px dashed #c9ad6a;` (cover placeholder) | `border: 2px dashed var(--accent-secondary);` |
| `color: #a08050;` (placeholder text) | `color: var(--accent-secondary);` |
| `font-family: 'Cinzel', 'Georgia', serif;` (title) | `font-family: var(--heading-font);` |
| `color: #58180d;` (title, author) | `color: var(--accent-color);` |
| `color: #7a2810;` (subtitle) | `color: var(--accent-color);` |
| `color: #c9ad6a;` (ornament) | `color: var(--accent-secondary);` |

**Step 3: Refactor table-of-contents.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fdf1dc;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #c9ad6a;` | `border: 1px solid var(--accent-secondary);` |
| `font-family: 'Cinzel', 'Georgia', serif;` (heading) | `font-family: var(--heading-font);` |
| `color: #58180d;` (heading, entry-page) | `color: var(--accent-color);` |
| `color: #a08050;` (note) | `color: var(--accent-secondary);` |
| `color: #1a1a1a;` (entry) | `color: var(--text-color);` |
| `border-bottom: 1px dotted #999;` (leader) | `border-bottom: 1px dotted var(--text-color);` |

**Step 4: Commit**

```bash
git add client/src/styles/blocks/chapter-header.css client/src/styles/blocks/title-page.css client/src/styles/blocks/table-of-contents.css
git commit -m "refactor: chapter-header, title-page, table-of-contents use CSS theme variables"
```

---

### Task 12: Refactor credits-page.css, back-cover.css, handout.css

**Files:**
- Modify: `client/src/styles/blocks/credits-page.css`
- Modify: `client/src/styles/blocks/back-cover.css`
- Modify: `client/src/styles/blocks/handout.css`

**Step 1: Refactor credits-page.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #fdf1dc;` | `background: var(--stat-block-bg);` |
| `border: 1px solid #c9ad6a;` | `border: 1px solid var(--accent-secondary);` |
| `font-family: 'Cinzel', 'Georgia', serif;` (heading, legal-heading) | `font-family: var(--heading-font);` |
| `color: #58180d;` (heading, legal-heading) | `color: var(--accent-color);` |
| `color: #333;` (credits text p) | `color: var(--text-color);` |
| `background: #c9ad6a;` (divider) | `background: var(--accent-secondary);` |

Keep `#555`, `#777` secondary text colors as is — they're intentionally subdued legal/copyright text.

**Step 2: Refactor back-cover.css**

| Old | New |
|-----|-----|
| `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `background: #1a1a2e;` | `background: var(--page-bg);` |
| `color: #e0d8c8;` | `color: var(--text-color);` |
| `color: #c9ad6a;` (ornament) | `color: var(--accent-secondary);` |
| `border: 2px solid #c9ad6a;` (author-image) | `border: 2px solid var(--accent-secondary);` |
| `color: #e0d8c8;` (blurb p) | `color: var(--text-color);` |

Keep `#555`, `#666`, `#777`, `#bbb` muted UI colors as is.

**Step 3: Refactor handout.css**

| Old | New |
|-----|-----|
| `.handout--letter` `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `.handout--letter .handout__title` `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `.handout--scroll` `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `.handout--scroll .handout__title` `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `.handout--scroll .handout__content` `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |
| `.handout--scroll .handout__title` `color: #58180d;` | `color: var(--accent-color);` |
| `.handout--poster .handout__title` `font-family: 'Cinzel', 'Georgia', serif;` | `font-family: var(--heading-font);` |
| `.handout__style-btn--active` `background: #58180d;` `border-color: #58180d;` | `background: var(--accent-color);` `border-color: var(--accent-color);` |
| `.handout__edit-row textarea` `font-family: 'Crimson Text', 'Libre Baskerville', serif;` | `font-family: var(--body-font);` |

Keep letter/scroll/poster background gradients and border colors hardcoded — they define the physical appearance of each handout type (aged paper, parchment scroll, posted notice) independent of theme.

**Step 4: Commit**

```bash
git add client/src/styles/blocks/credits-page.css client/src/styles/blocks/back-cover.css client/src/styles/blocks/handout.css
git commit -m "refactor: credits-page, back-cover, handout use CSS theme variables"
```

---

### Task 13: Refactor map-block.css and page-border.css

**Files:**
- Modify: `client/src/styles/blocks/map-block.css`
- Modify: `client/src/styles/blocks/page-border.css`

**Step 1: Refactor map-block.css**

| Old | New |
|-----|-----|
| `border: 2px solid #8b7355;` | `border: 2px solid var(--accent-secondary);` |
| `background: #faf6f0;` | `background: var(--stat-block-bg);` |
| `background: #ede5d8;` (image-area) | `background: var(--callout-bg);` |
| `color: #8b7355;` (placeholder) | `color: var(--accent-secondary);` |
| `color: #5a4a3a;` (scale) | `color: var(--text-color);` |
| `border-top: 1px solid #d4c4a8;` (scale) | `border-top: 1px solid var(--accent-secondary);` |
| `background: #f5efe5;` (scale bg) | `background: var(--callout-bg);` |
| `border-top: 2px solid #8b7355;` (legend) | `border-top: 2px solid var(--accent-secondary);` |
| `background: #faf6f0;` (legend) | `background: var(--stat-block-bg);` |
| `font-family: 'Cinzel', 'Georgia', serif;` (legend-title) | `font-family: var(--heading-font);` |
| `color: #58180d;` (legend-title, legend-label) | `color: var(--accent-color);` |
| `color: #333;` (legend-entry) | `color: var(--text-color);` |

**Step 2: Refactor page-border.css**

| Old | New |
|-----|-----|
| `font-family: 'Cinzel', 'Georgia', serif;` (label) | `font-family: var(--heading-font);` |
| `.page-border__style-btn--active` `background: #58180d;` `border-color: #58180d;` | `background: var(--accent-color);` `border-color: var(--accent-color);` |

Keep the border variant colors (elvish green `#2d6a4f`, dwarven gold `#8b6914`, infernal red `#8b1a1a`) hardcoded — these define the physical character of each border style, not the theme.

**Step 3: Commit**

```bash
git add client/src/styles/blocks/map-block.css client/src/styles/blocks/page-border.css
git commit -m "refactor: map-block & page-border use CSS theme variables"
```

---

### Task 14: Update the worker export pipeline

**Files:**
- Modify: `worker/src/renderers/html-assembler.ts:36-173`

**Step 1: Add 4 new variables to each existing theme in `getThemeVariables()`**

For each theme entry in the `themes` Record, add the 4 new variables matching what was set in Task 1.

For `classic-parchment`:
```
      --spell-card-accent: #7c3aed;
      --magic-item-accent: #16a34a;
      --class-feature-accent: #991b1b;
      --encounter-accent: #2d6a3e;
```

For `dark-tome`:
```
      --spell-card-accent: #7b68ae;
      --magic-item-accent: #c9a84c;
      --class-feature-accent: #c9a84c;
      --encounter-accent: #7b68ae;
```

For `clean-modern`:
```
      --spell-card-accent: #7c3aed;
      --magic-item-accent: #16a34a;
      --class-feature-accent: #dc2626;
      --encounter-accent: #2563eb;
```

For `fey-wild`:
```
      --spell-card-accent: #7c3aed;
      --magic-item-accent: #22c55e;
      --class-feature-accent: #ca8a04;
      --encounter-accent: #166534;
```

For `infernal`:
```
      --spell-card-accent: #ea580c;
      --magic-item-accent: #ea580c;
      --class-feature-accent: #dc2626;
      --encounter-accent: #dc2626;
```

**Step 2: Add the `dmguild` theme entry**

Add to the `themes` Record:

```typescript
    'dmguild': `
      /* Client theme vars */
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
      /* Worker aliases */
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
```

**Step 3: Update the block CSS in html-assembler.ts to use `var()` references**

The inline block CSS in the worker's `assembleHtml()` function already uses `var()` references for most properties (e.g. `var(--stat-block-bg)`, `var(--font-heading)`). Verify the following are updated to match:

- `.spell-card` border: `2px solid var(--spell-card-accent, #4338ca);`
- `.spell-card__name` color: `var(--spell-card-accent, #4338ca);`
- `.class-feature` border: `2px solid var(--class-feature-accent, #991b1b);`
- `.class-feature__name` color: `var(--class-feature-accent, #991b1b);`

Use fallback values (the `#4338ca` after the comma) so existing exports still work if the variable isn't set.

**Step 4: Add `Cinzel+Decorative` and `Libre+Baskerville` to the Google Fonts URL in `assembleHtml()`**

Find the Google Fonts `<link>` tag in the HTML template (around line 291) and add `&family=Cinzel+Decorative:wght@400;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400` before `&display=swap`.

**Step 5: Commit**

```bash
git add worker/src/renderers/html-assembler.ts
git commit -m "feat: add DMGuild theme to worker export pipeline"
```

---

### Task 15: Build and verify

**Step 1: Run TypeScript compilation check**

```bash
cd /workspace/DND_booker && npx tsc --noEmit --project client/tsconfig.json
```

Expected: No errors. The only TS change was adding `'dmguild'` to a union type.

**Step 2: Build the client**

```bash
cd /workspace/DND_booker && docker compose build client
```

Expected: Clean build with no CSS errors.

**Step 3: Deploy and smoke test**

```bash
docker compose up -d client
```

Navigate to the editor, open the Properties panel, and select the DMGuild theme. Verify:
- Page background is warm parchment (#EEE5CE)
- Headings use Cinzel Decorative font
- Body text uses Libre Baskerville
- Drop caps appear on first paragraph after headings
- HR elements have decorative double-line effect
- Stat blocks, spell cards, and other blocks pick up theme colors

**Step 4: Switch between all 6 themes**

Verify that blocks respond to theme changes — fonts, backgrounds, and accent colors should change as you switch themes.

**Step 5: Final commit**

If any fixes were needed during verification:
```bash
git add -A
git commit -m "fix: polish DMGuild theme and block CSS variable usage"
```
