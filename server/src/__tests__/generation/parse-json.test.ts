import { describe, expect, it } from 'vitest';
import { parseJsonResponse } from '../../services/generation/parse-json.js';

describe('parseJsonResponse', () => {
  it('parses strict JSON unchanged', () => {
    expect(parseJsonResponse('{"title":"Underdark Afterdark","pages":24}')).toEqual({
      title: 'Underdark Afterdark',
      pages: 24,
    });
  });

  it('extracts JSON from markdown fences and surrounding prose', () => {
    const text = [
      'Here is the evaluation result:',
      '```json',
      '{"publicationFit":84,"recommendedActions":["Tighten the opener"]}',
      '```',
    ].join('\n');

    expect(parseJsonResponse(text)).toEqual({
      publicationFit: 84,
      recommendedActions: ['Tighten the opener'],
    });
  });

  it('repairs JS-style objects with bare keys, single quotes, comments, and trailing commas', () => {
    const text = `{
      structuralCompleteness: 84,
      continuityScore: 86,
      dndSanity: 83,
      editorialQuality: 81,
      publicationFit: 79,
      findings: [
        {
          severity: 'major',
          code: 'WEAK_OPENING',
          message: 'The opening scene needs stronger hooks.',
          affectedScope: 'chapter-1',
          suggestedFix: 'Add a sharper inciting incident.',
        },
      ],
      // evaluator note
      recommendedActions: ['Strengthen chapter one',],
    }`;

    expect(parseJsonResponse(text)).toEqual({
      structuralCompleteness: 84,
      continuityScore: 86,
      dndSanity: 83,
      editorialQuality: 81,
      publicationFit: 79,
      findings: [
        {
          severity: 'major',
          code: 'WEAK_OPENING',
          message: 'The opening scene needs stronger hooks.',
          affectedScope: 'chapter-1',
          suggestedFix: 'Add a sharper inciting incident.',
        },
      ],
      recommendedActions: ['Strengthen chapter one'],
    });
  });

  it('escapes raw control characters that appear inside JSON strings', () => {
    const text = '{\n'
      + '  "chapterSlug": "chapter-1-town-square",\n'
      + '  "notes": "Line one\nLine two\twith tabs"\n'
      + '}';

    expect(parseJsonResponse(text)).toEqual({
      chapterSlug: 'chapter-1-town-square',
      notes: 'Line one\nLine two\twith tabs',
    });
  });

  it('throws a contextual error when the payload is not recoverable JSON', () => {
    expect(() => parseJsonResponse('not even close to json')).toThrow(
      /Failed to parse AI JSON response/,
    );
  });
});
