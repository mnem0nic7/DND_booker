# DMGuild/PHB Layout Matching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the `dmguild` and `classic-parchment` themes to match the official D&D 5e Player's Handbook layout using Solbera community fonts, Homebrewery V3 colors, and PHB-accurate block styling.

**Architecture:** Three layers of change: (1) font assets — add 22 Solbera OTF files, (2) theme definitions — update colors, fonts, and add new variables in `typst-themes.ts`, (3) renderers — update `typst-assembler.ts` for page layout/headings and `tiptap-to-typst.ts` for stat blocks and other D&D blocks. CSS themes updated for editor preview.

**Tech Stack:** Typst (PDF), Solbera DND fonts (CC-BY-SA 4.0), Vitest

---

### Task 1: Install Solbera Font Assets

**Files:**
- Create: `worker/assets/fonts/Bookinsanity.otf` (and 21 more OTF files)
- Create: `worker/assets/FONT-LICENSES.md`

**Step 1: Copy Solbera fonts into worker assets**

```bash
# Clone already done at /tmp/solbera-dnd-fonts
# Copy all OTF files, renaming to remove spaces for simpler paths
cd /tmp/solbera-dnd-fonts
for f in $(find . -name "*.otf"); do
  cp "$f" /home/gallison/workspace/DND_booker/worker/assets/fonts/
done
```

**Step 2: Create font license attribution file**

Create `worker/assets/FONT-LICENSES.md`:
```markdown
# Font Licenses

## Solbera's D&D 5e Fonts
Fonts: Bookinsanity, Mr Eaves Small Caps, Scaly Sans, Scaly Sans Caps,
Nodesto Caps Condensed, Solbera Imitation, Dungeon Drop Case
License: CC-BY-SA 4.0
Source: https://github.com/jonathonf/solbera-dnd-fonts
Attribution: Solbera (solbera.com)
```

**Step 3: Verify fonts are accessible**

```bash
ls -la worker/assets/fonts/*.otf | wc -l
# Expected: 22 (plus existing TTF files)
```

**Step 4: Commit**

```bash
git add worker/assets/fonts/*.otf worker/assets/FONT-LICENSES.md
git commit -m "feat: add Solbera D&D community fonts (CC-BY-SA 4.0)"
```

---

### Task 2: Update Theme Definitions in typst-themes.ts

**Files:**
- Modify: `worker/src/renderers/typst-themes.ts`
- Test: `worker/src/__tests__/typst-assembler.test.ts` (existing tests will break — update them)

**Step 1: Write failing tests for new theme variables**

Add to `worker/src/__tests__/typst-assembler.test.ts`:

```typescript
it('should include stat-font and title-font variables for dmguild theme', () => {
  const source = assembleTypst({
    documents: [],
    theme: 'dmguild',
    projectTitle: 'Test',
  });

  expect(source).toContain('#let stat-font = "Scaly Sans"');
  expect(source).toContain('#let title-font = "Nodesto Caps Condensed"');
  expect(source).toContain('#let theme-header-underline = rgb("#C0AD6A")');
});

it('should include stat-font and title-font variables for classic-parchment theme', () => {
  const source = assembleTypst({
    documents: [],
    theme: 'classic-parchment',
    projectTitle: 'Test',
  });

  expect(source).toContain('#let stat-font = "Scaly Sans"');
  expect(source).toContain('#let title-font = "Nodesto Caps Condensed"');
  expect(source).toContain('#let theme-header-underline = rgb("#C0AD6A")');
});
```

**Step 2: Run tests to verify they fail**

```bash
cd worker && npx vitest run src/__tests__/typst-assembler.test.ts -v
```
Expected: FAIL — `stat-font` and `title-font` not found

**Step 3: Update ThemeDefinition interface and theme data**

In `worker/src/renderers/typst-themes.ts`:

Add three new fields to `ThemeDefinition`:
```typescript
interface ThemeDefinition {
  // ... existing fields ...
  titleFont: string;   // Title pages, chapter headers
  statFont: string;    // Stat blocks, tables, sidebars
  headerUnderline: string; // H3 underline color
}
```

