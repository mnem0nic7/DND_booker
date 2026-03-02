# DMGuild/PHB Layout Matching Design

**Date**: 2026-03-02
**Status**: Approved
**Scope**: Update `dmguild` and `classic-parchment` themes to match the official D&D 5e Player's Handbook layout

## Reference Documents

- `DMGuild/Downloads/1549417-Champions_of_Darkness_-_Nikolas_Totief__Marco_Bertini_(2)_compressed.pdf` — Homebrewery-generated DMGuild product (23 pages)
- `DMGuild/Downloads/5E_DMGuild_SPECS.docx` — Official DMGuild template with style definitions

## Approach

Use **Solbera's community D&D fonts** (CC-BY-SA 4.0) which are free clones of the actual PHB typefaces. Combined with color/layout values extracted from the Homebrewery V3 5ePHB theme, this gives us a pixel-accurate match to the PHB/DMGuild style.

## Font System

### Solbera Font Mapping

| Solbera Font | Replaces (Official) | Usage | Variable |
|---|---|---|---|
| Bookinsanity (4 weights) | Bookmania | Body text | `bodyFont` |
| Mr Eaves Small Caps | Mrs Eaves SC | H1-H4 headings | `headingFont` |
| Scaly Sans (4 weights) | Scala Sans | Stat blocks, tables, notes | `statFont` (new) |
| Scaly Sans Caps (4 weights) | Scala Sans Caps | Stat block section headers | (used inline) |
| Nodesto Caps Condensed (4 weights) | Modesto Bold Condensed | Title/chapter titles | `titleFont` (new) |
| Solbera Imitation | Unknown | Drop caps (stretch goal) | — |
| Dungeon Drop Case | — | Decorative drop caps | — |

### New Theme Variables

