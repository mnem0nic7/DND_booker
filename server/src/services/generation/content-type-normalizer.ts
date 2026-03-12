export const GENERATION_CONTENT_TYPES = [
  'narrative',
  'encounter',
  'exploration',
  'social',
  'transition',
] as const;

export type GenerationContentType = typeof GENERATION_CONTENT_TYPES[number];

export function normalizeGenerationContentType(value: unknown): GenerationContentType | unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return value;

  if ((GENERATION_CONTENT_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as GenerationContentType;
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

  return value;
}
