export interface CampaignBible {
  id: string;
  runId: string;
  projectId: string;
  version: number;
  title: string;
  summary: string;
  premise: string | null;
  worldRules: unknown | null;
  actStructure: unknown | null;
  timeline: unknown | null;
  levelProgression: unknown | null;
  pageBudget: unknown | null;
  styleGuide: unknown | null;
  openThreads: unknown | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Structured world rules for the campaign bible. */
export interface WorldRules {
  setting: string;
  era: string;
  magicLevel: string;
  technologyLevel: string;
  toneDescriptors: string[];
  forbiddenElements: string[];
  worldSpecificRules: string[];
}

/** One story beat in the act structure. */
export interface ActBeat {
  act: number;
  title: string;
  summary: string;
  levelRange: { min: number; max: number };
  chapterSlugs: string[];
}

/** A key event in the campaign timeline. */
export interface TimelineEvent {
  order: number;
  event: string;
  timeframe: string;
  significance: string;
}

/** Page budget for one chapter. */
export interface ChapterBudget {
  slug: string;
  title: string;
  targetPages: number;
  sections: string[];
}

/** Voice and vocabulary rules. */
export interface StyleGuide {
  voice: string;
  vocabulary: string[];
  avoidTerms: string[];
  narrativePerspective: string;
  toneNotes: string;
}

/** An entity mentioned in the campaign bible that becomes a CanonEntity. */
export interface BibleEntitySeed {
  entityType: 'npc' | 'location' | 'faction' | 'item' | 'quest';
  name: string;
  slug: string;
  summary: string;
  details: Record<string, unknown>;
}

/** Full structured output from the campaign bible generation step. */
export interface BibleContent {
  title: string;
  summary: string;
  premise: string;
  worldRules: WorldRules;
  actStructure: ActBeat[];
  timeline: TimelineEvent[];
  levelProgression: { type: 'milestone' | 'xp'; milestones: string[] } | null;
  pageBudget: ChapterBudget[];
  styleGuide: StyleGuide;
  openThreads: string[];
  entities: BibleEntitySeed[];
}
