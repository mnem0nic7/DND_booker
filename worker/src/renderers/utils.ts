/**
 * Re-export the shared utility functions.
 * The canonical implementation lives in @dnd-booker/shared.
 */
export {
  assessRandomTableEntries,
  escapeHtml,
  hasEncounterTableContent,
  normalizeChapterHeaderTitle,
  normalizeEncounterCreatures,
  normalizeEncounterTableAttrs,
  normalizeNpcProfileAttrs,
  normalizeStatBlockAttrs,
  normalizeStructuredText,
  safeUrl,
  safeCssUrl,
  strengthenRandomTableEntries,
} from '@dnd-booker/shared';
export { normalizeEncounterEntries, normalizeRandomTableEntries } from '@dnd-booker/shared';
