export const PROJECT_TYPES = ['campaign', 'one_shot', 'supplement', 'sourcebook'] as const;
export const PROJECT_STATUSES = ['draft', 'in_progress', 'review', 'published'] as const;
export const EXPORT_FORMATS = ['pdf', 'epub', 'print_pdf'] as const;
export const EXPORT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;

export const DEFAULT_PROJECT_SETTINGS = {
  pageSize: 'letter' as const,
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
  columns: 1 as const,
  theme: 'gilded-folio',
  fonts: { heading: 'Cinzel', body: 'Crimson Text' },
};
