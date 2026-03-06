import type { GenerationMode } from './generation-run.js';

/**
 * Mode-specific defaults for page targets and content counts.
 * Used by intake to fill in gaps when the user doesn't specify.
 */
export const MODE_DEFAULTS: Record<GenerationMode, {
  pageRange: [number, number];
  chapterRange: [number, number];
  npcRange: [number, number];
  locationRange: [number, number];
}> = {
  one_shot: { pageRange: [8, 18], chapterRange: [2, 5], npcRange: [2, 6], locationRange: [2, 4] },
  module: { pageRange: [24, 60], chapterRange: [4, 8], npcRange: [4, 10], locationRange: [4, 8] },
  campaign: { pageRange: [80, 200], chapterRange: [8, 15], npcRange: [8, 20], locationRange: [8, 20] },
  sourcebook: { pageRange: [80, 250], chapterRange: [10, 20], npcRange: [4, 12], locationRange: [4, 12] },
};

/**
 * Structured output of the intake normalization step.
 * The AI extracts this from the user's freeform prompt.
 */
export interface NormalizedInput {
  title: string;
  summary: string;
  inferredMode: GenerationMode;
  tone: string;
  themes: string[];
  setting: string;
  premise: string;
  levelRange: { min: number; max: number } | null;
  pageTarget: number;
  chapterEstimate: number;
  constraints: {
    strict5e: boolean;
    includeHandouts: boolean;
    includeMaps: boolean;
  };
  keyElements: {
    npcs: string[];
    locations: string[];
    plotHooks: string[];
    items: string[];
  };
}
