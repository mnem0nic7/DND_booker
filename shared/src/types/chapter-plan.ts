/** Specification for one encounter in a chapter. */
export interface EncounterSpec {
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  enemies: { name: string; count: number; cr: string }[];
  environment: string;
  tactics: string;
  rewards: string[];
}

/** Specification for one section within a chapter plan. */
export interface SectionSpec {
  slug: string;
  title: string;
  contentType: 'narrative' | 'encounter' | 'exploration' | 'social' | 'transition';
  targetWords: number;
  outline: string;
  keyBeats: string[];
  entityReferences: string[];
  blocksNeeded: string[];
}

/** Detailed plan for one chapter — produced by the chapter plan service. */
export interface ChapterPlan {
  chapterSlug: string;
  chapterTitle: string;
  sections: SectionSpec[];
  encounters: EncounterSpec[];
  entityReferences: string[];
  readAloudCount: number;
  dmTipCount: number;
  difficultyProgression: string;
}
