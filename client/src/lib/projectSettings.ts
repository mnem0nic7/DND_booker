import type { ProjectSettings, TextLayoutFallbackConfig } from '@dnd-booker/shared';

function normalizeScopeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((scopeId): scopeId is string => typeof scopeId === 'string' && scopeId.trim().length > 0);
}

function normalizeFallbackEntry(value: unknown): TextLayoutFallbackConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scopeIds = normalizeScopeIds((value as { scopeIds?: unknown }).scopeIds);
  return scopeIds.length > 0 ? { scopeIds } : null;
}

export function getDocumentTextLayoutFallbackScopeIds(
  settings: Pick<ProjectSettings, 'textLayoutFallbacks'> | null | undefined,
  documentId: string | null | undefined,
): string[] {
  if (!settings || !documentId) return [];
  return normalizeFallbackEntry(settings.textLayoutFallbacks?.[documentId])?.scopeIds ?? [];
}

export function countDocumentTextLayoutFallbackScopes(
  settings: Pick<ProjectSettings, 'textLayoutFallbacks'> | null | undefined,
  documentId: string | null | undefined,
): number {
  return getDocumentTextLayoutFallbackScopeIds(settings, documentId).length;
}

export function clearDocumentTextLayoutFallbacks(
  settings: Pick<ProjectSettings, 'textLayoutFallbacks'> | null | undefined,
  documentId: string,
): ProjectSettings['textLayoutFallbacks'] {
  const nextFallbacks: ProjectSettings['textLayoutFallbacks'] = { ...(settings?.textLayoutFallbacks ?? {}) };
  delete nextFallbacks[documentId];
  return nextFallbacks;
}
