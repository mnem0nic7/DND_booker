# DMGuild Theme + Block CSS Refactor

## Goal

Create a new "DMGuild" theme that faithfully reproduces the Player's Handbook visual style, and refactor all block CSS files to use CSS custom properties instead of hardcoded colors — making every block theme-aware across all 6 themes.

## Architecture

### New CSS Variables (added to all themes)

Four new block-accent variables extend the existing 15-variable theme system:

| Variable | Purpose | Classic Parchment | DMGuild |
|----------|---------|-------------------|---------|
| `--spell-card-accent` | Spell card border/title color | `#7c3aed` | `#58180D` |
| `--magic-item-accent` | Magic item border/title color | `#16a34a` | `#58180D` |
| `--class-feature-accent` | Class feature border/title color | `#991b1b` | `#58180D` |
| `--encounter-accent` | Encounter table header/border | `#2d6a3e` | `#58180D` |

### DMGuild Theme Colors

| Variable | Value | Reference |
|----------|-------|-----------|
| `--page-bg` | `#EEE5CE` | PHB page parchment |
| `--text-color` | `#1a1a1a` | Standard dark text |
| `--heading-font` | `Cinzel Decorative` | Close to MrEaves |
| `--body-font` | `Libre Baskerville` | Close to BookInsanity |
| `--accent-color` | `#58180D` | PHB maroon |
| `--accent-secondary` | `#C9AD6A` | PHB gold |
| `--stat-block-bg` | `#FDF1DC` | PHB stat block cream |
| `--stat-block-border` | `#E69A28` | PHB orange ribbon |
| `--callout-bg` | `#E0E5C1` | PHB note green |
| `--read-aloud-bg` | `#FAF7EA` | PHB read-aloud cream |
| `--read-aloud-border` | `#58180D` | PHB maroon border |
| `--sidebar-bg` | `#E0E5C1` | PHB note green |
| `--table-header-bg` | `#58180D` | PHB maroon |
| `--table-stripe-bg` | `#FDF1DC` | Matches stat block bg |
| `--border-decoration` | `#9C2B1B` | PHB rule red |

### Block CSS Refactor Strategy

Replace hardcoded hex colors and font-family declarations with `var()` references:

- **Fonts**: `'Crimson Text', 'Libre Baskerville', serif` → `var(--body-font)`, `'Cinzel', 'Georgia', serif` → `var(--heading-font)` (affects ~14 files)
- **Block backgrounds**: Hardcoded creams/tans → `var(--stat-block-bg)` or derive from theme (affects ~10 files)
- **Block accents**: Per-block unique accent colors → new `var(--*-accent)` variables (4 files)
- **Shared accents**: Colors matching `--accent-color`/`--accent-secondary` → use those vars directly
- **UI chrome**: Edit panel borders (`#ccc`), delete buttons (`#dc2626`) stay hardcoded — they're editor UI, not themed content

### Decorative Polish (DMGuild only)

- Drop caps via `::first-letter` pseudo-element on first paragraph after headings
- Thicker decorative horizontal rules with double-line effect
- Slightly more generous heading margins for printed-book spacing

## Files Changed

### New Files (1)
- `client/src/styles/themes/dmguild.css`

### Theme Registration (5)
- `client/src/stores/themeStore.ts` — add `'dmguild'` to ThemeName
- `client/src/components/editor/ThemePicker.tsx` — add DMGuild swatch
- `client/src/index.css` — import dmguild.css
- `client/index.html` — add Google Fonts
- `worker/src/renderers/html-assembler.ts` — add DMGuild variables

### Theme Variable Updates (5)
- All 5 existing theme CSS files — add 4 new block-accent variables

### Block CSS Refactor (18)
- stat-block.css, spell-card.css, magic-item.css, npc-profile.css
- random-table.css, read-aloud-box.css, sidebar-callout.css, class-feature.css
- chapter-header.css, encounter-table.css, race-block.css, title-page.css
- table-of-contents.css, credits-page.css, back-cover.css, handout.css
- map-block.css, page-border.css

## Non-Goals

- Full-bleed-image.css, page-break.css, column-break.css — minimal hardcoded colors, mostly UI chrome
- Refactoring block React components or TipTap extensions
- Changing block rendering in shared/src/renderers/
