/**
 * Shared TipTap JSON to HTML renderer.
 * Used by both the worker (PDF export) and the client (live preview).
 * Converts TipTap document JSON into an HTML string with CSS classes
 * matching the React views so theme CSS applies correctly.
 */

import type { DocumentContent } from '../types/document';
import {
  escapeHtml,
  normalizeChapterHeaderTitle,
  normalizeEncounterCreatures,
  normalizeEncounterEntries,
  normalizeEncounterTableAttrs,
  normalizeNpcProfileAttrs,
  normalizeStatBlockAttrs,
  resolveRandomTableEntries,
  safeCssUrl,
  safeUrl,
} from './utils.js';

type TipTapNode = DocumentContent;

interface NameDesc {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  desc?: string;
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

function getNameDescDescription(entry: NameDesc | null | undefined): string {
  return String(entry?.description ?? entry?.desc ?? '');
}

function getNameDescName(entry: NameDesc | null | undefined): string {
  return String(entry?.name ?? entry?.type ?? entry?.title ?? '').trim();
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

/** Render inline marks (bold, italic, strike, code) around text content. */
function renderMarks(text: string, marks?: TipTapNode['marks']): string {
  let html = escapeHtml(text);
  if (!marks || marks.length === 0) return html;

  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`;
        break;
      case 'italic':
        html = `<em>${html}</em>`;
        break;
      case 'strike':
        html = `<s>${html}</s>`;
        break;
      case 'code':
        html = `<code>${html}</code>`;
        break;
      case 'underline':
        html = `<u>${html}</u>`;
        break;
      case 'superscript':
        html = `<sup>${html}</sup>`;
        break;
      case 'subscript':
        html = `<sub>${html}</sub>`;
        break;
      case 'highlight': {
        const color = escapeHtml(String(mark.attrs?.color || 'yellow'));
        html = `<mark style="background-color: ${color}">${html}</mark>`;
        break;
      }
      case 'textStyle': {
        const fontSize = mark.attrs?.fontSize ? escapeHtml(String(mark.attrs.fontSize)) : null;
        if (fontSize) {
          html = `<span style="font-size: ${fontSize}">${html}</span>`;
        }
        break;
      }
      case 'link': {
        const href = safeUrl(String(mark.attrs?.href || ''));
        const target = mark.attrs?.target ? ` target="${escapeHtml(String(mark.attrs.target))}"` : '';
        html = `<a href="${href}"${target}>${html}</a>`;
        break;
      }
      default:
        // Unknown mark type — skip silently
        break;
    }
  }

  return html;
}

/** Recursively render an array of TipTap nodes to HTML. */
function renderChildren(nodes?: TipTapNode[]): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map((node) => renderNode(node)).join('');
}

/** Render a single TipTap node to HTML. */
export function renderNode(node: TipTapNode): string {
  const attrs = node.attrs || {};

  switch (node.type) {
    // ── Text node ──
    case 'text':
      return renderMarks(node.text || '', node.marks);

    // ── Basic blocks ──
    case 'paragraph': {
      const align = attrs.textAlign;
      const style = align && align !== 'left' ? ` style="text-align: ${escapeHtml(String(align))}"` : '';
      const dropCapClass = attrs.dropCap ? ' class="drop-cap"' : '';
      return `<p${dropCapClass}${style}>${renderChildren(node.content)}</p>`;
    }

    case 'heading': {
      const level = Number(attrs.level) || 1;
      const tag = `h${Math.min(Math.max(level, 1), 6)}`;
      const align = attrs.textAlign;
      const style = align && align !== 'left' ? ` style="text-align: ${escapeHtml(String(align))}"` : '';
      return `<${tag}${style}>${renderChildren(node.content)}</${tag}>`;
    }

    case 'bulletList':
      return `<ul>${renderChildren(node.content)}</ul>`;

    case 'orderedList': {
      const start = attrs.start ? ` start="${escapeHtml(String(attrs.start))}"` : '';
      return `<ol${start}>${renderChildren(node.content)}</ol>`;
    }

    case 'listItem':
      return `<li>${renderChildren(node.content)}</li>`;

    case 'blockquote':
      return `<blockquote>${renderChildren(node.content)}</blockquote>`;

    case 'codeBlock': {
      const language = attrs.language ? ` class="language-${escapeHtml(String(attrs.language))}"` : '';
      return `<pre><code${language}>${renderChildren(node.content)}</code></pre>`;
    }

    case 'horizontalRule':
      return '<hr class="section-divider" />';

    case 'hardBreak':
      return '<br />';

    // ── Standard Tables ──
    case 'table':
      return `<table>${renderChildren(node.content)}</table>`;
    case 'tableRow':
      return `<tr>${renderChildren(node.content)}</tr>`;
    case 'tableHeader':
      return `<th>${renderChildren(node.content)}</th>`;
    case 'tableCell':
      return `<td>${renderChildren(node.content)}</td>`;

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

    case 'pageBreak':
      return '<div class="page-break"></div>';

    case 'columnBreak':
      return '<div class="column-break"></div>';

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
  const normalized = normalizeStatBlockAttrs(attrs);
  const leadInText = escapeHtml(String(normalized.leadInText || '').trim());
  const name = escapeHtml(String(normalized.name || ''));
  const size = escapeHtml(String(normalized.size || ''));
  const type = escapeHtml(String(normalized.type || ''));
  const alignment = escapeHtml(String(normalized.alignment || ''));
  const ac = Number(normalized.ac) || 0;
  const acType = String(normalized.acType || '');
  const hp = Number(normalized.hp) || 0;
  const hitDice = String(normalized.hitDice || '');
  const speed = escapeHtml(String(normalized.speed || ''));

  const abilityNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const abilityLabels = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  let html = '';
  if (leadInText) {
    html += `<div class="stat-block-with-lead-in"><p class="stat-block__lead-in">${leadInText}</p>`;
  }

  html += `<div class="stat-block">`;

  // Header
  html += `<h2 class="stat-block__name">${name}</h2>`;
  html += `<div class="stat-block__subtitle">${size} ${type}, ${alignment}</div>`;
  html += `<hr class="stat-block__divider" />`;

  // Core stats
  html += `<div class="stat-block__property"><span class="stat-block__property-name">Armor Class</span> ${ac}${acType ? ` (${escapeHtml(acType)})` : ''}</div>`;
  html += `<div class="stat-block__property"><span class="stat-block__property-name">Hit Points</span> ${hp}${hitDice ? ` (${escapeHtml(hitDice)})` : ''}</div>`;
  html += `<div class="stat-block__property"><span class="stat-block__property-name">Speed</span> ${speed}</div>`;
  html += `<hr class="stat-block__divider" />`;

  // Ability scores
  html += `<div class="stat-block__abilities">`;
  for (let i = 0; i < abilityNames.length; i++) {
    const rawScore = Number(normalized[abilityNames[i]]);
    const score = Number.isFinite(rawScore) ? rawScore : 10;
    html += `<div class="stat-block__ability">`;
    html += `<div class="stat-block__ability-name">${abilityLabels[i]}</div>`;
    html += `<div class="stat-block__ability-score">${score} (${getModifier(score)})</div>`;
    html += `</div>`;
  }
  html += `</div>`;
  html += `<hr class="stat-block__divider" />`;

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
    const value = String(normalized[key] || '');
    if (value) {
      html += `<div class="stat-block__property"><span class="stat-block__property-name">${label}</span> ${escapeHtml(value)}</div>`;
    }
  }

  // Challenge rating
  const cr = String(normalized.cr || '');
  const xp = String(normalized.xp || '');
  if (cr || xp) {
    html += `<div class="stat-block__property"><span class="stat-block__property-name">Challenge</span> ${escapeHtml(cr)}${xp ? ` (${escapeHtml(xp)} XP)` : ''}</div>`;
  }

  // Traits
  const traits = parseJsonArray<NameDesc>(String(normalized.traits || '[]'));
  if (traits.length > 0) {
    html += `<hr class="stat-block__divider" />`;
    for (const trait of traits) {
      html += `<div class="stat-block__trait"><span class="stat-block__trait-name">${escapeHtml(getNameDescName(trait))}.</span> ${escapeHtml(getNameDescDescription(trait))}</div>`;
    }
  }

  // Actions
  const actions = parseJsonArray<NameDesc>(String(normalized.actions || '[]'));
  if (actions.length > 0) {
    html += `<div class="stat-block__section-title">Actions</div>`;
    for (const action of actions) {
      html += `<div class="stat-block__trait"><span class="stat-block__trait-name">${escapeHtml(getNameDescName(action))}.</span> ${escapeHtml(getNameDescDescription(action))}</div>`;
    }
  }

  // Reactions
  const reactions = parseJsonArray<NameDesc>(String(normalized.reactions || '[]'));
  if (reactions.length > 0) {
    html += `<div class="stat-block__section-title">Reactions</div>`;
    for (const reaction of reactions) {
      html += `<div class="stat-block__trait"><span class="stat-block__trait-name">${escapeHtml(getNameDescName(reaction))}.</span> ${escapeHtml(getNameDescDescription(reaction))}</div>`;
    }
  }

  // Legendary Actions
  const legendaryActions = parseJsonArray<NameDesc>(String(normalized.legendaryActions || '[]'));
  if (legendaryActions.length > 0) {
    html += `<div class="stat-block__section-title">Legendary Actions</div>`;
    const legendaryDescription = String(normalized.legendaryDescription || '');
    if (legendaryDescription) {
      html += `<div class="stat-block__trait">${escapeHtml(legendaryDescription)}</div>`;
    }
    for (const la of legendaryActions) {
      html += `<div class="stat-block__trait"><span class="stat-block__trait-name">${escapeHtml(getNameDescName(la))}.</span> ${escapeHtml(getNameDescDescription(la))}</div>`;
    }
  }

  html += `</div>`;
  if (leadInText) {
    html += `</div>`;
  }
  return html;
}

function renderReadAloudBox(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  const style = String(attrs.style || 'parchment');
  return `<div class="read-aloud-box read-aloud-box--${escapeHtml(style)}">
    <div class="read-aloud-box__header"><span class="read-aloud-box__label">Read Aloud</span></div>
    <div class="read-aloud-box__content">${renderChildren(content)}</div>
  </div>`;
}

function renderSidebarCallout(attrs: Record<string, unknown>, content?: TipTapNode[]): string {
  const calloutType = String(attrs.calloutType || 'info');
  const title = escapeHtml(String(attrs.title || 'Note'));
  return `<div class="sidebar-callout sidebar-callout--${escapeHtml(calloutType)}">
    <div class="sidebar-callout__header">
      <span class="sidebar-callout__title">${title}</span>
    </div>
    <div class="sidebar-callout__content">${renderChildren(content)}</div>
  </div>`;
}

function renderChapterHeader(attrs: Record<string, unknown>): string {
  const subtitle = String(attrs.subtitle || '');
  const chapterNumber = String(attrs.chapterNumber || '');
  const title = escapeHtml(normalizeChapterHeaderTitle(attrs.title, chapterNumber));
  const backgroundImage = String(attrs.backgroundImage || '');

  const safeBg = backgroundImage ? safeCssUrl(backgroundImage) : null;
  const bgStyle = safeBg
    ? ` style="background-image: url(${safeBg}); background-size: cover; background-position: center;"`
    : '';

  let html = `<div class="chapter-header"${bgStyle}>`;
  if (chapterNumber) {
    html += `<div class="chapter-header__number">${escapeHtml(chapterNumber)}</div>`;
  }
  html += `<h1 class="chapter-header__title">${title}</h1>`;
  html += `<div class="chapter-header__underline"></div>`;
  if (subtitle) {
    html += `<div class="chapter-header__subtitle">${escapeHtml(subtitle)}</div>`;
  }
  html += `</div>`;
  return html;
}

function renderSpellCard(attrs: Record<string, unknown>): string {
  const name = escapeHtml(String(attrs.name || ''));
  const level = Number(attrs.level) || 0;
  const school = String(attrs.school || 'evocation');
  const castingTime = escapeHtml(String(attrs.castingTime || ''));
  const range = escapeHtml(String(attrs.range || ''));
  const components = escapeHtml(String(attrs.components || ''));
  const duration = escapeHtml(String(attrs.duration || ''));
  const description = escapeHtml(String(attrs.description || ''));
  const higherLevels = String(attrs.higherLevels || '');

  let html = `<div class="spell-card">`;
  html += `<h2 class="spell-card__name">${name}</h2>`;
  html += `<div class="spell-card__subtitle">${escapeHtml(levelLabel(level, school))}</div>`;
  html += `<hr class="spell-card__divider" />`;
  html += `<div class="spell-card__property"><span class="spell-card__property-name">Casting Time</span> ${castingTime}</div>`;
  html += `<div class="spell-card__property"><span class="spell-card__property-name">Range</span> ${range}</div>`;
  html += `<div class="spell-card__property"><span class="spell-card__property-name">Components</span> ${components}</div>`;
  html += `<div class="spell-card__property"><span class="spell-card__property-name">Duration</span> ${duration}</div>`;
  html += `<hr class="spell-card__divider" />`;
  html += `<div class="spell-card__description">${description}</div>`;
  if (higherLevels) {
    html += `<div class="spell-card__higher-levels"><span class="spell-card__higher-levels-label">At Higher Levels.</span> ${escapeHtml(higherLevels)}</div>`;
  }
  html += `</div>`;
  return html;
}

function renderMagicItem(attrs: Record<string, unknown>): string {
  const name = escapeHtml(String(attrs.name || ''));
  const type = String(attrs.type || 'wondrous');
  const rarity = String(attrs.rarity || 'uncommon');
  const requiresAttunement = Boolean(attrs.requiresAttunement);
  const attunementRequirement = String(attrs.attunementRequirement || '');
  const description = escapeHtml(String(attrs.description || ''));
  const properties = String(attrs.properties || '');

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const rarityText = rarityLabel(rarity);
  let subtitle = `${typeLabel}, ${rarityText}`;
  if (requiresAttunement) {
    subtitle += attunementRequirement
      ? ` (requires attunement ${attunementRequirement})`
      : ' (requires attunement)';
  }

  let html = `<div class="magic-item">`;
  html += `<h2 class="magic-item__name">${name}</h2>`;
  html += `<div class="magic-item__subtitle">${escapeHtml(subtitle)}</div>`;
  html += `<hr class="magic-item__divider" />`;
  html += `<div class="magic-item__description">${description}</div>`;
  if (properties) {
    html += `<div class="magic-item__properties">${escapeHtml(properties)}</div>`;
  }
  html += `</div>`;
  return html;
}

function renderRandomTable(attrs: Record<string, unknown>): string {
  const title = escapeHtml(String(attrs.title || ''));
  const dieType = escapeHtml(String(attrs.dieType || 'd6'));
  const entries = resolveRandomTableEntries(attrs);

  if (entries.length === 0) return '';

  let html = `<div class="random-table">`;
  html += `<div class="random-table__header">`;
  html += `<h2 class="random-table__title">${title}</h2>`;
  html += `<span class="random-table__die-badge">${dieType}</span>`;
  html += `</div>`;

  html += `<table class="random-table__table">`;
  html += `<thead><tr><th class="random-table__th random-table__th--roll">${dieType}</th><th class="random-table__th">Result</th></tr></thead>`;
  html += `<tbody>`;
  for (const entry of entries) {
    html += `<tr class="random-table__row"><td class="random-table__td random-table__td--roll">${escapeHtml(entry.roll)}</td><td class="random-table__td">${escapeHtml(entry.result)}</td></tr>`;
  }
  html += `</tbody></table>`;
  html += `</div>`;
  return html;
}

function renderNpcProfile(attrs: Record<string, unknown>): string {
  const normalized = normalizeNpcProfileAttrs(attrs);
  const name = escapeHtml(String(normalized.name || ''));
  const race = escapeHtml(String(normalized.race || ''));
  const npcClass = escapeHtml(String(normalized.class || ''));
  const description = String(normalized.description || '');
  const personalityTraits = String(normalized.personalityTraits || '');
  const ideals = String(normalized.ideals || '');
  const bonds = String(normalized.bonds || '');
  const flaws = String(normalized.flaws || '');
  const goal = String(normalized.goal || '');
  const whatTheyKnow = String(normalized.whatTheyKnow || '');
  const leverage = String(normalized.leverage || '');
  const likelyReaction = String(normalized.likelyReaction || '');
  const portraitUrl = String(normalized.portraitUrl || '');

  let html = `<div class="npc-profile">`;

  // Header
  html += `<div class="npc-profile__header">`;
  if (portraitUrl) {
    html += `<div class="npc-profile__portrait"><img src="${safeUrl(portraitUrl)}" alt="${name}" class="npc-profile__portrait-img" /></div>`;
  } else {
    html += `<div class="npc-profile__portrait"><div class="npc-profile__portrait-placeholder" aria-hidden="true"><div class="npc-profile__portrait-sigil"></div></div></div>`;
  }
  html += `<div class="npc-profile__header-info">`;
  html += `<h2 class="npc-profile__name">${name}</h2>`;
  html += `<div class="npc-profile__subtitle">${race} ${npcClass}</div>`;
  html += `</div></div>`;

  html += `<hr class="npc-profile__divider" />`;

  if (description) {
    html += `<div class="npc-profile__description">${escapeHtml(description)}</div>`;
  }

  html += `<div class="npc-profile__personality">`;
  if (goal) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Goal.</span> ${escapeHtml(goal)}</div>`;
  }
  if (whatTheyKnow) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">What They Know.</span> ${escapeHtml(whatTheyKnow)}</div>`;
  }
  if (leverage) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Leverage.</span> ${escapeHtml(leverage)}</div>`;
  }
  if (likelyReaction) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Likely Reaction.</span> ${escapeHtml(likelyReaction)}</div>`;
  }
  if (personalityTraits) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Personality Traits.</span> ${escapeHtml(personalityTraits)}</div>`;
  }
  if (ideals) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Ideals.</span> ${escapeHtml(ideals)}</div>`;
  }
  if (bonds) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Bonds.</span> ${escapeHtml(bonds)}</div>`;
  }
  if (flaws) {
    html += `<div class="npc-profile__trait"><span class="npc-profile__trait-label">Flaws.</span> ${escapeHtml(flaws)}</div>`;
  }
  html += `</div>`;

  html += `</div>`;
  return html;
}

function renderEncounterTable(attrs: Record<string, unknown>): string {
  const normalized = normalizeEncounterTableAttrs(attrs);
  const environment = escapeHtml(String(normalized.environment || ''));
  const title = escapeHtml(String(normalized.title || normalized.name || environment || 'Encounter Details'));
  const crRange = escapeHtml(String(normalized.crRange || ''));
  const difficulty = escapeHtml(String(normalized.difficulty || ''));
  const encounterType = escapeHtml(String(normalized.encounterType || ''));
  const description = escapeHtml(String(normalized.description || ''));
  const objective = escapeHtml(String(normalized.objective || ''));
  const opposition = escapeHtml(String(normalized.opposition || ''));
  const terrain = escapeHtml(String(normalized.terrain || ''));
  const setup = escapeHtml(String(normalized.setup || ''));
  const tactics = escapeHtml(String(normalized.tactics || ''));
  const rewards = escapeHtml(String(normalized.rewards || ''));
  const payoff = escapeHtml(String(normalized.payoff || ''));
  const aftermath = escapeHtml(String(normalized.aftermath || ''));
  const notes = escapeHtml(String(normalized.notes || ''));
  const entries = normalizeEncounterEntries(normalized.entries);
  const creatures = normalizeEncounterCreatures(normalized.creatures);

  if (
    entries.length === 0
    && creatures.length === 0
    && !description
    && !objective
    && !opposition
    && !terrain
    && !setup
    && !tactics
    && !rewards
    && !payoff
    && !aftermath
    && !notes
  ) {
    return '';
  }

  let html = `<div class="encounter-table">`;
  html += `<div class="encounter-table__header">`;
  html += `<h2 class="encounter-table__title">${title}</h2>`;

  const metaParts = [environment, difficulty, encounterType, crRange ? `CR ${crRange}` : ''].filter(Boolean);
  if (metaParts.length > 0) {
    html += `<div class="encounter-table__cr-range">${metaParts.join(' · ')}</div>`;
  }
  html += `</div>`;

  if (entries.length > 0) {
    const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
    html += `<table class="encounter-table__table">`;
    html += `<thead><tr><th class="encounter-table__th">d${totalWeight}</th><th class="encounter-table__th">Encounter</th><th class="encounter-table__th">CR</th></tr></thead>`;
    html += `<tbody>`;

    let running = 0;
    for (const entry of entries) {
      const from = running + 1;
      running += entry.weight;
      const to = running;
      const rangeLabel = from === to ? `${from}` : `${from}\u2013${to}`;
      html += `<tr class="encounter-table__row">`;
      html += `<td class="encounter-table__td encounter-table__td--weight">${rangeLabel}</td>`;
      html += `<td class="encounter-table__td">${escapeHtml(entry.description)}</td>`;
      html += `<td class="encounter-table__td encounter-table__td--cr">${escapeHtml(entry.cr)}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;
  }

  const detailRows: string[] = [];
  if (description) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Overview.</span> ${description}</div>`);
  if (creatures.length > 0) {
    detailRows.push(
      `<div class="encounter-table__detail"><span class="encounter-table__detail-label">Enemies.</span> ${creatures
        .map((creature) => `${creature.quantity}x ${escapeHtml(creature.name)}${creature.challengeRating ? ` (CR ${escapeHtml(creature.challengeRating)})` : ''}`)
        .join('; ')}</div>`,
    );
  }
  if (opposition) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Opposition.</span> ${opposition}</div>`);
  if (objective) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Objective.</span> ${objective}</div>`);
  if (terrain) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Terrain.</span> ${terrain}</div>`);
  if (setup) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Setup.</span> ${setup}</div>`);
  if (tactics) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Tactics.</span> ${tactics}</div>`);
  if (rewards) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Rewards.</span> ${rewards}</div>`);
  if (payoff) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Payoff.</span> ${payoff}</div>`);
  if (aftermath) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Aftermath.</span> ${aftermath}</div>`);
  if (notes) detailRows.push(`<div class="encounter-table__detail"><span class="encounter-table__detail-label">Notes.</span> ${notes}</div>`);

  if (detailRows.length > 0) {
    html += `<div class="encounter-table__details">${detailRows.join('')}</div>`;
  }

  html += `</div>`;
  return html;
}

function renderClassFeature(attrs: Record<string, unknown>): string {
  const name = escapeHtml(String(attrs.name || ''));
  const level = Number(attrs.level) || 1;
  const className = escapeHtml(String(attrs.className || ''));
  const description = escapeHtml(String(attrs.description || ''));

  let html = `<div class="class-feature">`;
  html += `<h2 class="class-feature__name">${name}</h2>`;
  html += `<div class="class-feature__subtitle">Level ${level} ${className} Feature</div>`;
  html += `<hr class="class-feature__divider" />`;
  html += `<div class="class-feature__description">${description}</div>`;
  html += `</div>`;
  return html;
}

function renderRaceBlock(attrs: Record<string, unknown>): string {
  const name = escapeHtml(String(attrs.name || ''));
  const abilityScoreIncreases = escapeHtml(String(attrs.abilityScoreIncreases || ''));
  const size = escapeHtml(String(attrs.size || ''));
  const speed = escapeHtml(String(attrs.speed || ''));
  const languages = escapeHtml(String(attrs.languages || ''));
  const features = parseJsonArray<NameDesc>(String(attrs.features || '[]'));

  let html = `<div class="race-block">`;
  html += `<h2 class="race-block__name">${name}</h2>`;
  html += `<hr class="race-block__divider" />`;

  html += `<div class="race-block__traits">`;
  html += `<div class="race-block__property"><span class="race-block__property-name">Ability Score Increase.</span> ${abilityScoreIncreases}</div>`;
  html += `<div class="race-block__property"><span class="race-block__property-name">Size.</span> ${size}</div>`;
  html += `<div class="race-block__property"><span class="race-block__property-name">Speed.</span> ${speed}</div>`;
  html += `<div class="race-block__property"><span class="race-block__property-name">Languages.</span> ${languages}</div>`;
  html += `</div>`;

  if (features.length > 0) {
    html += `<hr class="race-block__divider" />`;
    html += `<div class="race-block__section-title">Racial Features</div>`;
    for (const feature of features) {
      html += `<div class="race-block__feature"><span class="race-block__feature-name">${escapeHtml(feature.name)}.</span> ${escapeHtml(getNameDescDescription(feature))}</div>`;
    }
  }

  html += `</div>`;
  return html;
}

// ── Layout Block Renderers ──

function renderFullBleedImage(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  const caption = String(attrs.caption || '');
  const position = String(attrs.position || 'full');
  const artRole = String(attrs.artRole || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
  const artRoleClass = artRole ? ` full-bleed-image--art-role-${escapeHtml(artRole)}` : '';

  let html = `<div class="full-bleed-image full-bleed-image--${escapeHtml(position)}${artRoleClass}">`;
  if (src) {
    html += `<img class="full-bleed-image__img" src="${safeUrl(src)}" alt="${escapeHtml(caption || 'Full bleed image')}" />`;
  }
  if (caption) {
    html += `<div class="full-bleed-image__caption">${escapeHtml(caption)}</div>`;
  }
  html += `</div>`;
  return html;
}

function renderMapBlock(attrs: Record<string, unknown>): string {
  const src = String(attrs.src || '');
  const scale = String(attrs.scale || '');
  const keyEntries = parseJsonArray<{ label: string; description: string }>(String(attrs.keyEntries || '[]'));

  let html = `<div class="map-block">`;
  html += `<div class="map-block__image-area">`;
  if (src) {
    html += `<img class="map-block__img" src="${safeUrl(src)}" alt="Map" />`;
  }
  html += `</div>`;

  if (scale) {
    html += `<div class="map-block__scale"><span class="map-block__scale-label">Scale:</span> ${escapeHtml(scale)}</div>`;
  }

  if (keyEntries.length > 0) {
    html += `<div class="map-block__legend">`;
    html += `<div class="map-block__legend-title">Map Key</div>`;
    for (const entry of keyEntries) {
      html += `<div class="map-block__legend-entry"><span class="map-block__legend-label">${escapeHtml(entry.label)}.</span> ${escapeHtml(entry.description)}</div>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function renderHandout(attrs: Record<string, unknown>): string {
  const title = escapeHtml(String(attrs.title || ''));
  const style = String(attrs.style || 'letter');
  const content = escapeHtml(String(attrs.content || ''));

  let html = `<div class="handout handout--${escapeHtml(style)}">`;
  html += `<div class="handout__title">${title}</div>`;
  html += `<div class="handout__content">${content}</div>`;
  html += `</div>`;
  return html;
}

