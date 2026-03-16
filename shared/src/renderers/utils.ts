function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

export interface NormalizedEncounterEntry {
  weight: number;
  description: string;
  cr: string;
}

export interface NormalizedRandomTableEntry {
  roll: string;
  result: string;
}

export type RandomTableUsabilityFlag =
  | 'too_brief'
  | 'missing_operational_detail';

export interface RandomTableEntryAssessment {
  roll: string;
  result: string;
  wordCount: number;
  flags: RandomTableUsabilityFlag[];
}

export interface RandomTableUsabilityAssessment {
  normalizedEntries: NormalizedRandomTableEntry[];
  entryAssessments: RandomTableEntryAssessment[];
  thinEntryCount: number;
  averageWordCount: number;
  isThin: boolean;
}

export type StatBlockSanityFlag =
  | 'missing_name'
  | 'invalid_ac'
  | 'invalid_hp'
  | 'default_ability_scores'
  | 'suspicious_speed';

export interface StatBlockSanityAssessment {
  normalizedAttrs: Record<string, unknown>;
  flags: StatBlockSanityFlag[];
  isPlaceholder: boolean;
  isSuspicious: boolean;
}

function pickFirst(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      return raw[key];
    }
  }
  return undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface NameDescLike {
  name?: unknown;
  type?: unknown;
  title?: unknown;
  label?: unknown;
  description?: unknown;
  desc?: unknown;
  notes?: unknown;
  text?: unknown;
}

function normalizeNameDescList(value: unknown): string {
  let parsed: unknown;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return value;
    }
  } else {
    parsed = value;
  }

  if (!Array.isArray(parsed)) return '[]';

  const normalized = parsed.flatMap((entry) => {
    if (entry == null || typeof entry !== 'object') return [];

    const raw = entry as NameDescLike;
    const name = normalizeString(raw.name ?? raw.type ?? raw.title ?? raw.label).trim();
    const description = normalizeString(
      raw.description ?? raw.desc ?? raw.notes ?? raw.text,
    ).trim();

    if (!name && !description) return [];

    const result: Record<string, string> = {};
    if (name) result.name = name;
    if (description) result.description = description;
    return [result];
  });

  return JSON.stringify(normalized);
}

