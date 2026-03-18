import type {
  AgentActionType,
  AgentBudget,
  AgentScorecard,
  CritiqueBacklogItem,
  DesignProfile,
} from '@dnd-booker/shared';

const LAYOUT_CODES = new Set([
  'EXPORT_CHAPTER_OPENER_LOW',
  'EXPORT_SECTION_TITLE_WRAP',
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_UNUSED_PAGE_REGION',
  'EXPORT_WEAK_HERO_PLACEMENT',
  'EXPORT_SPLIT_SCENE_PACKET',
  'EXPORT_UNBALANCED_COLUMNS',
]);

const STAT_BLOCK_CODES = new Set([
  'EXPORT_PLACEHOLDER_STAT_BLOCK',
  'EXPORT_INCOMPLETE_STAT_BLOCK',
  'EXPORT_SUSPICIOUS_STAT_BLOCK',
]);

const UTILITY_CODES = new Set([
  'EXPORT_LOW_UTILITY_DENSITY',
  'EXPORT_INCOMPLETE_ENCOUNTER_PACKET',
]);

export interface PlannedAgentAction {
  actionType: AgentActionType;
  rationale: string;
  targetTitle: string | null;
  relevantCodes: string[];
}

export function chooseNextAgentAction(input: {
  backlog: CritiqueBacklogItem[];
  scorecard: AgentScorecard;
  designProfile: DesignProfile;
  budget: AgentBudget;
  cycleCount: number;
  exportCount: number;
}): PlannedAgentAction {
  const highestPriority = [...input.backlog].sort((left, right) => right.priority - left.priority)[0] ?? null;

  if (!highestPriority) {
    return {
      actionType: 'no_op',
      rationale: 'No critique backlog remains, so there is no safe next mutation to apply.',
      targetTitle: null,
      relevantCodes: [],
    };
  }

  if (STAT_BLOCK_CODES.has(highestPriority.code)) {
    return {
      actionType: 'repair_stat_blocks',
      rationale: `The strongest remaining issue is untrustworthy creature mechanics. ${input.designProfile.constraints.find((constraint) => constraint.code === 'STAT_BLOCKS_TRUSTWORTHY')?.description ?? ''}`.trim(),
      targetTitle: highestPriority.targetTitle,
      relevantCodes: [highestPriority.code],
    };
  }

  if (highestPriority.code === 'EXPORT_THIN_RANDOM_TABLE') {
    return {
      actionType: 'expand_random_tables',
      rationale: `The highest-priority remaining weakness is thin random-table content. ${input.designProfile.constraints.find((constraint) => constraint.code === 'RANDOM_TABLES_RUNNABLE')?.description ?? ''}`.trim(),
      targetTitle: highestPriority.targetTitle,
      relevantCodes: [highestPriority.code],
    };
  }

  if (UTILITY_CODES.has(highestPriority.code)) {
    return {
      actionType: 'densify_section_utility',
      rationale: `The strongest remaining weakness is DM utility density. ${input.designProfile.constraints.find((constraint) => constraint.code === 'UTILITY_PACKETS_REQUIRED')?.description ?? ''}`.trim(),
      targetTitle: highestPriority.targetTitle,
      relevantCodes: [highestPriority.code],
    };
  }

  if (LAYOUT_CODES.has(highestPriority.code)) {
    return {
      actionType: 'refresh_layout_plan',
      rationale: `The strongest remaining issue is layout-related (${highestPriority.code}). ${input.designProfile.constraints.find((constraint) => constraint.code === 'ART_MUST_EARN_SPACE')?.description ?? ''}`.trim(),
      targetTitle: highestPriority.targetTitle,
      relevantCodes: [highestPriority.code],
    };
  }

  return {
    actionType: 'no_op',
    rationale: `The highest-priority issue (${highestPriority.code}) does not yet have an autonomous mutation strategy in this controller.`,
    targetTitle: highestPriority.targetTitle,
    relevantCodes: [highestPriority.code],
  };
}

export function shouldStopForBudget(input: {
  budget: AgentBudget;
  cycleCount: number;
  exportCount: number;
  noImprovementStreak: number;
  startedAt: number;
}) {
  if (input.cycleCount >= input.budget.maxCycles) return 'Reached the maximum control-cycle budget.';
  if (input.exportCount >= input.budget.maxExports) return 'Reached the maximum export-attempt budget.';
  if (input.noImprovementStreak >= input.budget.maxNoImprovementStreak) return 'Reached the no-improvement plateau limit.';
  if ((Date.now() - input.startedAt) >= input.budget.maxDurationMs) return 'Reached the maximum autonomous runtime budget.';
  return null;
}
