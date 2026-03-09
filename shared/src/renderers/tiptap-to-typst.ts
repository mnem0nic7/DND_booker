/**
 * Shared TipTap JSON to Typst renderer.
 * Used by the worker for Typst-based PDF export.
 * Converts TipTap document JSON into a Typst markup string.
 *
 * Parallel to tiptap-to-html.ts — handles the same node types.
 *
 * Theme variables (e.g. theme-primary, heading-font) are assumed to be
 * defined by the Typst assembler and referenced here via Typst variables.
 */

import type { DocumentContent } from '../types/document';
import { escapeTypst, escapeTypstUrl } from './utils.js';

type TipTapNode = DocumentContent;

interface NameDesc {
  name: string;
  description?: string;
  desc?: string;
}

// ── Helper Functions ──

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

function getNameDescDescription(entry: NameDesc | null | undefined): string {
  return String(entry?.description ?? entry?.desc ?? '');
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

/** Apply Typst inline marks around text content. Text is escaped unless inside a code mark. */
function renderMarks(text: string, marks?: TipTapNode['marks']): string {
  // Check if code mark is present — if so, don't escape text
  const hasCode = marks?.some((m) => m.type === 'code') ?? false;
  let result = hasCode ? text : escapeTypst(text);

  if (!marks || marks.length === 0) return result;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `*${result}*`;
        break;
      case 'italic':
        result = `_${result}_`;
        break;
      case 'strike':
        result = `#strike[${result}]`;
        break;
      case 'code':
        // Wrap in raw backticks — text is not escaped inside code
        result = `\`${result}\``;
        break;
      case 'underline':
        result = `#underline[${result}]`;
        break;
      case 'superscript':
        result = `#super[${result}]`;
        break;
      case 'subscript':
        result = `#sub[${result}]`;
        break;
      case 'highlight': {
        const color = String(mark.attrs?.color || 'yellow');
        result = `#highlight(fill: rgb("${escapeTypst(color)}"))[${result}]`;
        break;
      }
      case 'textStyle': {
        const fontSize = mark.attrs?.fontSize ? String(mark.attrs.fontSize) : null;
        if (fontSize) {
          result = `#text(size: ${escapeTypst(fontSize)})[${result}]`;
        }
        break;
      }
      case 'link': {
        const href = String(mark.attrs?.href || '');
        result = `#link("${escapeTypstUrl(href)}")[${result}]`;
        break;
      }
      default:
        // Unknown mark type — skip silently
        break;
    }
  }

  return result;
}

/** Recursively render an array of TipTap nodes to Typst. */
function renderChildren(nodes?: TipTapNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map((node) => renderTypstNodeImpl(node)).join('');
}

/**
 * Render inline children and strip trailing newlines.
 * Useful when injecting content inside Typst function arguments like #block[...].
 */
function renderInlineChildren(nodes?: TipTapNode[]): string {
  return renderChildren(nodes).replace(/\n+$/, '');
}

// ── List Item Renderers ──

function renderBulletListItems(nodes?: TipTapNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes
    .map((item) => {
      const content = renderInlineChildren(item.content);
      return `- ${content}\n`;
    })
    .join('');
}

function renderOrderedListItems(nodes?: TipTapNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes
    .map((item) => {
      const content = renderInlineChildren(item.content);
      return `+ ${content}\n`;
    })
    .join('');
}

// ── Main Node Renderer ──

/** Internal implementation of the node renderer. */
function renderTypstNodeImpl(node: TipTapNode): string {
  const attrs = node.attrs || {};

  switch (node.type) {
    // ── Text node ──
    case 'text':
      return renderMarks(node.text || '', node.marks);

    // ── Basic blocks ──
    case 'paragraph': {
      const content = renderChildren(node.content);
      if (!content) return '\n';
      if (attrs.dropCap && content.length > 0) {
        // Extract first visible character for drop cap styling
        const first = content.charAt(0);
        const rest = content.slice(1);
        return `#text(size: 36pt, font: title-font, fill: theme-primary)[${first}]${rest}\n\n`;
      }
      return `${content}\n\n`;
    }

    case 'heading': {
      const level = Number(attrs.level) || 1;
      const prefix = '='.repeat(Math.min(Math.max(level, 1), 6));
      return `${prefix} ${renderInlineChildren(node.content)}\n\n`;
    }

    case 'bulletList':
      return renderBulletListItems(node.content) + '\n';

    case 'orderedList':
      return renderOrderedListItems(node.content) + '\n';

    case 'listItem':
      // Should not be reached directly — handled by list renderers above
      return renderInlineChildren(node.content) + '\n';

    case 'blockquote':
      return `#quote[${renderInlineChildren(node.content)}]\n\n`;

    case 'codeBlock': {
      const language = String(attrs.language || '');
      const content = renderInlineChildren(node.content);
      if (language) {
        return `\`\`\`${language}\n${content}\n\`\`\`\n\n`;
      }
      return `\`\`\`\n${content}\n\`\`\`\n\n`;
    }

    case 'horizontalRule':
      return `#line(length: 100%)\n\n`;

    case 'hardBreak':
      return `#linebreak()\n`;

    case 'pageBreak':
      return `#pagebreak()\n`;

    case 'columnBreak':
      return `#colbreak()\n`;

    // ── D&D Blocks ──
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

    // ── Unknown node type — render children if present ──
    default:
      return renderChildren(node.content);
  }
}