export function escapeHtml(text: unknown): string {
  return normalizeString(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow raster image data URIs — SVG data URIs can contain embedded scripts
const SAFE_DATA_PREFIXES = ['data:image/png', 'data:image/jpeg', 'data:image/gif', 'data:image/webp'];

function isSafeDataUri(trimmed: string): boolean {
  return SAFE_DATA_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * Sanitize a URL for use in HTML src/href attributes.
 * Blocks javascript: and data: URIs (except safe raster image types).
 * Returns '#' for unsafe URLs.
 */
export function safeUrl(url: unknown): string {
  const normalized = normalizeString(url);
  const trimmed = normalized.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return '#';
  if (trimmed.startsWith('data:') && !isSafeDataUri(trimmed)) return '#';
  return escapeHtml(normalized);
}

/**
 * Sanitize a URL for use in CSS url() context.
 * Validates protocol and escapes CSS-unsafe characters.
 * Returns null for unsafe URLs.
 */
export function safeCssUrl(url: unknown): string | null {
  const normalized = normalizeString(url);
  const trimmed = normalized.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return null;
  if (trimmed.startsWith('data:') && !isSafeDataUri(trimmed)) return null;

  // Reject URLs with CSS-injection characters that could break out of url() context
  if (/[()'"\\;{}]/.test(normalized)) return null;

  return escapeHtml(normalized);
}

/**
 * Escape special Typst markup characters in plain text.
 * Characters that have special meaning in Typst are prefixed with backslash.
 */
export function escapeTypst(text: unknown): string {
  return normalizeString(text).replace(/[\\*_`#@$<>\[\]]/g, (ch) => `\\${ch}`);
}

/**
 * Escape a URL for safe interpolation inside Typst string literals (double-quoted).
 * Prevents injection via `"` or `\` characters in user-controlled URLs.
 */
export function escapeTypstUrl(url: unknown): string {
  return normalizeString(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function normalizeEncounterEntries(value: unknown): NormalizedEncounterEntry[] {
  let parsed: unknown;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  } else {
    parsed = value;
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry) => {
    if (entry == null || typeof entry !== 'object') return [];

    const raw = entry as Record<string, unknown>;
    const weight = Number(raw.weight);
    const description = normalizeString(raw.description).trim();
    const cr = normalizeString(raw.cr).trim();

    if (!Number.isFinite(weight) || weight <= 0 || !description) return [];

    return [{
      weight: Math.max(1, Math.floor(weight)),
      description,
      cr,
    }];
  });
}

export function normalizeRandomTableEntries(value: unknown): NormalizedRandomTableEntry[] {
  let parsed: unknown;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  } else {
    parsed = value;
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry) => {
    if (entry == null || typeof entry !== 'object') return [];

    const raw = entry as Record<string, unknown>;
    const roll = normalizeString(raw.roll ?? (typeof raw.result === 'number' ? raw.result : '')).trim();
    const result = normalizeString(
      raw.description ?? raw.result ?? raw.outcome,
    ).trim();

    if (!roll || !result) return [];

    return [{ roll, result }];
  });
}

function hasOperationalEncounterDetail(text: string): boolean {
  const normalized = normalizeString(text).trim().toLowerCase();
  if (!normalized) return false;

  if (/[;:]/.test(normalized)) return true;
  if (/dc\s*\d+/.test(normalized)) return true;

  return /\b(attack|ambush|approach|bargain|check|clue|consequence|discover|demand|escape|flee|follow|hazard|hide|hook|insight|investigat|loot|offer|patrol|reaction|reward|save|search|stake|tactic|threat|tracks?|warn)\b/.test(normalized);
}

export function assessRandomTableEntries(value: unknown): RandomTableUsabilityAssessment {
  const normalizedEntries = normalizeRandomTableEntries(value);
  const entryAssessments = normalizedEntries.map((entry) => {
    const wordCount = entry.result.split(/\s+/).filter(Boolean).length;
    const flags: RandomTableUsabilityFlag[] = [];

    if (wordCount < 10) flags.push('too_brief');
    if (!hasOperationalEncounterDetail(entry.result)) flags.push('missing_operational_detail');

    return {
      roll: entry.roll,
      result: entry.result,
      wordCount,
      flags,
    };
  });

  const thinEntryCount = entryAssessments.filter((entry) => entry.flags.length > 0).length;
  const averageWordCount = entryAssessments.length === 0
    ? 0
    : entryAssessments.reduce((sum, entry) => sum + entry.wordCount, 0) / entryAssessments.length;

  return {
    normalizedEntries,
    entryAssessments,
    thinEntryCount,
    averageWordCount,
    isThin: entryAssessments.length > 0 && thinEntryCount >= Math.ceil(entryAssessments.length / 2),
  };
}

export function normalizeStatBlockAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...attrs };

  const numberAliases: Array<[string, string[]]> = [
    ['ac', ['ac', 'armorClass']],
    ['hp', ['hp', 'hitPoints']],
    ['str', ['str', 'strength']],
    ['dex', ['dex', 'dexterity']],
    ['con', ['con', 'constitution']],
    ['int', ['int', 'intelligence']],
    ['wis', ['wis', 'wisdom']],
    ['cha', ['cha', 'charisma']],
  ];

  for (const [target, aliases] of numberAliases) {
    const value = normalizeNumber(pickFirst(normalized, aliases));
    if (value !== undefined) normalized[target] = value;
  }

  const stringAliases: Array<[string, string[]]> = [
    ['acType', ['acType', 'armorType']],
    ['hitDice', ['hitDice']],
    ['speed', ['speed', 'movement', 'movementSpeed', 'speedText']],
    ['cr', ['cr', 'challengeRating']],
    ['xp', ['xp', 'experience']],
    ['savingThrows', ['savingThrows', 'savingThrowsText']],
    ['damageResistances', ['damageResistances', 'resistances']],
    ['damageImmunities', ['damageImmunities', 'immunities']],
    ['conditionImmunities', ['conditionImmunities']],
    ['senses', ['senses']],
    ['languages', ['languages']],
  ];

  for (const [target, aliases] of stringAliases) {
    const value = normalizeString(pickFirst(normalized, aliases)).trim();
    if (value) normalized[target] = value;
  }

  const arrayAliases: Array<[string, string[]]> = [
    ['traits', ['traits']],
    ['actions', ['actions']],
    ['reactions', ['reactions']],
    ['legendaryActions', ['legendaryActions', 'legendaryAbilities']],
  ];

  for (const [target, aliases] of arrayAliases) {
    const value = pickFirst(normalized, aliases);
    if (value !== undefined) normalized[target] = normalizeNameDescList(value);
  }

  return normalized;
}

function hasDefaultAbilityScores(attrs: Record<string, unknown>): boolean {
  const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  return abilityKeys.every((key) => {
    const score = normalizeNumber(attrs[key]);
    return score === undefined || score === 10;
  });
}

function hasSuspiciousSpeed(value: unknown): boolean {
  const speed = normalizeString(value).trim().toLowerCase();
  if (!speed) return false;

  if (/^0\s*ft\.?$/i.test(speed)) return true;
  if (/^0\s*ft\.?\s*,/i.test(speed)) return true;
  if (/\b0\s*ft\.?\b/i.test(speed) && /\b(fly|hover|swim|climb|burrow)\b/i.test(speed)) {
    return true;
  }

  return false;
}

export function assessStatBlockAttrs(attrs: Record<string, unknown>): StatBlockSanityAssessment {
  const normalizedAttrs = normalizeStatBlockAttrs(attrs);
  const flags: StatBlockSanityFlag[] = [];

  const name = normalizeString(normalizedAttrs.name).trim();
  const ac = normalizeNumber(normalizedAttrs.ac);
  const hp = normalizeNumber(normalizedAttrs.hp);

  if (!name) flags.push('missing_name');
  if (ac === undefined || ac <= 0) flags.push('invalid_ac');
  if (hp === undefined || hp <= 0) flags.push('invalid_hp');
  if (hasDefaultAbilityScores(normalizedAttrs)) flags.push('default_ability_scores');
  if (hasSuspiciousSpeed(normalizedAttrs.speed)) flags.push('suspicious_speed');

  return {
    normalizedAttrs,
    flags,
    isPlaceholder: flags.includes('missing_name') || flags.includes('invalid_ac') || flags.includes('invalid_hp'),
    isSuspicious: flags.includes('default_ability_scores') || flags.includes('suspicious_speed'),
  };
}

export function normalizeNpcProfileAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...attrs };

  const classLike = normalizeString(pickFirst(normalized, ['class', 'role'])).trim();
  if (classLike) normalized.class = classLike;

  const description = normalizeString(pickFirst(normalized, ['description', 'notes'])).trim();
  if (description) normalized.description = description;

  const personalityTraits = normalizeString(
    pickFirst(normalized, ['personalityTraits', 'traits']),
  ).trim();
  if (personalityTraits) normalized.personalityTraits = personalityTraits;

  const goal = normalizeString(
    pickFirst(normalized, ['goal', 'goalOrNeed', 'wants']),
  ).trim();
  if (goal) normalized.goal = goal;

  const whatTheyKnow = normalizeString(
    pickFirst(normalized, ['whatTheyKnow', 'knowledge', 'secret', 'secrets']),
  ).trim();
  if (whatTheyKnow) normalized.whatTheyKnow = whatTheyKnow;

  const leverage = normalizeString(
    pickFirst(normalized, ['leverage', 'pressurePoint', 'whatChangesTheirMind']),
  ).trim();
  if (leverage) normalized.leverage = leverage;

  const likelyReaction = normalizeString(
    pickFirst(normalized, ['likelyReaction', 'firstReaction', 'reaction']),
  ).trim();
  if (likelyReaction) normalized.likelyReaction = likelyReaction;

  return normalized;
}

export function resolveRandomTableEntries(attrs: Record<string, unknown>): NormalizedRandomTableEntry[] {
  return normalizeRandomTableEntries(attrs.entries ?? attrs.results);
}

export function normalizeChapterHeaderTitle(title: unknown, chapterNumber: unknown): string {
  const normalizedTitle = normalizeString(title).trim();
  const normalizedChapterNumber = normalizeString(chapterNumber).trim();

  if (!normalizedTitle || !normalizedChapterNumber) return normalizedTitle;

  const chapterMatch = normalizedChapterNumber.match(/chapter\s+(\d+)/i);
  if (!chapterMatch) return normalizedTitle;

  const chapterPrefix = new RegExp(`^chapter\\s+${chapterMatch[1]}\\s*[:.-]\\s*`, 'i');
  return normalizedTitle.replace(chapterPrefix, '').trim();
}
