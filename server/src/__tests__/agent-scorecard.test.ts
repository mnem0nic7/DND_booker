import { describe, expect, it } from 'vitest';
import {
  buildScorecardFromExportReview,
  isMeaningfulImprovement,
  isTargetQuality,
} from '../services/agent/scorecard.service.js';

describe('agent scorecard service', () => {
  it('builds a scorecard and backlog from export review findings', () => {
    const { scorecard, backlog } = buildScorecardFromExportReview('job-1', {
      status: 'needs_attention',
      score: 58,
      generatedAt: new Date().toISOString(),
      summary: 'Export review found layout and table issues.',
      passCount: 1,
      appliedFixes: [],
      findings: [
        {
          code: 'EXPORT_THIN_RANDOM_TABLE',
          severity: 'warning',
          page: 8,
          message: 'Chapter 2 random table is too thin.',
          details: { title: 'Chapter 2: The Mine' },
        },
        {
          code: 'EXPORT_UNUSED_PAGE_REGION',
          severity: 'warning',
          page: 6,
          message: 'Page 6 has excessive dead space.',
          details: { title: 'Chapter 1: Arrival' },
        },
        {
          code: 'EXPORT_LOW_UTILITY_DENSITY',
          severity: 'warning',
          page: null,
          message: 'Chapter 2 is prose-heavy and under-indexed.',
          details: { title: 'Chapter 2: The Mine' },
        },
        {
          code: 'EXPORT_SUSPICIOUS_STAT_BLOCK',
          severity: 'warning',
          page: null,
          message: 'Chapter 3 includes a suspicious stat block.',
          details: { title: 'Chapter 3: The Deep' },
        },
      ],
      metrics: {
        pageCount: 12,
        pageWidthPts: 612,
        pageHeightPts: 792,
        lastPageFillRatio: 0.22,
        sectionStarts: [],
        utilityCoverage: [
          { title: 'Chapter 1: Arrival', kind: 'chapter', utilityBlockCount: 2, referenceBlockCount: 1, proseParagraphCount: 5, utilityDensity: 0.375 },
          { title: 'Chapter 2: The Mine', kind: 'chapter', utilityBlockCount: 1, referenceBlockCount: 1, proseParagraphCount: 6, utilityDensity: 0.25 },
        ],
      },
    });

    expect(scorecard.overallScore).toBe(58);
    expect(scorecard.thinRandomTableCount).toBe(1);
    expect(scorecard.sparsePageCount).toBe(1);
    expect(scorecard.lowUtilityDensityCount).toBe(1);
    expect(scorecard.suspiciousStatBlockCount).toBe(1);
    expect(backlog[0]?.code).toBe('EXPORT_THIN_RANDOM_TABLE');
  });

  it('detects meaningful improvement and target quality', () => {
    const previous = {
      overallScore: 60,
      exportScore: 60,
      blockingFindingCount: 1,
      warningFindingCount: 3,
      utilityDensityAverage: 0.45,
      sparsePageCount: 1,
      thinRandomTableCount: 1,
      lowUtilityDensityCount: 2,
      suspiciousStatBlockCount: 1,
      generatedAt: new Date().toISOString(),
      summary: 'Previous score',
      latestExportJobId: 'job-prev',
    };
    const next = {
      overallScore: 93,
      exportScore: 93,
      blockingFindingCount: 0,
      warningFindingCount: 0,
      utilityDensityAverage: 0.72,
      sparsePageCount: 0,
      thinRandomTableCount: 0,
      lowUtilityDensityCount: 0,
      suspiciousStatBlockCount: 0,
      generatedAt: new Date().toISOString(),
      summary: 'Next score',
      latestExportJobId: 'job-next',
    };

    expect(isMeaningfulImprovement(previous, next)).toBe(true);
    expect(isTargetQuality(next)).toBe(true);
  });
});