// ── D&D Block Renderers ──

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
  t += `#block(width: 100%, fill: theme-stat-block-bg, stroke: (top: 4pt + theme-stat-block-border, bottom: 4pt + theme-stat-block-border), inset: 12pt)[\n`;
  t += `  #set text(font: stat-font)\n`;

  // Header
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
      t += `  _*${escapeTypst(trait.name)}.*_ ${escapeTypst(getNameDescDescription(trait))}\n\n`;
    }
  }

  // Actions
  const actions = parseJsonArray<NameDesc>(String(attrs.actions || '[]'));
  if (actions.length > 0) {
    t += `  #text(size: 14pt, weight: "bold", fill: theme-primary)[Actions]\n`;
    t += `  #line(length: 100%, stroke: 0.5pt + theme-primary)\n`;
    for (const action of actions) {
      t += `  _*${escapeTypst(action.name)}.*_ ${escapeTypst(getNameDescDescription(action))}\n\n`;
    }
  }

  // Reactions
  const reactions = parseJsonArray<NameDesc>(String(attrs.reactions || '[]'));
  if (reactions.length > 0) {
    t += `  #text(size: 14pt, weight: "bold", fill: theme-primary)[Reactions]\n`;
    t += `  #line(length: 100%, stroke: 0.5pt + theme-primary)\n`;
    for (const reaction of reactions) {
      t += `  _*${escapeTypst(reaction.name)}.*_ ${escapeTypst(getNameDescDescription(reaction))}\n\n`;
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
      t += `  _*${escapeTypst(la.name)}.*_ ${escapeTypst(getNameDescDescription(la))}\n\n`;
    }
  }

  t += `]\n\n`;
  return t;
}

function renderReadAloudBox(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  let t = '';
  t += `#block(width: 100%, fill: theme-read-aloud-bg, stroke: 1pt + theme-read-aloud-border, inset: 12pt)[\n`;
  t += `  #set text(font: stat-font)\n`;
  t += `  ${renderInlineChildren(content)}\n`;
  t += `]\n\n`;
  return t;
}

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

function renderChapterHeader(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const subtitle = String(attrs.subtitle || '');
  const chapterNumber = String(attrs.chapterNumber || '');

  let t = '';
  if (chapterNumber) {
    t += `#text(font: title-font, size: 14pt, fill: theme-secondary)[${escapeTypst(chapterNumber)}]\n\n`;
  }
  t += `= ${title}\n\n`;
  t += `#line(length: 100%, stroke: theme-divider)\n\n`;
  if (subtitle) {
    t += `#text(style: "italic")[${escapeTypst(subtitle)}]\n\n`;
  }
  return t;
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

  let t = '';
  t += `#block(width: 100%, stroke: (top: 2pt + theme-spell-card-accent, bottom: 2pt + theme-spell-card-accent), inset: 12pt)[\n`;
  t += `  #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
  t += `  #text(style: "italic")[${escapeTypst(levelLabel(level, school))}]\n`;
  t += `  #line(length: 100%, stroke: theme-divider)\n`;
  t += `  *Casting Time* ${castingTime}\n`;
  t += `  *Range* ${range}\n`;
  t += `  *Components* ${components}\n`;
  t += `  *Duration* ${duration}\n`;
  t += `  #line(length: 100%, stroke: theme-divider)\n`;
  t += `  ${description}\n`;
  if (higherLevels) {
    t += `  *At Higher Levels.* ${escapeTypst(higherLevels)}\n`;
  }
  t += `]\n\n`;
  return t;
}