Update `classic-parchment` theme:
```typescript
'classic-parchment': {
  primary: '#58180d',
  secondary: '#c9ad6a',
  bg: '#EEE5CE',       // was #f4e4c1, now matches Homebrewery
  text: '#1a1a1a',
  statBlockBg: '#F2E5B5',    // was #fdf1dc, PHB accurate
  statBlockBorder: '#E69A28',
  readAloudBg: '#FAF7EA',    // was #e8dcc8, PHB descriptive box
  readAloudBorder: '#58180D', // was #5c3a1e, PHB maroon
  sidebarBg: '#E0E5C1',      // was #e8edf3, PHB green accent
  tableHeaderBg: '#58180D',   // was #78350f
  tableStripeBg: '#E0E5C1',   // was #fef3c7, PHB uses green accent
  divider: '#9C2B1B',         // was #8b1a1a, Homebrewery maroon
  spellCardAccent: '#58180D', // was #7c3aed
  magicItemAccent: '#58180D', // was #16a34a
  classFeatureAccent: '#58180D', // was #991b1b
  headingFont: 'Mr Eaves Small Caps',  // was Cinzel
  bodyFont: 'Bookinsanity',            // was Crimson Text
  texture: 'parchment-classic.jpg',
  titleFont: 'Nodesto Caps Condensed',
  statFont: 'Scaly Sans',
  headerUnderline: '#C0AD6A',
},
```

Update `dmguild` theme:
```typescript
'dmguild': {
  primary: '#58180D',
  secondary: '#C9AD6A',
  bg: '#EEE5CE',
  text: '#1a1a1a',
  statBlockBg: '#F2E5B5',    // was #FDF1DC
  statBlockBorder: '#E69A28',
  readAloudBg: '#FAF7EA',
  readAloudBorder: '#58180D',
  sidebarBg: '#E0E5C1',
  tableHeaderBg: '#58180D',
  tableStripeBg: '#E0E5C1',   // was #FDF1DC
  divider: '#9C2B1B',
  spellCardAccent: '#58180D',
  magicItemAccent: '#58180D',
  classFeatureAccent: '#58180D',
  headingFont: 'Mr Eaves Small Caps',  // was Cinzel Decorative
  bodyFont: 'Bookinsanity',            // was Libre Baskerville
  texture: 'parchment-dmguild.jpg',
  titleFont: 'Nodesto Caps Condensed',
  statFont: 'Scaly Sans',
  headerUnderline: '#C0AD6A',
},
```

Add default values for other 4 themes (use their existing heading/body fonts for titleFont/statFont, and their secondary color for headerUnderline):
```typescript
// For dark-tome, clean-modern, fey-wild, infernal:
titleFont: '<same as headingFont>',
statFont: '<same as bodyFont>',
headerUnderline: '<same as secondary>',
```

Update `getTypstThemeVariables()` to emit the three new variables:
```typescript
// Add after the body-font line:
#let title-font = "${t.titleFont}"
#let stat-font = "${t.statFont}"
#let theme-header-underline = rgb("${t.headerUnderline}")
```

**Step 4: Update existing broken tests**

In `typst-assembler.test.ts`, update the assertions that check for old font names:

- Line 15: `expect(source).toContain('#let heading-font = "Cinzel"')` → `expect(source).toContain('#let heading-font = "Mr Eaves Small Caps"')`
- Line 16: `expect(source).toContain('#let body-font = "Crimson Text"')` → `expect(source).toContain('#let body-font = "Bookinsanity"')`
- Line 13: `expect(source).toContain('#let theme-primary = rgb("#58180d")')` stays same
- Line 162: `expect(source).toContain('#let heading-font = "Cinzel Decorative"')` → `expect(source).toContain('#let heading-font = "Mr Eaves Small Caps"')`
- Line 163: `expect(source).toContain('#let body-font = "Libre Baskerville"')` → `expect(source).toContain('#let body-font = "Bookinsanity"')`
- Line 151: margin test stays same (margins change in task 3)

**Step 5: Run tests to verify they pass**

```bash
cd worker && npx vitest run src/__tests__/typst-assembler.test.ts -v
```
Expected: ALL PASS

**Step 6: Commit**

```bash
git add worker/src/renderers/typst-themes.ts worker/src/__tests__/typst-assembler.test.ts
git commit -m "feat: update dmguild and classic-parchment themes to PHB fonts and colors"
```