Add to `ThemeDefinition`:
- `titleFont`: Font for title pages and chapter headings (Nodesto Caps Condensed)
- `statFont`: Font for stat blocks, tables, sidebars (Scaly Sans)
- `headerUnderline`: Color for H3 gold underline (#C0AD6A)

### Client Preview

Editor continues using Google Fonts approximations (Libre Baskerville, Cinzel) since Solbera fonts aren't on Google Fonts CDN. PDF export uses real Solbera fonts. This is an acceptable trade-off — the editor is for content creation, not pixel-perfect preview.

## Color Palette

Homebrewery V3 5ePHB color scheme:

```
--HB_Color_Background            : #EEE5CE  (page background)
--HB_Color_Accent                : #E0E5C1  (green — notes, table stripes)
--HB_Color_HeaderUnderline       : #C0AD6A  (gold — H3 underline)
--HB_Color_HorizontalRule        : #9C2B1B  (maroon — dividers)
--HB_Color_HeaderText            : #58180D  (dark maroon — headings)
--HB_Color_MonsterStatBackground : #F2E5B5  (warm parchment — stat blocks)
--HB_Color_CaptionText           : #766649  (brown — captions)
--HB_Color_Footnotes             : #C9AD6A  (gold — footer text)
```

### Changes from Current

| Variable | Current dmguild | New | Reason |
|---|---|---|---|
| `statBlockBg` | `#FDF1DC` | `#F2E5B5` | Match PHB stat block parchment |
| `tableStripeBg` | `#FDF1DC` | `#E0E5C1` | PHB uses green accent for odd rows |
| `headerUnderline` | (new) | `#C0AD6A` | Gold underline below H3 headings |

All other colors remain the same — they already match.

## Stat Block Layout

### Current
- Left border only (3pt orange)
- Border radius 2pt
- Single font (heading-font for name, body-font for content)

### New (PHB Style)
- **Top and bottom borders**: Thick decorative stroke using `#E69A28` orange. In Typst: `stroke: (top: 4pt + theme-stat-block-border, bottom: 4pt + theme-stat-block-border)` with internal red divider lines
- **No border-radius**: Sharp corners
- **No left/right borders**
- **Background**: `#F2E5B5`
- **Font**: Scaly Sans for all content
- **Section headers** ("Actions", "Reactions", "Legendary Actions"): Scaly Sans Caps, `#58180D` maroon, with red horizontal rule below
- **Internal dividers**: Red `#58180D` thin lines (simulating the PHB's triangular/tapered dividers via `line()` with gradient or ornamental stroke)
- **Ability score table**: Centered, no borders, Scaly Sans

## Heading Styles

### Current
- H1: heading-font, 18pt, theme-primary, bold, divider line below
- H2: heading-font, 14pt, theme-primary, bold
- H3: heading-font, 12pt, theme-primary, bold

### New (PHB Style)
- **H1**: Mr Eaves Small Caps, ~23pt (0.89cm), `#58180D`, column-spanning
- **H2**: Mr Eaves Small Caps, ~20pt (0.75cm), `#58180D`
- **H3**: Mr Eaves Small Caps, ~15pt (0.575cm), `#58180D`, **gold underline** (2pt solid `#C0AD6A`)
- **H4**: Mr Eaves Small Caps, ~12pt (0.458cm), `#58180D`

Key difference: H3 gets a gold underline instead of a red divider line. H1 no longer has a divider — it's just large and prominent.

## Page Layout

| Property | Current | New |
|---|---|---|
| Paper | US Letter | US Letter (same) |
| Columns | 2 | 2 (same) |
| Column gap | Typst default | 0.9cm (0.354in) |
| Margins | 0.75in/0.75in/0.75in/0.625in | 0.75in all sides (symmetric) |
| Body font size | 9.5pt | 9.5pt (close to PHB's 0.34cm = 9.6pt) |
| Line height (leading) | 0.65em | 1.25em (PHB standard) |
| First-line indent | 1em | 0em (PHB doesn't indent) |
| Paragraph spacing | implicit | 0.325cm (~9.2pt) between block elements |

## Other Block Updates

### Read-Aloud (Descriptive) Box
- Background: `#FAF7EA` (already correct)
- Border: Solid `#58180D` border (simulating ornamental frame)
- Font: Scaly Sans
- Box shadow effect (if feasible in Typst)

### Note (Sidebar) Box
- Background: `#E0E5C1` (green accent — already correct)
- Border: Ornamental frame (solid border in Typst)
- Font: Scaly Sans

### Tables
- Font: Scaly Sans
- Odd-row striping: `#E0E5C1` (green accent, not orange)
- Header: Bold, no background fill (or very subtle)
- No vertical borders

### Footer
- Left: Section name (uppercase, `#C9AD6A` gold, heading font)
- Right: Page number (`#C9AD6A` gold)
- Size: 8pt

## Files Changed

### New Files
- `worker/assets/fonts/` — 22 Solbera OTF font files

### Modified Files
1. **`worker/src/renderers/typst-themes.ts`** — Add `titleFont`, `statFont`, `headerUnderline` to `ThemeDefinition`. Update `dmguild` and `classic-parchment` definitions.
2. **`worker/src/renderers/typst-assembler.ts`** — Update heading show rules (H3 gold underline, H1 no divider), page setup (column-gap, leading, no first-line-indent, paragraph spacing), footer color.
3. **`shared/src/renderers/tiptap-to-typst.ts`** — Update `renderStatBlock()` (top/bottom borders, stat font, section dividers), `renderReadAloudBox()` (border style), `renderSidebarCallout()` (border style), table rendering (stripe color, font).
4. **`client/src/styles/themes/dmguild.css`** — Update CSS custom properties and styles for editor preview.
5. **`client/src/styles/themes/classic-parchment.css`** — Same updates as dmguild CSS.

### Not Changed
- Other 4 themes (dark-tome, clean-modern, fey-wild, infernal)
- Block data models / TipTap extensions
- HTML/EPUB export pipeline (future follow-up)
- Server/API
- Block extension schemas

## Attribution

Solbera's fonts require CC-BY-SA 4.0 attribution. Add attribution to:
- Export PDF footer or credits (when credits page is present)
- Project README or NOTICE file

## Success Criteria

1. PDF export with `dmguild` theme produces output visually matching the Champions of Darkness reference PDF
2. Stat blocks have top/bottom orange borders with warm parchment fill
3. Headings use Mr Eaves Small Caps with H3 gold underline
4. Body text uses Bookinsanity serif font
5. Tables and stat blocks use Scaly Sans
6. Page footer shows gold section name and page number
7. Editor preview remains functional (Google Font approximations)
8. All existing tests pass
9. `classic-parchment` theme gets same treatment