function renderMagicItem(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const type = String(attrs.type || 'wondrous');
  const rarity = String(attrs.rarity || 'uncommon');
  const requiresAttunement = Boolean(attrs.requiresAttunement);
  const attunementRequirement = String(attrs.attunementRequirement || '');
  const description = escapeTypst(String(attrs.description || ''));
  const properties = String(attrs.properties || '');

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const rarityText = rarityLabel(rarity);
  let subtitle = `${typeLabel}, ${rarityText}`;
  if (requiresAttunement) {
    subtitle += attunementRequirement
      ? ` (requires attunement ${attunementRequirement})`
      : ' (requires attunement)';
  }

  let t = '';
  t += `#block(width: 100%, stroke: (top: 2pt + theme-magic-item-accent), inset: 12pt)[\n`;
  t += `  #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
  t += `  #text(style: "italic")[${escapeTypst(subtitle)}]\n`;
  t += `  #line(length: 100%, stroke: theme-divider)\n`;
  t += `  ${description}\n`;
  if (properties) {
    t += `  ${escapeTypst(properties)}\n`;
  }
  t += `]\n\n`;
  return t;
}

function renderRandomTable(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const dieType = escapeTypst(String(attrs.dieType || 'd6'));
  const entries = parseJsonArray<{ roll: string; result: string }>(String(attrs.entries || '[]'));

  let t = '';
  t += `#block(width: 100%, inset: 0pt)[\n`;
  t += `  #set text(font: stat-font)\n`;
  t += `  #text(font: heading-font, size: 14pt, weight: "bold")[${title}] #h(1fr) #text(size: 10pt)[${dieType}]\n\n`;
  t += `  #table(\n`;
  t += `    columns: (auto, 1fr),\n`;
  t += `    fill: (_, row) => if row == 0 { theme-table-header-bg } else if calc.rem(row, 2) == 0 { theme-table-stripe-bg } else { none },\n`;
  t += `    [*${dieType}*], [*Result*],\n`;
  for (const entry of entries) {
    t += `    [${escapeTypst(entry.roll)}], [${escapeTypst(entry.result)}],\n`;
  }
  t += `  )\n`;
  t += `]\n\n`;
  return t;
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

  let t = '';
  t += `#block(width: 100%, stroke: theme-primary + 1pt, inset: 12pt, radius: 2pt)[\n`;

  // Header with optional portrait
  if (portraitUrl) {
    t += `  #grid(columns: (60pt, 1fr), gutter: 12pt,\n`;
    t += `    image("${escapeTypstUrl(portraitUrl)}", width: 60pt),\n`;
    t += `    [\n`;
    t += `      #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
    t += `      #text(style: "italic")[${race} ${npcClass}]\n`;
    t += `    ]\n`;
    t += `  )\n`;
  } else {
    t += `  #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
    t += `  #text(style: "italic")[${race} ${npcClass}]\n`;
  }

  t += `  #line(length: 100%, stroke: theme-divider)\n`;

  if (description) {
    t += `  ${escapeTypst(description)}\n\n`;
  }

  // Personality section
  if (personalityTraits) {
    t += `  *Personality Traits.* ${escapeTypst(personalityTraits)}\n\n`;
  }
  if (ideals) {
    t += `  *Ideals.* ${escapeTypst(ideals)}\n\n`;
  }
  if (bonds) {
    t += `  *Bonds.* ${escapeTypst(bonds)}\n\n`;
  }
  if (flaws) {
    t += `  *Flaws.* ${escapeTypst(flaws)}\n\n`;
  }

  t += `]\n\n`;
  return t;
}

function renderEncounterTable(attrs: Record<string, unknown>): string {
  const environment = escapeTypst(String(attrs.environment || ''));
  const crRange = escapeTypst(String(attrs.crRange || ''));
  const entries = parseJsonArray<{ weight: number; description: string; cr: string }>(String(attrs.entries || '[]'));

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);

  let t = '';
  t += `#block(width: 100%, inset: 0pt)[\n`;
  t += `  #set text(font: stat-font)\n`;
  t += `  #text(font: heading-font, size: 14pt, weight: "bold")[${environment} Encounters]\n`;
  t += `  #text(size: 10pt)[CR Range: ${crRange}]\n\n`;
  t += `  #table(\n`;
  t += `    columns: (auto, 1fr, auto),\n`;
  t += `    fill: (_, row) => if row == 0 { theme-table-header-bg } else if calc.rem(row, 2) == 0 { theme-table-stripe-bg } else { none },\n`;
  t += `    [*d${totalWeight}*], [*Encounter*], [*CR*],\n`;

  let running = 0;
  for (const entry of entries) {
    const from = running + 1;
    running += entry.weight;
    const to = running;
    const rl = from === to ? `${from}` : `${from}\u2013${to}`;
    t += `    [${rl}], [${escapeTypst(entry.description)}], [${escapeTypst(entry.cr)}],\n`;
  }

  t += `  )\n`;
  t += `]\n\n`;
  return t;
}