---

### Task 3: Update Page Layout and Heading Rules in typst-assembler.ts

**Files:**
- Modify: `worker/src/renderers/typst-assembler.ts`
- Modify: `worker/src/__tests__/typst-assembler.test.ts`

**Step 1: Write failing tests for new layout**

Add to `typst-assembler.test.ts`:
```typescript
it('should set column-gutter for page layout', () => {
  const source = assembleTypst({
    documents: [],
    theme: 'dmguild',
    projectTitle: 'Test',
  });
  expect(source).toContain('column-gutter: 0.9cm');
});

it('should set paragraph spacing without first-line indent', () => {
  const source = assembleTypst({
    documents: [],
    theme: 'dmguild',
    projectTitle: 'Test',
  });
  expect(source).toContain('leading: 0.55em');
  expect(source).not.toContain('first-line-indent: 1em');
});

it('should render H3 with gold underline in heading show rules', () => {
  const source = assembleTypst({
    documents: [],
    theme: 'dmguild',
    projectTitle: 'Test',
  });
  expect(source).toContain('theme-header-underline');
  expect(source).toContain('heading.where(level: 3)');
});

it('should render footer text with gold color', () => {
  const source = assembleTypst({
    documents: [],
    theme: 'dmguild',
    projectTitle: 'Test',
  });
  expect(source).toContain('fill: theme-secondary');
  expect(source).toContain('counter(page).display()');
});
```

**Step 2: Run tests to verify they fail**

```bash
cd worker && npx vitest run src/__tests__/typst-assembler.test.ts -v
```

**Step 3: Update assembleTypst() in typst-assembler.ts**

Changes to `assembleTypst()`:

1. **Page setup** — add `column-gutter`:
   ```typescript
   t += `  columns: 2,\n`;
   // ADD:
   t += `  column-gutter: 0.9cm,\n`;
   ```

2. **Margins** — make symmetric:
   Change line 48:
   ```typescript
   // FROM:
   t += `  margin: (top: 0.75in, bottom: 0.75in, inside: 0.75in, outside: 0.625in),\n`;
   // TO:
   t += `  margin: (top: 0.75in, bottom: 0.75in, inside: 0.75in, outside: 0.75in),\n`;
   ```

3. **Footer** — gold colored text:
   Change footer section to use `fill: theme-secondary` on footer text:
   ```typescript
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
   ```

4. **Typography** — remove first-line indent, adjust leading:
   ```typescript
   // FROM:
   t += `#set par(justify: true, first-line-indent: 1em, leading: 0.65em)\n\n`;
   // TO:
   t += `#set par(justify: true, leading: 0.55em, spacing: 0.325cm)\n\n`;
   ```

5. **Heading show rules** — PHB style:
   ```typescript
   // H1: Large, no divider, column-spanning attempted via set
   t += `#show heading.where(level: 1): it => {\n`;
   t += `  set text(font: heading-font, size: 23pt, fill: theme-primary, weight: "bold")\n`;
   t += `  v(12pt)\n`;
   t += `  it.body\n`;
   t += `  v(4pt)\n`;
   t += `}\n\n`;

   // H2: Smaller, no divider
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

   // H4: Small, bold, same color
   t += `#show heading.where(level: 4): it => {\n`;
   t += `  set text(font: heading-font, size: 12pt, fill: theme-primary, weight: "bold")\n`;
   t += `  v(4pt)\n`;
   t += `  it.body\n`;
   t += `  v(2pt)\n`;
   t += `}\n\n`;
   ```

**Step 4: Update existing broken tests**

Update these existing assertions:
- `'should use standard margins when not printReady'` — change `outside: 0.625in` to `outside: 0.75in`
- `'should set justified text'` — update to match `#set par(justify: true` (partial match still works)
- `'should set text font and size'` — stays same
- `'should include heading show rules'` — stays same (still checks `heading.where(level: 1)` etc.)
- H1 divider test (line 81 check for `theme-divider` in heading rule): H1 no longer has `theme-divider`, but H3 has `theme-header-underline`. Verify the test for `'should include heading show rules with theme colors'` still passes since it just checks for `fill: theme-primary`.

**Step 5: Run tests**

