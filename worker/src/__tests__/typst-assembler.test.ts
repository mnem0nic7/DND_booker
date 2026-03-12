import { describe, it, expect } from 'vitest';
import { assembleTypst } from '../renderers/typst-assembler.js';

function paragraph(text: string) {
  return {
    type: 'paragraph' as const,
    content: [{ type: 'text' as const, text }],
  };
}

function docWithParagraph(text: string) {
  return {
    type: 'doc' as const,
    content: [paragraph(text)],
  };
}

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

    it('should render the H1 show rule without a nested content block wrapper', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      const h1Rule = source.match(/#show heading\.where\(level: 1\):[\s\S]*?#show heading\.where\(level: 2\)/)?.[0] ?? '';
      expect(h1Rule).toContain('#set par(justify: false)');
      expect(h1Rule).toContain('#set text(hyphenate: false)');
      expect(h1Rule).not.toContain('block(width: 100%)');
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

    it('should include column gutter setting', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'dmguild',
        projectTitle: 'Test',
      });
      expect(source).toContain('#set columns(gutter: 0.9cm)');
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

    it('should inject title page and table of contents for multi-chapter book exports', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('Chapter one body'),
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('Chapter two body'),
            sortOrder: 2,
          },
          {
            title: 'The Final Ascent',
            kind: 'chapter',
            content: docWithParagraph('Chapter three body'),
            sortOrder: 3,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).toContain('#text(font: title-font, size: 28pt, weight: "bold")[The Ember Road]');
      expect(source).toContain('#outline(title: none, depth: 3)');
    });

    it('should not inject a synthetic table of contents for a short two-chapter one-shot', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('Chapter one body'),
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('Chapter two body'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).toContain('#text(font: title-font, size: 28pt, weight: "bold")[The Ember Road]');
      expect(source).not.toContain('#outline(title: none, depth: 3)');
    });

    it('should place table of contents on its own page without adding an extra blank page before the first chapter', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Foreword',
            kind: 'front_matter',
            content: docWithParagraph('A welcome for the reader.'),
            sortOrder: 1,
          },
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('Chapter one body'),
            sortOrder: 2,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('Chapter two body'),
            sortOrder: 3,
          },
          {
            title: 'The Final Ascent',
            kind: 'chapter',
            content: docWithParagraph('Chapter three body'),
            sortOrder: 4,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).toContain('#outline(title: none, depth: 3)');
      expect(source).not.toContain('#pagebreak()\n\n#pagebreak()');
    });

    it('should inject a chapter header when a long-form chapter document lacks an opener', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Foreword',
            kind: 'front_matter',
            content: docWithParagraph('A welcome for the reader.'),
            sortOrder: 0,
          },
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('The adventure begins at first light.'),
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('The road twists into the forest.'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).toContain('[Chapter 1]');
      expect(source).toContain('= Arrival at Dawn');
    });

    it('should strip a duplicate leading heading when injecting a chapter header', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Foreword',
            kind: 'front_matter',
            content: docWithParagraph('A welcome for the reader.'),
            sortOrder: 0,
          },
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: 'Arrival at Dawn' }],
                },
                paragraph('The adventure begins at first light.'),
              ],
            },
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('The road twists into the forest.'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).toContain('[Chapter 1]');
      expect(source.match(/Arrival at Dawn/g)?.length).toBe(1);
    });

    it('should not inject a synthetic chapter header for a single-chapter export', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Gravel Guardian Review',
            kind: 'chapter',
            content: docWithParagraph('Single-page reference copy'),
            sortOrder: 1,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Gravel Guardian Review',
      });

      expect(source).not.toContain('[Chapter 1]');
      expect(source).not.toContain('= Gravel Guardian Review');
      expect(source).toContain('Single-page reference copy');
    });

    it('should not inject a duplicate chapter header when one already exists', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'chapterHeader',
                  attrs: {
                    title: 'Arrival at Dawn',
                    chapterNumber: 'Chapter 1',
                  },
                },
                paragraph('The adventure begins at first light.'),
              ],
            },
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('The road twists into the forest.'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source.match(/= Arrival at Dawn/g)?.length).toBe(1);
    });

    it('should force chapter documents onto a fresh page boundary', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Foreword',
            kind: 'front_matter',
            content: docWithParagraph('A welcome for the reader.'),
            sortOrder: 1,
          },
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('The adventure begins at first light.'),
            sortOrder: 2,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('The road twists into the forest.'),
            sortOrder: 3,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      const chapterIndex = source.indexOf('= Arrival at Dawn');
      const breakIndex = source.lastIndexOf('#pagebreak()', chapterIndex);
      expect(chapterIndex).toBeGreaterThan(-1);
      expect(breakIndex).toBeGreaterThan(-1);
      expect(breakIndex).toBeLessThan(chapterIndex);
    });

    it('should add a long-form end cap when no explicit back matter exists', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('Chapter one body'),
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('Chapter two body'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).toContain('[THE END]');
    });

    it('should skip the long-form end cap when back matter is present', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('Chapter one body'),
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('Chapter two body'),
            sortOrder: 2,
          },
          {
            title: 'Back Cover',
            kind: 'back_matter',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'backCover',
                  attrs: {
                    blurb: 'A final teaser.',
                    authorBio: 'Written for brave adventurers.',
                  },
                },
              ],
            },
            sortOrder: 3,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
      });

      expect(source).not.toContain('[THE END]');
    });

    it('should disable justification and hyphenation for H1 headings', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(source).toContain('set par(justify: false)');
      expect(source).toContain('set text(hyphenate: false)');
    });

    it('should allow export polish to reduce H1 heading size', () => {
      const source = assembleTypst({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'Test',
        exportPolish: { h1SizePt: 21 },
      });

      expect(source).toContain('size: 21pt');
    });

    it('should render a dedicated closing page when requested by export polish', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            content: docWithParagraph('Chapter one body'),
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            content: docWithParagraph('Chapter two body'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
        exportPolish: { endCapMode: 'full_page' },
      });

      expect(source).toContain('#set page(columns: 1)');
      expect(source).toContain('[THE END]');
    });

    it('should render dedicated chapter opener pages when requested by export polish', () => {
      const source = assembleTypst({
        documents: [
          {
            title: 'Arrival at Dawn',
            kind: 'chapter',
            chapterNumberLabel: 'Chapter 1',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'chapterHeader',
                  attrs: {
                    title: 'Arrival at Dawn',
                    chapterNumber: 'Chapter 1',
                  },
                },
                paragraph('The adventure begins at first light.'),
              ],
            },
            sortOrder: 1,
          },
          {
            title: 'Into the Wilds',
            kind: 'chapter',
            chapterNumberLabel: 'Chapter 2',
            content: docWithParagraph('The road twists into the forest.'),
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'The Ember Road',
        exportPolish: { chapterOpenerMode: 'dedicated_page' },
      });

      expect(source).toContain('[Chapter 1]');
      expect(source).toContain('[Arrival at Dawn]');
      expect(source.match(/\[Arrival at Dawn\]/g)?.length).toBe(1);
      expect(source).not.toContain('= Arrival at Dawn');
    });
  });
});
