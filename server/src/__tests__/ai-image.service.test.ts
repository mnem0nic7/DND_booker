import { describe, expect, it } from 'vitest';
import { sanitizeImagePrompt, stripImageTextRenderingInstructions } from '../services/ai-image.service.js';

describe('ai-image prompt sanitization', () => {
  it('removes direct requests for visible words and lettering', () => {
    const sanitized = sanitizeImagePrompt(
      'A painted fantasy book cover for The Blackglass Mine. Put the title across the top in ornate lettering, add a logo, and include a caption at the bottom.',
    );

    expect(sanitized).toMatch(/^A painted fantasy book cover for The Blackglass Mine\b/i);
    expect(sanitized).not.toMatch(/put the title/i);
    expect(sanitized).not.toMatch(/ornate lettering/i);
    expect(sanitized).not.toMatch(/\bcaption\b/i);
    expect(sanitized).not.toMatch(/\blogo\b/i);
    expect(sanitized).toMatch(/No visible words, no letters, no typography, no captions, no labels, no logos, no watermark\./i);
  });

  it('strips text-read instructions without destroying the scene context', () => {
    const stripped = stripImageTextRenderingInstructions(
      'A moonlit mine entrance with a warning sign. Add text that reads Beware Below. Show distant lanterns and wet stone.',
    );

    expect(stripped).toMatch(/A moonlit mine entrance with a warning sign\./i);
    expect(stripped).toMatch(/Show distant lanterns and wet stone\./i);
    expect(stripped).not.toMatch(/Beware Below/i);
    expect(stripped).not.toMatch(/Add text/i);
  });
});