```bash
cd worker && npx vitest run src/__tests__/typst-assembler.test.ts -v
```
Expected: ALL PASS

**Step 6: Commit**

```bash
git add worker/src/renderers/typst-assembler.ts worker/src/__tests__/typst-assembler.test.ts
git commit -m "feat: update page layout, headings, and footer to PHB style"
```

---

### Task 4: Update Stat Block Renderer in tiptap-to-typst.ts

**Files:**
- Modify: `shared/src/renderers/tiptap-to-typst.ts` (lines 255-367: `renderStatBlock`)
- Modify: `worker/src/__tests__/tiptap-to-typst.test.ts`

**Step 1: Write failing test for new stat block style**

Add to `tiptap-to-typst.test.ts` in the `statBlock` describe:

```typescript
it('should use top/bottom borders instead of left border', () => {
  const result = renderTypstNode(node({
    type: 'statBlock',
    attrs: {
      name: 'Goblin', size: 'Small', type: 'humanoid', alignment: 'NE',
      ac: 15, hp: 7, speed: '30 ft.', str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    },
  }));
  expect(result).toContain('stroke: (top: 4pt + theme-stat-block-border, bottom: 4pt + theme-stat-block-border)');
  expect(result).not.toContain('stroke: (left:');
});

it('should use stat-font for stat block content', () => {
  const result = renderTypstNode(node({
    type: 'statBlock',
    attrs: {
      name: 'Goblin', size: 'Small', type: 'humanoid', alignment: 'NE',
      ac: 15, hp: 7, speed: '30 ft.', str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    },
  }));
  expect(result).toContain('font: stat-font');
});

it('should render section headers with maroon color', () => {
  const result = renderTypstNode(node({
    type: 'statBlock',
    attrs: {
      name: 'Dragon', size: 'Huge', type: 'dragon', alignment: 'CE',
      ac: 19, hp: 256, speed: '40 ft., fly 80 ft.',
      str: 23, dex: 10, con: 21, int: 14, wis: 11, cha: 19,
      actions: JSON.stringify([{ name: 'Bite', description: 'Melee attack' }]),
    },
  }));
  expect(result).toContain('fill: theme-primary');
  expect(result).toContain('Actions');
});
```

**Step 2: Run tests to verify they fail**

```bash
cd worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts -v
```

**Step 3: Rewrite renderStatBlock()**

Replace the `renderStatBlock` function (lines 255-367) with:

