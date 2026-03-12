import { describe, expect, it } from 'vitest';
import { splitProjectContentIntoDocuments } from '../services/project-document-bootstrap.service.js';

describe('splitProjectContentIntoDocuments', () => {
  it('splits template-style front matter, chapter content, and back matter into separate documents', () => {
    const docs = splitProjectContentIntoDocuments('Underdark Afterdark', 'one_shot', {
      type: 'doc',
      content: [
        { type: 'titlePage', attrs: { title: 'One-Shot Title', subtitle: 'A D&D 5e One-Shot', author: 'Author Name' } },
        { type: 'pageBreak' },
        { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
        { type: 'pageBreak' },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'The Adventure' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Begin writing your one-shot adventure here...' }] },
        { type: 'pageBreak' },
        { type: 'creditsPage', attrs: { credits: 'Written by Author Name' } },
      ],
    });

    expect(docs.map((doc) => ({ title: doc.title, kind: doc.kind, slug: doc.slug }))).toEqual([
      { title: 'Title Page', kind: 'front_matter', slug: 'title-page' },
      { title: 'Table of Contents', kind: 'front_matter', slug: 'table-of-contents' },
      { title: 'The Adventure', kind: 'chapter', slug: 'the-adventure' },
      { title: 'Credits', kind: 'back_matter', slug: 'credits' },
    ]);

    expect(docs[2].content.content?.some((node) => node.type === 'pageBreak')).toBe(false);
  });

  it('creates a single fallback chapter document for blank content', () => {
    const docs = splitProjectContentIntoDocuments('My Campaign', 'campaign', {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });

    expect(docs).toHaveLength(1);
    expect(docs[0].kind).toBe('chapter');
    expect(docs[0].title).toBe('My Campaign');
    expect(docs[0].slug).toBe('my-campaign');
  });
});
