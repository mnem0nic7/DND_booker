import { describe, expect, it } from 'vitest';
import { analyzeCompiledBookStructure } from '../../services/generation/book-structure-preflight.service.js';

describe('book-structure-preflight.service', () => {
  it('flags empty chapters and invalid document ordering', () => {
    const result = analyzeCompiledBookStructure([
      {
        slug: 'chapter-one',
        title: 'Chapter One',
        kind: 'chapter',
        sortOrder: 1,
        content: { type: 'doc', content: [] },
      },
      {
        slug: 'front',
        title: 'Front Matter',
        kind: 'front_matter',
        sortOrder: 2,
        content: {
          type: 'doc',
          content: [{ type: 'titlePage', attrs: { title: 'Test Book' } }],
        },
      },
    ]);

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'EMPTY_DOCUMENT',
        severity: 'error',
        documentSlug: 'chapter-one',
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'DOCUMENT_ORDER_INVALID',
        severity: 'error',
        documentSlug: 'front',
      }),
    );
    expect(result.stats.emptyDocuments).toBe(1);
  });

  it('tracks TOC and chapter-opening structure across the compiled book', () => {
    const result = analyzeCompiledBookStructure([
      {
        slug: 'front',
        title: 'Front Matter',
        kind: 'front_matter',
        sortOrder: 0,
        content: {
          type: 'doc',
          content: [
            { type: 'titlePage', attrs: { title: 'The Amber Vault' } },
            { type: 'tableOfContents', attrs: { title: 'Contents' } },
          ],
        },
      },
      {
        slug: 'chapter-one',
        title: 'Chapter One',
        kind: 'chapter',
        sortOrder: 1,
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Chapter One' }],
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'The adventure begins.' }],
            },
          ],
        },
      },
      {
        slug: 'chapter-two',
        title: 'Chapter Two',
        kind: 'chapter',
        sortOrder: 2,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'This opens abruptly without a heading.' }],
            },
          ],
        },
      },
    ]);

    expect(result.stats.documentsAnalyzed).toBe(3);
    expect(result.stats.titlePageCount).toBe(1);
    expect(result.stats.tableOfContentsCount).toBe(1);
    expect(result.stats.tocEntries).toBe(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CHAPTER_OPENS_WITHOUT_HEADER',
        severity: 'warning',
        documentSlug: 'chapter-two',
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CHAPTER_HEADER_MISSING',
        severity: 'warning',
        documentSlug: 'chapter-two',
      }),
    );
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({ code: 'TOC_MISSING' }),
    );
  });
});
