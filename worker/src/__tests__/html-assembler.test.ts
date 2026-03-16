import { describe, it, expect } from 'vitest';
import { assembleHtml } from '../renderers/html-assembler.js';

describe('HTML Assembler', () => {
  describe('assembleHtml', () => {
    it('should produce valid HTML with theme variables', () => {
      const html = assembleHtml({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'My Campaign',
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>My Campaign</title>');
      expect(html).toContain('--color-primary: #58180d');
      expect(html).toContain('--page-texture: url("file://');
    });

    it('should escape project title in HTML', () => {
      const html = assembleHtml({
        documents: [],
        theme: 'clean-modern',
        projectTitle: 'My <script>alert(1)</script> Campaign',
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should use default theme for unknown theme name', () => {
      const html = assembleHtml({
        documents: [],
        theme: 'nonexistent',
        projectTitle: 'Test',
      });

      // Falls back to classic-parchment style
      expect(html).toContain('--color-primary: #58180d');
    });

    it('should render documents in sortOrder', () => {
      const html = assembleHtml({
        documents: [
          { title: 'Second', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second Content' }] }] }, sortOrder: 2 },
          { title: 'First', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First Content' }] }] }, sortOrder: 1 },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      const firstIdx = html.indexOf('First Content');
      const secondIdx = html.indexOf('Second Content');
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('should not keep legacy forced page breaks on structural blocks in paged mode', () => {
      const html = assembleHtml({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'My Campaign',
      });

      expect(html).not.toMatch(/\.chapter-header\s*\{[^}]*page-break-before:/s);
      expect(html).not.toMatch(/\.title-page\s*\{[^}]*page-break-after:/s);
      expect(html).not.toMatch(/\.table-of-contents\s*\{[^}]*page-break-after:/s);
      expect(html).not.toMatch(/\.credits-page\s*\{[^}]*page-break-before:/s);
      expect(html).not.toMatch(/\.back-cover\s*\{[^}]*page-break-before:/s);
    });

    it('collapses page stack gaps in print so paged exports do not emit spacer pages', () => {
      const html = assembleHtml({
        documents: [],
        theme: 'classic-parchment',
        projectTitle: 'My Campaign',
      });

      expect(html).toContain('.layout-page-stack');
      expect(html).toContain('gap: 0 !important;');
    });
  });

  describe('Table of Contents auto-generation', () => {
    it('should inject chapter headers into ToC entries', () => {
      const html = assembleHtml({
        documents: [
          {
            title: 'ToC Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'tableOfContents', attrs: { title: 'Contents' } },
              ],
            },
            sortOrder: 1,
          },
          {
            title: 'Chapter Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'chapterHeader', attrs: { title: 'The Beginning', chapterNumber: '1', subtitle: '' } },
                { type: 'chapterHeader', attrs: { title: 'The End', chapterNumber: '2', subtitle: '' } },
              ],
            },
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(html).toContain('table-of-contents__entry');
      expect(html).toContain('1.');
      expect(html).toContain('The Beginning');
      expect(html).toContain('2.');
      expect(html).toContain('The End');
    });

    it('should inject heading nodes (h1, h2, h3) into ToC entries', () => {
      const html = assembleHtml({
        documents: [
          {
            title: 'ToC Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'tableOfContents', attrs: { title: 'Contents' } },
              ],
            },
            sortOrder: 1,
          },
          {
            title: 'Content Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Main Title' }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sub Section' }] },
                { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Detail' }] },
              ],
            },
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(html).toContain('Main Title');
      expect(html).toContain('Sub Section');
      expect(html).toContain('Detail');
      // h2 and h3 should be indented
      expect(html).toContain('padding-left: 1.2rem');
      expect(html).toContain('padding-left: 2.4rem');
    });

    it('should show "No chapters or headings found" when no entries exist', () => {
      const html = assembleHtml({
        documents: [
          {
            title: 'ToC Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'tableOfContents', attrs: { title: 'Contents' } },
              ],
            },
            sortOrder: 1,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      expect(html).toContain('No chapters or headings found');
    });

    it('should skip h4+ headings from ToC entries', () => {
      const html = assembleHtml({
        documents: [
          {
            title: 'ToC Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'tableOfContents', attrs: { title: 'Contents' } },
              ],
            },
            sortOrder: 1,
          },
          {
            title: 'Content Doc',
            content: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Too Deep' }] },
              ],
            },
            sortOrder: 2,
          },
        ],
        theme: 'classic-parchment',
        projectTitle: 'Test',
      });

      // h4 heading appears in document body but NOT in ToC entries
      const tocSection = html.match(/class="table-of-contents__entries">([\s\S]*?)<\/div>/)?.[1] || '';
      expect(tocSection).not.toContain('Too Deep');
      expect(tocSection).toContain('No chapters or headings found');
    });
  });
});