```typescript
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

  let t = '';
  // PHB-style: top/bottom orange borders, no radius, warm parchment fill
  t += `#block(width: 100%, fill: theme-stat-block-bg, stroke: (top: 4pt + theme-stat-block-border, bottom: 4pt + theme-stat-block-border), inset: 12pt)[\n`;
  t += `  #set text(font: stat-font)\n`;

  // Header — creature name
  t += `  #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
  t += `  #text(size: 9pt, style: "italic")[${size} ${type}, ${alignment}]\n`;
  t += `  #line(length: 100%, stroke: 1.5pt + theme-primary)\n`;

  // Core stats
  t += `  *Armor Class* ${ac}${acType ? ` (${escapeTypst(acType)})` : ''}\n`;
  t += `  *Hit Points* ${hp}${hitDice ? ` (${escapeTypst(hitDice)})` : ''}\n`;
  t += `  *Speed* ${speed}\n`;
  t += `  #line(length: 100%, stroke: 1.5pt + theme-primary)\n`;

  // Ability scores table
  t += `  #table(\n`;
  t += `    columns: (1fr, 1fr, 1fr, 1fr, 1fr, 1fr),\n`;
  t += `    align: center,\n`;
  t += `    stroke: none,\n`;
  const headerCells: string[] = [];
  const scoreCells: string[] = [];
  for (let i = 0; i < abilityNames.length; i++) {
    const score = Number(attrs[abilityNames[i]]) || 10;
    headerCells.push(`[*${abilityLabels[i]}*]`);
    scoreCells.push(`[${score} (${getModifier(score)})]`);
  }
  t += `    ${headerCells.join(', ')},\n`;
  t += `    ${scoreCells.join(', ')},\n`;
  t += `  )\n`;
  t += `  #line(length: 100%, stroke: 1.5pt + theme-primary)\n`;

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
      t += `  *${label}* ${escapeTypst(value)}\n`;
    }
  }

  // Challenge rating
  const cr = String(attrs.cr || '');
  const xp = String(attrs.xp || '');
  if (cr || xp) {
    t += `  *Challenge* ${escapeTypst(cr)}${xp ? ` (${escapeTypst(xp)} XP)` : ''}\n`;
  }

  // Traits
  const traits = parseJsonArray<NameDesc>(String(attrs.traits || '[]'));
  if (traits.length > 0) {
    t += `  #line(length: 100%, stroke: 1.5pt + theme-primary)\n`;
    for (const trait of traits) {
      t += `  _*${escapeTypst(trait.name)}.*_ ${escapeTypst(trait.description)}\n\n`;
    }
  }

  // Actions
  const actions = parseJsonArray<NameDesc>(String(attrs.actions || '[]'));
  if (actions.length > 0) {
    t += `  #text(size: 14pt, weight: "bold", fill: theme-primary)[Actions]\n`;
    t += `  #line(length: 100%, stroke: 0.5pt + theme-primary)\n`;
    for (const action of actions) {
      t += `  _*${escapeTypst(action.name)}.*_ ${escapeTypst(action.description)}\n\n`;
    }
  }

  // Reactions
  const reactions = parseJsonArray<NameDesc>(String(attrs.reactions || '[]'));
  if (reactions.length > 0) {
    t += `  #text(size: 14pt, weight: "bold", fill: theme-primary)[Reactions]\n`;
    t += `  #line(length: 100%, stroke: 0.5pt + theme-primary)\n`;
    for (const reaction of reactions) {
      t += `  _*${escapeTypst(reaction.name)}.*_ ${escapeTypst(reaction.description)}\n\n`;
    }
  }

  // Legendary Actions
  const legendaryActions = parseJsonArray<NameDesc>(String(attrs.legendaryActions || '[]'));
  if (legendaryActions.length > 0) {
    t += `  #text(size: 14pt, weight: "bold", fill: theme-primary)[Legendary Actions]\n`;
    t += `  #line(length: 100%, stroke: 0.5pt + theme-primary)\n`;
    const legendaryDescription = String(attrs.legendaryDescription || '');
    if (legendaryDescription) {
      t += `  ${escapeTypst(legendaryDescription)}\n\n`;
    }
    for (const la of legendaryActions) {
      t += `  _*${escapeTypst(la.name)}.*_ ${escapeTypst(la.description)}\n\n`;
    }
  }

  t += `]\n\n`;
  return t;
}
```

Key changes:
- `stroke: (left: 3pt ...)` → `stroke: (top: 4pt ..., bottom: 4pt ...)`
- Removed `radius: 2pt`
- Added `#set text(font: stat-font)` inside the block
- Section dividers use `1.5pt + theme-primary` (maroon, not theme-divider)
- Section headers ("Actions" etc.) get `fill: theme-primary`
- Added thin rule under section headers: `0.5pt + theme-primary`
- Trait/action names: `_*Name.*_` (bold italic) instead of just `*Name.*` (bold only)

**Step 4: Update existing stat block test assertions**

The existing test at line 283 checks `expect(result).toContain('#block(')` — still passes.
The test at line 284 checks `toContain('theme-stat-block-bg')` — still passes.
No existing test checks for `stroke: (left:` specifically, so nothing else breaks.

**Step 5: Run tests**

```bash
cd worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts -v
```
Expected: ALL PASS

**Step 6: Commit**

```bash
git add shared/src/renderers/tiptap-to-typst.ts worker/src/__tests__/tiptap-to-typst.test.ts
git commit -m "feat: update stat block to PHB style (top/bottom borders, stat font)"
```

---

### Task 5: Update Read-Aloud Box, Sidebar, and Table Renderers

**Files:**
- Modify: `shared/src/renderers/tiptap-to-typst.ts` (renderReadAloudBox, renderSidebarCallout, renderRandomTable, renderEncounterTable)
- Modify: `worker/src/__tests__/tiptap-to-typst.test.ts`

**Step 1: Write failing tests**

Add to `tiptap-to-typst.test.ts`:

