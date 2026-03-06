/** One section in a chapter outline. */
export interface SectionOutlineEntry {
  slug: string;
  title: string;
  sortOrder: number;
  targetPages: number;
  contentType: 'narrative' | 'encounter' | 'exploration' | 'social' | 'transition';
  summary: string;
}

/** One chapter in the outline. */
export interface ChapterOutlineEntry {
  slug: string;
  title: string;
  act: number;
  sortOrder: number;
  levelRange: { min: number; max: number };
  targetPages: number;
  summary: string;
  keyEntities: string[];
  sections: SectionOutlineEntry[];
}

/** One appendix in the outline. */
export interface AppendixOutlineEntry {
  slug: string;
  title: string;
  targetPages: number;
  sourceEntityTypes: string[];
  summary: string;
}

/** Full chapter outline — the structured output from the outline service. */
export interface ChapterOutline {
  chapters: ChapterOutlineEntry[];
  appendices: AppendixOutlineEntry[];
  totalPageEstimate: number;
}
