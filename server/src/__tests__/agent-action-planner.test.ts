import { describe, expect, it } from 'vitest';
import { chooseNextAgentAction, shouldStopForBudget } from '../services/agent/action-planner.service.js';
import { buildDefaultDesignProfile } from '../services/agent/design-profile.service.js';

describe('agent action planner', () => {
  const designProfile = buildDefaultDesignProfile('Test Project');
  const budget = {
    maxCycles: 4,
    maxExports: 6,
    maxImagePassesPerDocument: 2,
    maxNoImprovementStreak: 2,
    maxDurationMs: 60_000,
  } as const;

  it('prioritizes thin random table fixes', () => {
    const plan = chooseNextAgentAction({
      backlog: [
        {
          id: 'rt-1',
          code: 'EXPORT_THIN_RANDOM_TABLE',
          title: 'Thin random table',
          detail: 'Chapter 2 random table is too thin.',
          severity: 'warning',
          priority: 100,
          targetTitle: 'Chapter 2: The Mine',
          page: 8,
        },
      ],
      scorecard: {
        overallScore: 42,
        exportScore: 42,
        blockingFindingCount: 0,
        warningFindingCount: 1,
        utilityDensityAverage: 0.4,
        sparsePageCount: 0,
        thinRandomTableCount: 1,
        lowUtilityDensityCount: 0,
        suspiciousStatBlockCount: 0,
        generatedAt: new Date().toISOString(),
        summary: 'Needs stronger random tables.',
        latestExportJobId: 'job-1',
      },
      designProfile,
      budget,
      cycleCount: 1,
      exportCount: 1,
    });

    expect(plan.actionType).toBe('expand_random_tables');
    expect(plan.targetTitle).toBe('Chapter 2: The Mine');
  });

  it('chooses layout refresh for layout findings', () => {
    const plan = chooseNextAgentAction({
      backlog: [
        {
          id: 'layout-1',
          code: 'EXPORT_UNUSED_PAGE_REGION',
          title: 'Unused page region',
          detail: 'Page 6 has too much dead space.',
          severity: 'warning',
          priority: 80,
          targetTitle: 'Chapter 1: Arrival',
          page: 6,
        },
      ],
      scorecard: {
        overallScore: 61,
        exportScore: 61,
        blockingFindingCount: 0,
        warningFindingCount: 1,
        utilityDensityAverage: 0.5,
        sparsePageCount: 1,
        thinRandomTableCount: 0,
        lowUtilityDensityCount: 0,
        suspiciousStatBlockCount: 0,
        generatedAt: new Date().toISOString(),
        summary: 'Layout needs tightening.',
        latestExportJobId: 'job-2',
      },
      designProfile,
      budget,
      cycleCount: 2,
      exportCount: 2,
    });

    expect(plan.actionType).toBe('refresh_layout_plan');
    expect(plan.targetTitle).toBe('Chapter 1: Arrival');
  });

  it('prioritizes layout parity audits ahead of generic layout refresh', () => {
    const plan = chooseNextAgentAction({
      backlog: [
        {
          id: 'parity-1',
          code: 'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
          title: 'Grouped layout drift',
          detail: 'A packet lands on different pages between legacy and Pretext.',
          severity: 'error',
          priority: 95,
          targetTitle: 'Chapter 1: Arrival',
          page: 6,
        },
      ],
      scorecard: {
        overallScore: 61,
        exportScore: 61,
        blockingFindingCount: 1,
        warningFindingCount: 0,
        utilityDensityAverage: 0.5,
        sparsePageCount: 0,
        thinRandomTableCount: 0,
        lowUtilityDensityCount: 0,
        suspiciousStatBlockCount: 0,
        generatedAt: new Date().toISOString(),
        summary: 'Parity drift needs targeted remediation.',
        latestExportJobId: 'job-parity',
      },
      designProfile,
      budget,
      cycleCount: 2,
      exportCount: 2,
    });

    expect(plan.actionType).toBe('audit_layout_parity');
    expect(plan.targetTitle).toBe('Chapter 1: Arrival');
  });

  it('chooses stat-block repair for suspicious or placeholder stat blocks', () => {
    const plan = chooseNextAgentAction({
      backlog: [
        {
          id: 'sb-1',
          code: 'EXPORT_SUSPICIOUS_STAT_BLOCK',
          title: 'Suspicious stat block',
          detail: 'Chapter 3 includes a suspicious apparition stat block.',
          severity: 'warning',
          priority: 90,
          targetTitle: 'Chapter 3: The Deep',
          page: 10,
        },
      ],
      scorecard: {
        overallScore: 55,
        exportScore: 55,
        blockingFindingCount: 0,
        warningFindingCount: 1,
        utilityDensityAverage: 0.51,
        sparsePageCount: 0,
        thinRandomTableCount: 0,
        lowUtilityDensityCount: 0,
        suspiciousStatBlockCount: 1,
        generatedAt: new Date().toISOString(),
        summary: 'Creature mechanics need repair.',
        latestExportJobId: 'job-3',
      },
      designProfile,
      budget,
      cycleCount: 1,
      exportCount: 1,
    });

    expect(plan.actionType).toBe('repair_stat_blocks');
    expect(plan.targetTitle).toBe('Chapter 3: The Deep');
  });

  it('chooses utility densification for prose-heavy chapters', () => {
    const plan = chooseNextAgentAction({
      backlog: [
        {
          id: 'ud-1',
          code: 'EXPORT_LOW_UTILITY_DENSITY',
          title: 'Low utility density',
          detail: 'Chapter 2 is prose-heavy and under-indexed.',
          severity: 'warning',
          priority: 70,
          targetTitle: 'Chapter 2: The Mine',
          page: 7,
        },
      ],
      scorecard: {
        overallScore: 57,
        exportScore: 57,
        blockingFindingCount: 0,
        warningFindingCount: 1,
        utilityDensityAverage: 0.11,
        sparsePageCount: 0,
        thinRandomTableCount: 0,
        lowUtilityDensityCount: 1,
        suspiciousStatBlockCount: 0,
        generatedAt: new Date().toISOString(),
        summary: 'Needs more DM aids.',
        latestExportJobId: 'job-4',
      },
      designProfile,
      budget,
      cycleCount: 1,
      exportCount: 1,
    });

    expect(plan.actionType).toBe('densify_section_utility');
    expect(plan.targetTitle).toBe('Chapter 2: The Mine');
  });

  it('stops when budget caps are reached', () => {
    const stopReason = shouldStopForBudget({
      budget,
      cycleCount: 4,
      exportCount: 2,
      noImprovementStreak: 0,
      startedAt: Date.now(),
    });

    expect(stopReason).toContain('maximum control-cycle budget');
  });
});