function renderClassFeature(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const level = Number(attrs.level) || 1;
  const className = escapeTypst(String(attrs.className || ''));
  const description = escapeTypst(String(attrs.description || ''));

  let t = '';
  t += `#block(width: 100%, stroke: (left: 3pt + theme-class-feature-accent), inset: 12pt, radius: 2pt)[\n`;
  t += `  #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
  t += `  #text(style: "italic")[Level ${level} ${className} Feature]\n`;
  t += `  #line(length: 100%, stroke: theme-divider)\n`;
  t += `  ${description}\n`;
  t += `]\n\n`;
  return t;
}

function renderRaceBlock(attrs: Record<string, unknown>): string {
  const name = escapeTypst(String(attrs.name || ''));
  const abilityScoreIncreases = escapeTypst(String(attrs.abilityScoreIncreases || ''));
  const size = escapeTypst(String(attrs.size || ''));
  const speed = escapeTypst(String(attrs.speed || ''));
  const languages = escapeTypst(String(attrs.languages || ''));
  const features = parseJsonArray<NameDesc>(String(attrs.features || '[]'));

  let t = '';
  t += `#block(width: 100%, stroke: theme-primary + 1pt, inset: 12pt, radius: 2pt)[\n`;
  t += `  #text(font: heading-font, size: 16pt, weight: "bold")[${name}]\n`;
  t += `  #line(length: 100%, stroke: theme-divider)\n`;
  t += `  *Ability Score Increase.* ${abilityScoreIncreases}\n\n`;
  t += `  *Size.* ${size}\n\n`;
  t += `  *Speed.* ${speed}\n\n`;
  t += `  *Languages.* ${languages}\n\n`;

  if (features.length > 0) {
    t += `  #line(length: 100%, stroke: theme-divider)\n`;
    t += `  #text(size: 14pt, weight: "bold")[Racial Features]\n`;
    for (const feature of features) {
      t += `  *${escapeTypst(feature.name)}.* ${escapeTypst(getNameDescDescription(feature))}\n\n`;
    }
  }

  t += `]\n\n`;
  return t;
}

// ── Layout Block Renderers ──

function renderFullBleedImage(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  const caption = String(attrs.caption || '');

  let t = '';
  if (src) {
    t += `#figure(\n`;
    t += `  image("${escapeTypstUrl(src)}", width: 100%),\n`;
    if (caption) {
      t += `  caption: [${escapeTypst(caption)}],\n`;
    }
    t += `)\n\n`;
  }
  return t;
}

function renderMapBlock(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  const scale = String(attrs.scale || '');
  const keyEntries = parseJsonArray<{ label: string; description: string }>(String(attrs.keyEntries || '[]'));

  let t = '';
  t += `#block(width: 100%, inset: 8pt)[\n`;
  if (src) {
    t += `  #image("${escapeTypstUrl(src)}", width: 100%)\n`;
  }
  if (scale) {
    t += `  #text(size: 9pt, style: "italic")[Scale: ${escapeTypst(scale)}]\n`;
  }
  if (keyEntries.length > 0) {
    t += `  #text(weight: "bold")[Map Key]\n`;
    for (const entry of keyEntries) {
      t += `  *${escapeTypst(entry.label)}.* ${escapeTypst(entry.description)}\n\n`;
    }
  }
  t += `]\n\n`;
  return t;
}

function renderHandout(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const content = escapeTypst(String(attrs.content || ''));

  let t = '';
  t += `#block(width: 100%, fill: luma(245), inset: 16pt, radius: 4pt)[\n`;
  t += `  #text(font: heading-font, weight: "bold", size: 14pt)[${title}]\n\n`;
  t += `  ${content}\n`;
  t += `]\n\n`;
  return t;
}

