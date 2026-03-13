import { describe, expect, it } from 'vitest';
import type { DocumentContent } from '@dnd-booker/shared';
import { normalizeExportDocuments } from '../renderers/export-document-normalizer.js';

function doc(content: DocumentContent[]): DocumentContent {
  return { type: 'doc', content };
}

describe('normalizeExportDocuments', () => {
  it('replaces placeholder title-page fields, removes placeholder scaffold, and strips redundant front-matter page breaks', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Blank One-Shot',
        sortOrder: 0,
        content: doc([
          { type: 'titlePage', attrs: { title: 'One-Shot Title', subtitle: 'A D&D 5e One-Shot', author: 'Author Name' } },
          { type: 'pageBreak' },
          { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
          { type: 'pageBreak' },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'The Adventure' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Begin writing your one-shot adventure here...' }] },
          { type: 'pageBreak' },
          { type: 'paragraph', content: [{ type: 'text', text: 'Real adventure copy.' }] },
        ]),
      },
    ], 'Goblin Caper');

    expect(documents).toHaveLength(1);
    const nodes = documents[0].content?.content ?? [];

    expect(nodes[0]).toMatchObject({
      type: 'titlePage',
      attrs: {
        title: 'Goblin Caper',
        subtitle: '',
        author: '',
      },
    });
    expect(nodes[1]).toMatchObject({ type: 'tableOfContents' });
    expect(nodes[2]).toMatchObject({ type: 'paragraph' });
    expect(nodes.some((node) => node.type === 'heading')).toBe(false);
    expect(nodes.some((node) => node.type === 'pageBreak')).toBe(false);
  });

  it('removes placeholder credit lines and normalizes encounter table entries', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Appendix',
        sortOrder: 1,
        content: doc([
          {
            type: 'creditsPage',
            attrs: {
              credits: 'Written by Author Name\nEdited by Editor Name\nCartography by Alex Vale',
              legalText: 'Custom legal text',
              copyrightYear: '2026',
            },
          },
          {
            type: 'encounterTable',
            attrs: {
              environment: 'Ruins',
              crRange: '1-4',
              entries: JSON.stringify([
                { weight: 'oops', description: 'bad row', cr: '1' },
                { weight: 2, description: '1d4 skeletons', cr: '1/4' },
              ]),
            },
          },
        ]),
      },
    ], 'Goblin Caper');

    const nodes = documents[0].content?.content ?? [];
    expect(nodes[0]).toMatchObject({
      type: 'creditsPage',
      attrs: {
        credits: 'Cartography by Alex Vale',
      },
    });
    expect(nodes[1]).toMatchObject({
      type: 'encounterTable',
      attrs: {
        entries: JSON.stringify([{ weight: 2, description: '1d4 skeletons', cr: '1/4' }]),
      },
    });
  });

  it('repairs leaked markdown headings and prose block markers in exported documents', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Chapter 1: The Village',
        sortOrder: 1,
        kind: 'chapter',
        content: doc([
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '### The Tale of the Mine' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: ':::readAloud ' },
              { type: 'text', text: 'The cave entrance looms before you.', marks: [{ type: 'italic' }] },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: ':::dmTips Telegraph the danger before initiative is rolled.' }],
          },
        ]),
      },
    ], 'Goblin Caper');

    const nodes = documents[0].content?.content ?? [];
    expect(nodes[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'The Tale of the Mine' }],
    });
    expect(nodes[1]).toMatchObject({
      type: 'readAloudBox',
    });
    expect(nodes[2]).toMatchObject({
      type: 'sidebarCallout',
      attrs: { title: 'DM Tips', calloutType: 'info' },
    });
  });

  it('repairs structured block bleed-through leaked inside bullet lists', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Chapter 1: The Village',
        sortOrder: 1,
        kind: 'chapter',
        content: doc([
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: ':::npcProfile {"name":"Eldira Voss","race":"Human","role":"Tavern Keeper","traits":"Superstitious, distrustful","notes":"Knows about the previous mining operations."} :::',
                  }],
                }],
              },
              {
                type: 'listItem',
                content: [{
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: ':::npcProfile {"name":"Mira Thorne","race":"Elf","role":"Healer","traits":"Empathetic, observant","notes":"Hesitant to speak of the curse."} :::',
                  }],
                }],
              },
            ],
          },
        ]),
      },
    ], 'Goblin Caper');

    const nodes = documents[0].content?.content ?? [];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      type: 'npcProfile',
      attrs: {
        name: 'Eldira Voss',
        race: 'Human',
        class: 'Tavern Keeper',
        personalityTraits: 'Superstitious, distrustful',
        description: 'Knows about the previous mining operations.',
      },
    });
    expect(nodes[1]).toMatchObject({
      type: 'npcProfile',
      attrs: {
        name: 'Mira Thorne',
        race: 'Elf',
        class: 'Healer',
        personalityTraits: 'Empathetic, observant',
        description: 'Hesitant to speak of the curse.',
      },
    });
  });

  it('drops empty utility tables and their orphaned scaffolding', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Chapter 3: Secrets Beneath',
        sortOrder: 2,
        kind: 'chapter',
        content: doc([
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Use the following random table for discoveries in either path:' }],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Hidden Path Discoveries' }],
          },
          {
            type: 'randomTable',
            attrs: {
              title: 'Hidden Path Discoveries',
              dieType: 'd6',
              entries: JSON.stringify([]),
            },
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Encounter Table' }],
          },
          {
            type: 'encounterTable',
            attrs: {
              environment: 'Ancient hallways',
              crRange: '4-6',
              entries: JSON.stringify([]),
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Real body copy survives.' }],
          },
        ]),
      },
    ], 'Goblin Caper');

    expect(documents[0].content?.content).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Real body copy survives.' }],
      },
    ]);
  });

  it('normalizes legacy stat block and random table attrs during export cleanup', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Chapter 2: Into the Mine',
        sortOrder: 2,
        kind: 'chapter',
        content: doc([
          {
            type: 'statBlock',
            attrs: {
              name: 'Phantom Apparition',
              armorClass: 13,
              hitPoints: 10,
              strength: 1,
              dexterity: 15,
              reactions: JSON.stringify([{ type: 'Incorporeal Movement', description: 'The apparition moves through creatures.' }]),
            },
          },
          {
            type: 'randomTable',
            attrs: {
              title: 'Hidden Path Discoveries',
              dieType: 'd6',
              results: JSON.stringify([
                { result: 1, description: 'A cracked lantern still flickers.' },
                { result: 2, description: 'Footprints end at a cave wall.' },
              ]),
            },
          },
        ]),
      },
    ], 'Goblin Caper');

    const nodes = documents[0].content?.content ?? [];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      type: 'statBlock',
      attrs: {
        name: 'Phantom Apparition',
        armorClass: 13,
        hitPoints: 10,
        strength: 1,
        dexterity: 15,
        reactions: JSON.stringify([{ name: 'Incorporeal Movement', description: 'The apparition moves through creatures.' }]),
        ac: 13,
        hp: 10,
        str: 1,
        dex: 15,
      },
    });
    expect(nodes[1]).toEqual({
      type: 'randomTable',
      attrs: {
        title: 'Hidden Path Discoveries',
        dieType: 'd6',
        entries: JSON.stringify([
          { roll: '1', result: 'A cracked lantern still flickers.' },
          { roll: '2', result: 'Footprints end at a cave wall.' },
        ]),
      },
    });
  });

  it('demotes malformed long display headings to normal paragraphs', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Chapter 5',
        sortOrder: 5,
        kind: 'chapter',
        content: doc([
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [
              {
                type: 'text',
                text: 'The Shadow Prism An ancient artifact of immense power that can control shadows but corrupts its wielder.',
              },
            ],
          },
        ]),
      },
    ], 'Goblin Caper');

    expect(documents[0].content?.content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'The Shadow Prism An ancient artifact of immense power that can control shadows but corrupts its wielder.',
        },
      ],
    });
  });

  it('removes a duplicated chapter title heading immediately after a chapter header', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Chapter 3: The Gravel Guardian\'s Chamber',
        sortOrder: 3,
        kind: 'chapter',
        content: doc([
          {
            type: 'chapterHeader',
            attrs: {
              chapterNumber: 'Chapter 3',
              title: 'The Gravel Guardian\'s Chamber',
            },
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Chapter 3: The Gravel Guardian\'s Chamber' }],
          },
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Confronting the Gravel Guardian' }],
          },
        ]),
      },
    ], 'Goblin Caper');

    expect(documents[0].content?.content).toEqual([
      {
        type: 'chapterHeader',
        attrs: {
          chapterNumber: 'Chapter 3',
          title: 'The Gravel Guardian\'s Chamber',
        },
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Confronting the Gravel Guardian' }],
      },
    ]);
  });

  it('removes a table of contents from short one-shot front matter', () => {
    const documents = normalizeExportDocuments([
      {
        title: 'Front Matter',
        sortOrder: 0,
        kind: 'front_matter',
        content: doc([
          { type: 'titlePage', attrs: { title: 'The Blackglass Mine' } },
          { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
        ]),
      },
      {
        title: 'The Town',
        sortOrder: 1,
        kind: 'chapter',
        content: doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Town copy.' }] }]),
      },
      {
        title: 'The Mine',
        sortOrder: 2,
        kind: 'chapter',
        content: doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Mine copy.' }] }]),
      },
      {
        title: 'Deeper Mysteries',
        sortOrder: 3,
        kind: 'chapter',
        content: doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Mystery copy.' }] }]),
      },
      {
        title: 'The Final Stand',
        sortOrder: 4,
        kind: 'chapter',
        content: doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Finale copy.' }] }]),
      },
    ], 'The Blackglass Mine', { projectType: 'one_shot' });

    expect(documents[0].content?.content).toEqual([
      { type: 'titlePage', attrs: { title: 'The Blackglass Mine', subtitle: '', author: '' } },
    ]);
  });
});
