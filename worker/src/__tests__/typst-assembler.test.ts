import { describe, it, expect } from 'vitest';
import { assembleTypst } from '../renderers/typst-assembler.js';

describe('Typst Assembler', () => {
  describe('assembleTypst', () => {
    it('should include theme variables', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'My Campaign',
      });

      expect(source).toContain('#let theme-primary = rgb("#58180d")');
      expect(source).toContain('#let theme-secondary = rgb("#c9ad6a")');
      expect(source).toContain('#let heading-font = "Mr Eaves Small Caps"');
      expect(source).toContain('#let body-font = "Bookinsanity"');
    });

    it('should set up us-letter page with 2 columns', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('paper: "us-letter"');
      expect(source).toContain('columns: 2');
    });

    it('should set justified text', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('#set par(justify: true');
    });

    it('should include footer with counter(page) when not printReady', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('footer: context {');
      expect(source).toContain('counter(page).display()');
      expect(source).toContain('numbering: "1"');
    });

    it('should include background for themes with texture', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('background: image("textures/parchment-classic.jpg"');
    });

    it('should not include background for clean-modern (no texture)', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'clean-modern',
        projectTitle: 'Test',
      });

      expect(source).not.toContain('background: image(');
    });

    it('should render documents sorted by sortOrder', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Second',
            content: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Second Content' }] },
              ],
            },
            sortOrder: 2,
          },
          {
            title: 'First',
            content: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'First Content' }] },
              ],
            },
            sortOrder: 1,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      const firstIdx = source.indexOf('First Content');
      const secondIdx = source.indexOf('Second Content');
      expect(firstIdx).toBeGreaterThan(-1);
      expect(secondIdx).toBeGreaterThan(-1);
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('should handle null content documents by skipping them', () => {
      const source = assembleTypst({
        documents: [
          { title: 'Empty', content: null, sortOrder: 1 },
          {
            title: 'Valid',
            content: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
              ],
            },
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('Hello');
      // Should not crash or contain undefined
      expect(source).not.toContain('undefined');
    });

    it('should use wider margins and no footer for printReady mode', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
        printReady: true,
      });

      expect(source).toContain('margin: (top: 0.875in, bottom: 0.875in, inside: 0.875in, outside: 0.75in)');
      expect(source).not.toContain('footer:');
      expect(source).not.toContain('numbering: "1"');
    });

    it('should use standard margins when not printReady', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('margin: (top: 0.75in, bottom: 0.75in, inside: 0.75in, outside: 0.75in)');
    });

    it('should include DMGuild theme variables', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'dmguild',
        projectTitle: 'DMGuild Module',
      });

      expect(source).toContain('#let theme-primary = rgb("#58180D")');
      expect(source).toContain('#let heading-font = "Mr Eaves Small Caps"');
      expect(source).toContain('#let body-font = "Bookinsanity"');
      expect(source).toContain('#let theme-divider = rgb("#9C2B1B")');
      expect(source).toContain('background: image("textures/parchment-dmguild.jpg"');
    });

    it('should include heading show rules with theme colors', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('#show heading.where(level: 1)');
      expect(source).toContain('#show heading.where(level: 2)');
      expect(source).toContain('#show heading.where(level: 3)');
      expect(source).toContain('fill: theme-primary');
    });

    it('should set text font and size', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('#set text(font: body-font, size: 9.5pt, fill: theme-text)');
    });

    it('should use default theme for unknown theme name', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'nonexistent',
        projectTitle: 'Test',
      });

      // Falls back to classic-parchment
      expect(source).toContain('#let theme-primary = rgb("#58180d")');
    });

    it('should include column-gutter in page setup', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'dmguild',
        projectTitle: 'Test',
      });
      expect(source).toContain('column-gutter: 0.9cm');
    });

    it('should include H4 heading show rule', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'dmguild',
        projectTitle: 'Test',
      });
      expect(source).toContain('#show heading.where(level: 4)');
    });

    it('should include gold underline for H3', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'dmguild',
        projectTitle: 'Test',
      });
      expect(source).toContain('theme-header-underline');
    });

    it('should use gold footer text color', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'dmguild',
        projectTitle: 'Test',
      });
      expect(source).toContain('fill: theme-secondary');
    });
  });
});