function renderPageBorder(attrs: Record<string, unknown>): string {
  const borderStyle = String(attrs.borderStyle || 'simple');
  return `<div class="page-border page-border--${escapeHtml(borderStyle)}">
    <div class="page-border__preview">
      <div class="page-border__preview-inner">
        <span class="page-border__label">Page Border: ${escapeHtml(borderStyle.charAt(0).toUpperCase() + borderStyle.slice(1))}</span>
      </div>
    </div>
  </div>`;
}

// ── Structure Block Renderers ──

function renderTitlePage(attrs: Record<string, unknown>): string {
  const title = escapeHtml(String(attrs.title || ''));
  const subtitle = String(attrs.subtitle || '').trim();
  const author = String(attrs.author || '').trim();
  const coverImageUrl = String(attrs.coverImageUrl || '');
  const hasSecondaryMeta = Boolean(subtitle || author);

  let html = `<div class="title-page">`;
  html += `<div class="title-page__content">`;

  if (coverImageUrl) {
    html += `<div class="title-page__cover-image"><img src="${safeUrl(coverImageUrl)}" alt="Cover" /></div>`;
  }

  html += `<h1 class="title-page__title">${title}</h1>`;
  if (subtitle) {
    html += `<p class="title-page__subtitle">${escapeHtml(subtitle)}</p>`;
  }
  if (hasSecondaryMeta) {
    html += `<div class="title-page__ornament">&#10022;</div>`;
  }
  if (author) {
    html += `<p class="title-page__author">by ${escapeHtml(author)}</p>`;
  }

  html += `</div></div>`;
  return html;
}

