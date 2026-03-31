import { describe, expect, it } from 'vitest';
import {
  applyPublicationPolishEdits,
  derivePublicationPolishEdits,
} from '../../services/generation/publication-polish.helpers';

describe('publication-polish helpers', () => {
  it('removes leading, trailing, and consecutive page breaks', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'pageBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'pageBreak' },
        { type: 'pageBreak' },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Two' }] },
        { type: 'pageBreak' },
      ],
    };

    const edits = derivePublicationPolishEdits(content);
    expect(edits.map((edit) => edit.code)).toEqual([
      'REMOVE_LEADING_PAGE_BREAK',
      'REMOVE_CONSECUTIVE_PAGE_BREAK',
      'REMOVE_TRAILING_PAGE_BREAK',
    ]);

    const updated = applyPublicationPolishEdits(content, edits) as { content: Array<{ type: string }> };
    expect(updated.content.map((node) => node.type)).toEqual([
      'paragraph',
      'pageBreak',
      'heading',
    ]);
  });

  it('returns no edits for an already clean document', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter One' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Clean layout.' }] },
      ],
    };

    expect(derivePublicationPolishEdits(content)).toEqual([]);
    expect(applyPublicationPolishEdits(content, [])).toEqual(content);
  });

  it('inserts a page break before a mid-page chapter heading', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(2200) }] },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Two' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'The next act begins.' }] },
      ],
    };

    const edits = derivePublicationPolishEdits(content, [
      { code: 'CHAPTER_HEADING_MID_PAGE', affectedScope: 'node-1' },
    ]);

    expect(edits).toContainEqual(expect.objectContaining({
      kind: 'insertBefore',
      index: 1,
      code: 'INSERT_PAGE_BREAK_BEFORE_CHAPTER_HEADING',
    }));

    const updated = applyPublicationPolishEdits(content, edits) as { content: Array<{ type: string }> };
    expect(updated.content.map((node) => node.type)).toEqual([
      'paragraph',
      'pageBreak',
      'heading',
      'paragraph',
    ]);
  });

  it('removes manual page breaks that strand support blocks away from the prior page context', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Room setup.' }] },
        { type: 'pageBreak' },
        { type: 'statBlock', attrs: { name: 'Goblin Skirmisher' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'Tactics follow.' }] },
      ],
    };

    const edits = derivePublicationPolishEdits(content, [
      { code: 'REFERENCE_BLOCK_STRANDED_AFTER_BREAK', affectedScope: 'node-2' },
    ]);

    expect(edits).toContainEqual(expect.objectContaining({
      kind: 'remove',
      index: 1,
      code: 'REMOVE_PAGE_BREAK_BEFORE_REFERENCE_BLOCK',
    }));

    const updated = applyPublicationPolishEdits(content, edits) as { content: Array<{ type: string }> };
    expect(updated.content.map((node) => node.type)).toEqual([
      'paragraph',
      'statBlock',
      'paragraph',
    ]);
  });

  it('removes a manual page break that creates a nearly blank page', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A short bridge paragraph.' }] },
        { type: 'pageBreak' },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Fresh Page' }] },
      ],
    };

    const edits = derivePublicationPolishEdits(content, [
      { code: 'MANUAL_BREAK_NEARLY_BLANK_PAGE', affectedScope: 'node-1' },
    ]);

    expect(edits).toContainEqual(expect.objectContaining({
      kind: 'remove',
      index: 1,
      code: 'REMOVE_NEARLY_BLANK_PAGE_BREAK',
    }));

    const updated = applyPublicationPolishEdits(content, edits) as { content: Array<{ type: string }> };
    expect(updated.content.map((node) => node.type)).toEqual([
      'paragraph',
      'heading',
    ]);
  });

  it('inserts a page break before a mid-page chapterHeader block', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(2200) }] },
        { type: 'chapterHeader', attrs: { title: 'Chapter Two', chapterNumber: '2' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'The new chapter begins.' }] },
      ],
    };

    const edits = derivePublicationPolishEdits(content, [
      { code: 'CHAPTER_HEADING_MID_PAGE', affectedScope: 'node-1' },
    ]);

    expect(edits).toContainEqual(expect.objectContaining({
      kind: 'insertBefore',
      index: 1,
      code: 'INSERT_PAGE_BREAK_BEFORE_CHAPTER_HEADING',
      nodeType: 'chapterHeader',
    }));

    const updated = applyPublicationPolishEdits(content, edits) as { content: Array<{ type: string }> };
    expect(updated.content.map((node) => node.type)).toEqual([
      'paragraph',
      'pageBreak',
      'chapterHeader',
      'paragraph',
    ]);
  });

  it('does not insert a duplicate page break before a chapter heading already on a fresh page', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A'.repeat(2200) }] },
        { type: 'pageBreak' },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Two' }] },
      ],
    };

    const edits = derivePublicationPolishEdits(content, [
      { code: 'CHAPTER_HEADING_MID_PAGE', affectedScope: 'node-2' },
    ]);

    expect(edits).toEqual([]);
  });
});
