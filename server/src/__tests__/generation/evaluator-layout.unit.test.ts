import { describe, expect, it } from 'vitest';
import {
  applyDeterministicPublicationPenalty,
  mergeEvaluationFindings,
} from '../../services/generation/evaluator-layout-helpers';

type EvaluationFinding = {
  severity: 'critical' | 'major' | 'minor' | 'informational';
  code: string;
  message: string;
  affectedScope: string;
  suggestedFix?: string;
};

describe('generation evaluator layout helpers', () => {
  it('merges deterministic findings ahead of model findings without duplicates', () => {
    const deterministic: EvaluationFinding[] = [
      {
        severity: 'major',
        code: 'CHAPTER_HEADING_MID_PAGE',
        message: 'Heading starts mid-page.',
        affectedScope: 'node-10',
        suggestedFix: 'Start the chapter on a fresh page.',
      },
    ];
    const model: EvaluationFinding[] = [
      {
        severity: 'major',
        code: 'CHAPTER_HEADING_MID_PAGE',
        message: 'Chapter heading appears too low on the page.',
        affectedScope: 'node-10',
      },
      {
        severity: 'informational',
        code: 'GOOD_PACING',
        message: 'Reads cleanly.',
        affectedScope: 'global',
      },
    ];

    const merged = mergeEvaluationFindings(model, deterministic);
    expect(merged).toHaveLength(2);
    expect(merged[0].code).toBe('CHAPTER_HEADING_MID_PAGE');
    expect(merged[0].message).toBe('Heading starts mid-page.');
  });

  it('penalizes publicationFit for deterministic layout problems', () => {
    const findings: EvaluationFinding[] = [
      {
        severity: 'major',
        code: 'CONSECUTIVE_PAGE_BREAKS',
        message: 'Duplicate page breaks.',
        affectedScope: 'node-5',
      },
      {
        severity: 'minor',
        code: 'SPLIT_REFERENCE_BLOCK',
        message: 'Block spans more than one page.',
        affectedScope: 'node-9',
      },
    ];

    expect(applyDeterministicPublicationPenalty(90, findings)).toBe(72);
  });
});