function renderPageBorder(attrs: Record<string, unknown>): string {
  const borderStyle = String(attrs.borderStyle || 'simple');
  // Page borders in Typst are decorative — we emit a comment marker for the assembler
  return `// page-border: ${escapeTypst(borderStyle)}\n#line(length: 100%, stroke: theme-divider)\n\n`;
}

// ── Structure Block Renderers ──

function renderTitlePage(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || ''));
  const subtitle = String(attrs.subtitle || '');
  const author = String(attrs.author || '');
  const coverImageUrl = String(attrs.coverImageUrl || '');

  let t = '';
  t += `#set page(columns: 1)\n`;
  t += `#align(center)[\n`;

  if (coverImageUrl) {
    t += `  #image("${escapeTypstUrl(coverImageUrl)}", width: 80%)\n`;
    t += `  #v(1fr)\n`;
  } else {
    t += `  #v(1fr)\n`;
  }

  t += `  #text(font: title-font, size: 28pt, weight: "bold")[${title}]\n`;
  if (subtitle) {
    t += `  #v(8pt)\n`;
    t += `  #text(size: 16pt, style: "italic")[${escapeTypst(subtitle)}]\n`;
  }
  t += `  #v(12pt)\n`;
  t += `  \\u{2726}\n`; // ornament
  if (author) {
    t += `  #v(8pt)\n`;
    t += `  #text(size: 12pt)[by ${escapeTypst(author)}]\n`;
  }
  t += `  #v(1fr)\n`;
  t += `]\n`;
  t += `#pagebreak()\n`;
  t += `#set page(columns: 2)\n\n`;
  return t;
}

function renderTableOfContents(attrs: Record<string, unknown>): string {
  const title = escapeTypst(String(attrs.title || 'Table of Contents'));

  let t = '';
  t += `#set page(columns: 1)\n`;
  t += `#text(font: title-font, size: 20pt, weight: "bold")[${title}]\n\n`;
  t += `#outline(title: none, depth: 3)\n\n`;
  t += `#pagebreak()\n`;
  t += `#set page(columns: 2)\n\n`;
  return t;
}

function renderCreditsPage(attrs: Record<string, unknown>): string {
  const credits = String(attrs.credits || '');
  const legalText = escapeTypst(String(attrs.legalText || ''));
  const copyrightYear = escapeTypst(String(attrs.copyrightYear || ''));

  let t = '';
  t += `#set page(columns: 1)\n`;
  t += `#align(center)[\n`;
  t += `  #text(font: title-font, size: 20pt, weight: "bold")[Credits]\n\n`;

  const lines = credits.split('\n');
  for (const line of lines) {
    t += `  ${escapeTypst(line)}\n\n`;
  }

  t += `  #line(length: 60%, stroke: theme-divider)\n\n`;
  t += `  #text(size: 10pt, weight: "bold")[Legal]\n\n`;
  t += `  #text(size: 8pt)[${legalText}]\n\n`;
  t += `  #text(size: 8pt)[\\u{00A9} ${copyrightYear} All rights reserved.]\n`;
  t += `]\n`;
  t += `#pagebreak()\n`;
  t += `#set page(columns: 2)\n\n`;
  return t;
}

function renderBackCover(attrs: Record<string, unknown>): string {
  const blurb = escapeTypst(String(attrs.blurb || ''));
  const authorBio = escapeTypst(String(attrs.authorBio || ''));
  const authorImageUrl = String(attrs.authorImageUrl || '');

  let t = '';
  t += `#set page(columns: 1)\n`;
  t += `#align(center)[\n`;
  t += `  #v(1fr)\n`;
  t += `  #text(size: 12pt)[${blurb}]\n\n`;
  t += `  #v(12pt)\n`;
  t += `  \\u{2726} \\u{2726} \\u{2726}\n\n`; // ornaments
  t += `  #v(12pt)\n`;
  if (authorImageUrl) {
    t += `  #image("${escapeTypstUrl(authorImageUrl)}", width: 60pt)\n`;
    t += `  #v(8pt)\n`;
  }
  t += `  #text(size: 10pt)[${authorBio}]\n`;
  t += `  #v(1fr)\n`;
  t += `]\n\n`;
  return t;
}

// ── Public API ──

/** Render a single TipTap node to Typst markup. */
export function renderTypstNode(node: TipTapNode): string {
  return renderTypstNodeImpl(node);
}

/** Convert a complete TipTap document JSON to Typst markup. */
export function tiptapToTypst(doc: TipTapNode): string {
  return renderTypstNodeImpl(doc);
}