function renderTableOfContents(attrs: Record<string, unknown>): string {
  const title = escapeHtml(String(attrs.title || 'Table of Contents'));

  let html = `<div class="table-of-contents">`;
  html += `<h2 class="table-of-contents__heading">${title}</h2>`;
  // Entries div is a placeholder — assembleHtml() injects real chapter entries
  html += `<div class="table-of-contents__entries"></div>`;
  html += `</div>`;
  return html;
}

function renderCreditsPage(attrs: Record<string, unknown>): string {
  const credits = String(attrs.credits || '');
  const legalText = escapeHtml(String(attrs.legalText || ''));
  const copyrightYear = escapeHtml(String(attrs.copyrightYear || ''));

  let html = `<div class="credits-page">`;
  html += `<div class="credits-page__content">`;
  html += `<h2 class="credits-page__heading">Credits</h2>`;

  html += `<div class="credits-page__credits-text">`;
  const lines = credits.split('\n');
  for (const line of lines) {
    html += `<p>${escapeHtml(line)}</p>`;
  }
  html += `</div>`;

  html += `<hr class="credits-page__divider" />`;

  html += `<div class="credits-page__legal-section">`;
  html += `<h3 class="credits-page__legal-heading">Legal</h3>`;
  html += `<p class="credits-page__legal-text">${legalText}</p>`;
  html += `</div>`;

  html += `<p class="credits-page__copyright">&copy; ${copyrightYear} All rights reserved.</p>`;

  html += `</div></div>`;
  return html;
}

function renderBackCover(attrs: Record<string, unknown>): string {
  const blurb = escapeHtml(String(attrs.blurb || ''));
  const authorBio = escapeHtml(String(attrs.authorBio || ''));
  const authorImageUrl = String(attrs.authorImageUrl || '');

  let html = `<div class="back-cover">`;
  html += `<div class="back-cover__content">`;

  html += `<div class="back-cover__blurb"><p>${blurb}</p></div>`;
  html += `<div class="back-cover__ornament">&#10022; &#10022; &#10022;</div>`;

  html += `<div class="back-cover__author-section">`;
  if (authorImageUrl) {
    html += `<img class="back-cover__author-image" src="${safeUrl(authorImageUrl)}" alt="Author" />`;
  }
  html += `<p class="back-cover__author-bio">${authorBio}</p>`;
  html += `</div>`;

  html += `</div></div>`;
  return html;
}

/**
 * Convert a complete TipTap document JSON to HTML.
 */
export function tiptapToHtml(doc: TipTapNode): string {
  return renderNode(doc);
}
