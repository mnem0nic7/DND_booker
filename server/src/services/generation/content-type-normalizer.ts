export const GENERATION_CONTENT_TYPES = [
  'narrative',
  'encounter',
  'exploration',
  'social',
  'transition',
] as const;

export type GenerationContentType = typeof GENERATION_CONTENT_TYPES[number];

const CONTENT_TYPE_ALIASES: Record<string, GenerationContentType> = {
  puzzle: 'exploration',
  investigation: 'exploration',
  mystery: 'exploration',
  travel: 'exploration',
  discovery: 'exploration',
  roleplay: 'social',
  negotiation: 'social',
  diplomacy: 'social',
  interaction: 'social',
  combat: 'encounter',
  battle: 'encounter',
  skirmish: 'encounter',
  finale: 'encounter',
  setup: 'narrative',
  introduction: 'narrative',
  intro: 'narrative',
  exposition: 'narrative',
  connective: 'transition',
  bridge: 'transition',
};

export function normalizeGenerationContentType(value: unknown): GenerationContentType | unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return value;

  if ((GENERATION_CONTENT_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as GenerationContentType;
  }

  if (trimmed in CONTENT_TYPE_ALIASES) {
    return CONTENT_TYPE_ALIASES[trimmed];
  }

  const matches = GENERATION_CONTENT_TYPES
    .map((type) => ({
      type,
      index: trimmed.search(new RegExp(`\\b${type}\\b`, 'i')),
    }))
    .filter((candidate) => candidate.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (matches.length > 0) {
    return matches[0].type;
  }

  const aliasMatches = Object.entries(CONTENT_TYPE_ALIASES)
    .map(([alias, type]) => ({
      type,
      index: trimmed.search(new RegExp(`\\b${alias}\\b`, 'i')),
    }))
    .filter((candidate) => candidate.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (aliasMatches.length > 0) {
    return aliasMatches[0].type;
  }

  return value;
}
