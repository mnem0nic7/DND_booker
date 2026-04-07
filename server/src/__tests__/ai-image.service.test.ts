import { describe, expect, it } from 'vitest';
import {
  normalizeImageModel,
  normalizeImageQuality,
  normalizeImageSize,
  sanitizeImagePrompt,
  stripImageTextRenderingInstructions,
} from '../services/ai-image.service.js';

describe('ai-image prompt sanitization', () => {
  it('maps legacy standard quality to a valid gpt-image-1 value', () => {
    expect(normalizeImageQuality('gpt-image-1', 'standard')).toBe('medium');
    expect(normalizeImageQuality('gpt-image-1', 'high')).toBe('high');
    expect(normalizeImageQuality('gpt-image-1', 'hd')).toBeUndefined();
  });

  it('maps generic image requests onto the active provider image model', () => {
    expect(normalizeImageModel('openai', 'gpt-image-1')).toBe('gpt-image-1');
    expect(normalizeImageModel('google', 'gpt-image-1')).toBe('gemini-2.5-flash-image');
  });

  it('accepts Gemini image sizes through the shared validator', () => {
    expect(normalizeImageSize('google', 'gemini-2.5-flash-image', '1024x1024')).toBe('1024x1024');
    expect(() => normalizeImageSize('google', 'gemini-2.5-flash-image', '2048x2048')).toThrow(/Invalid size/);
  });

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