```typescript
// In readAloudBox describe:
it('should use full border instead of left-only for read-aloud', () => {
  const result = renderTypstNode(node({
    type: 'readAloudBox',
    attrs: {},
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You see a cave.' }] }],
  }));
  expect(result).toContain('stroke: 1pt + theme-read-aloud-border');
  expect(result).not.toContain('stroke: (left:');
});

// In sidebarCallout describe:
it('should use full border for sidebar', () => {
  const result = renderTypstNode(node({
    type: 'sidebarCallout',
    attrs: { title: 'Note' },
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Info' }] }],
  }));
  expect(result).toContain('stroke: 1pt + theme-primary');
  expect(result).toContain('font: stat-font');
});
```

**Step 2: Run tests to verify they fail**

```bash
cd worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts -v
```

**Step 3: Update renderReadAloudBox**

```typescript
function renderReadAloudBox(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  let t = '';
  t += `#block(width: 100%, fill: theme-read-aloud-bg, stroke: 1pt + theme-read-aloud-border, inset: 12pt)[\n`;
  t += `  #set text(font: stat-font)\n`;
  t += `  ${renderInlineChildren(content)}\n`;
  t += `]\n\n`;
  return t;
}
```

Changes: Full border instead of left-only. Removed "Read Aloud" label (PHB doesn't label it). Added stat-font. Removed radius.

**Step 4: Update renderSidebarCallout**

```typescript
function renderSidebarCallout(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  const title = escapeTypst(String(attrs.title || 'Note'));

  let t = '';
  t += `#block(width: 100%, fill: theme-sidebar-bg, stroke: 1pt + theme-primary, inset: 12pt)[\n`;
  t += `  #set text(font: stat-font)\n`;
  t += `  #text(font: heading-font, weight: "bold", size: 12pt)[${title}]\n`;
  t += `  ${renderInlineChildren(content)}\n`;
  t += `]\n\n`;
  return t;
}
```

Changes: Added border. Added stat-font. Removed radius.

**Step 5: Update renderRandomTable and renderEncounterTable**

For `renderRandomTable`, add `#set text(font: stat-font)` inside the block. Same for `renderEncounterTable`.

**Step 6: Update existing tests if needed**

The readAloudBox test checks for `theme-read-aloud-bg` (still present), `theme-read-aloud-border` (still present), and `Read Aloud` (REMOVED — update test):

```typescript
// Remove this assertion:
// expect(result).toContain('Read Aloud');
```

The sidebarCallout test checks `theme-sidebar-bg` (still present), `DM Tip` (still present), `Be creative!` (still present) — all fine.

**Step 7: Run tests**

```bash
cd worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts -v
```
Expected: ALL PASS

**Step 8: Commit**

```bash
git add shared/src/renderers/tiptap-to-typst.ts worker/src/__tests__/tiptap-to-typst.test.ts
git commit -m "feat: update read-aloud, sidebar, and table blocks to PHB style"
```

---

### Task 6: Update Title Page and Chapter Header Renderers

**Files:**
- Modify: `shared/src/renderers/tiptap-to-typst.ts` (renderTitlePage, renderChapterHeader, renderTableOfContents)

**Step 1: Update renderTitlePage to use title-font**

