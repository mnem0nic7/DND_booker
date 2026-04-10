import { describe, expect, it } from 'vitest';
import { shouldPreferQuickModeGoogleFlash } from '../jobs/generation-orchestrator.job.js';

describe('generation orchestrator model routing', () => {
  it('prefers the Google Flash lane for quick-mode heavy generation stages', () => {
    expect(shouldPreferQuickModeGoogleFlash('agent.bible', false)).toBe(true);
    expect(shouldPreferQuickModeGoogleFlash('agent.outline', false)).toBe(true);
    expect(shouldPreferQuickModeGoogleFlash('agent.canon', false)).toBe(true);
    expect(shouldPreferQuickModeGoogleFlash('agent.chapter_draft', false)).toBe(true);
    expect(shouldPreferQuickModeGoogleFlash('agent.layout', false)).toBe(true);
  });

  it('keeps polished runs and unrelated stages off the quick downgrade path', () => {
    expect(shouldPreferQuickModeGoogleFlash('agent.bible', true)).toBe(false);
    expect(shouldPreferQuickModeGoogleFlash('agent.intake', false)).toBe(false);
    expect(shouldPreferQuickModeGoogleFlash('agent.evaluator', false)).toBe(false);
  });
});