In `renderTitlePage`, change:
```typescript
// FROM:
t += `  #text(font: heading-font, size: 28pt, weight: "bold")[${title}]\n`;
// TO:
t += `  #text(font: title-font, size: 28pt, weight: "bold")[${title}]\n`;
```

**Step 2: Update renderChapterHeader to use title-font**

```typescript
// FROM:
t += `#text(font: heading-font, size: 14pt, fill: theme-secondary)[${escapeTypst(chapterNumber)}]\n\n`;
// TO:
t += `#text(font: title-font, size: 14pt, fill: theme-secondary)[${escapeTypst(chapterNumber)}]\n\n`;
```

**Step 3: Update renderTableOfContents to use title-font**

```typescript
// FROM:
t += `#text(font: heading-font, size: 20pt, weight: "bold")[${title}]\n\n`;
// TO:
t += `#text(font: title-font, size: 20pt, weight: "bold")[${title}]\n\n`;
```

**Step 4: Run tests**

```bash
cd worker && npx vitest run src/__tests__/tiptap-to-typst.test.ts -v
```
Expected: ALL PASS (existing tests check for text content, not specific font names)

**Step 5: Commit**

```bash
git add shared/src/renderers/tiptap-to-typst.ts
git commit -m "feat: use title-font for title page, chapter headers, and TOC"
```

---

### Task 7: Update Client CSS Themes

**Files:**
- Modify: `client/src/styles/themes/dmguild.css`
- Modify: `client/src/styles/themes/classic-parchment.css`

**Step 1: Update dmguild.css**

Key changes:
- Update `--stat-block-bg` to `#F2E5B5`
- Update `--table-stripe-bg` to `#E0E5C1`
- Keep heading font as Google Fonts approximation: `'Cinzel', serif` (since Solbera fonts aren't on Google Fonts)
- Update H3 underline to gold
- Update stat block border styling in CSS if needed

```css
[data-theme="dmguild"] {
  --page-bg: #EEE5CE;
  --text-color: #1a1a1a;
  --heading-font: 'Cinzel', serif;
  --body-font: 'Libre Baskerville', serif;
  --accent-color: #58180D;
  --accent-secondary: #C9AD6A;
  --stat-block-bg: #F2E5B5;
  --stat-block-border: #E69A28;
  --callout-bg: #E0E5C1;
  --read-aloud-bg: #FAF7EA;
  --read-aloud-border: #58180D;
  --sidebar-bg: #E0E5C1;
  --table-header-bg: #58180D;
  --table-stripe-bg: #E0E5C1;
  --border-decoration: #9C2B1B;
  --spell-card-accent: #58180D;
  --magic-item-accent: #58180D;
  --class-feature-accent: #58180D;
  --encounter-accent: #58180D;
  --page-texture: url('/textures/parchment-dmguild.jpg');
  --column-rule-color: rgba(0, 0, 0, 0.06);
  --footer-color: #C9AD6A;
  --drop-cap-font: 'Cinzel Decorative', 'Cinzel', serif;
  --paragraph-indent: 0;
  --divider-ornament: '';
  --divider-gradient: linear-gradient(to right, transparent, #9C2B1B 15%, #9C2B1B 85%, transparent);
  --divider-height: 4px;
  --blockquote-border: 3px solid #C9AD6A;
  --blockquote-bg: rgba(201, 173, 106, 0.08);
  --h1-border-bottom: none;
  --h1-padding-bottom: 0;
  --h3-border-bottom: 2px solid #C0AD6A;
}
```

Update heading rules:
- Remove `border-bottom` from H1 selectors
- Add `border-bottom: 2px solid #C0AD6A` to H3 selectors

**Step 2: Update classic-parchment.css**

Apply same color/variable changes as dmguild:
- `--stat-block-bg: #F2E5B5`
- `--read-aloud-bg: #FAF7EA`
- `--read-aloud-border: #58180D`
- `--sidebar-bg: #E0E5C1`
- `--table-header-bg: #58180D`
- `--table-stripe-bg: #E0E5C1`
- `--border-decoration: #9C2B1B`
- `--spell-card-accent: #58180D` etc.
- Remove H1 border, add H3 gold underline
- `--paragraph-indent: 0`

**Step 3: Verify client builds**

```bash
cd client && npx tsc --noEmit
```
Expected: no type errors (CSS only changes)

**Step 4: Commit**

```bash
git add client/src/styles/themes/dmguild.css client/src/styles/themes/classic-parchment.css
git commit -m "feat: update dmguild and classic-parchment CSS to PHB colors and layout"
```

---

### Task 8: Run Full Test Suite and Visual Verification

**Files:** None (verification only)

**Step 1: Run all worker tests**

```bash
cd worker && npx vitest run -v
```
Expected: ALL PASS

**Step 2: Run shared type checks**

```bash
npm run typecheck --workspace=shared
```

**Step 3: Run client type checks**

```bash
cd client && npx tsc --noEmit
```

**Step 4: Run server tests (smoke check)**

```bash
cd server && npx vitest run -v
```

**Step 5: Visual verification (manual)**

Start dev servers and create a test document with:
- A stat block
- A read-aloud box
- A sidebar note
- H1, H2, H3 headings
- A table

Export as PDF with dmguild theme and compare against Champions of Darkness reference PDF.

**Step 6: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: address visual verification feedback"
```
