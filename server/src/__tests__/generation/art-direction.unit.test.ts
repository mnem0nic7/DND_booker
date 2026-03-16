import { describe, it, expect } from 'vitest';
import {
  applyArtDirectionPlanToDocuments,
  applyRealizedArtToDocuments,
  collectImageSlots,
  ensureChapterHeaderImageSlot,
  ensureTitlePageSlot,
  finalizeArtPrompt,
  selectAutomaticArtSlots,
} from '../../services/generation/art-direction.service.js';

describe('art-direction helpers', () => {
  it('collects empty image-capable slots and skips filled ones', () => {
    const slots = collectImageSlots([
      {
        id: 'doc-front',
        slug: 'front-matter',
        title: 'Front Matter',
        content: {
          type: 'doc',
          content: [
            {
              type: 'titlePage',
              attrs: {
                title: 'The Blackglass Mine',
                subtitle: 'A one-shot',
                author: 'DND Booker',
                coverImageUrl: '',
                imagePrompt: '',
              },
            },
            {
              type: 'chapterHeader',
              attrs: {
                title: 'Chapter 1: The Mine Mouth',
                chapterNumber: 'Chapter 1',
                subtitle: 'The air tastes of ash',
                backgroundImage: '/uploads/project/banner.png',
                imagePrompt: '',
              },
            },
          ],
        },
      },
      {
        id: 'doc-ch1',
        slug: 'chapter-1',
        title: 'Chapter 1',
        content: {
          type: 'doc',
          content: [
            {
              type: 'npcProfile',
              attrs: {
                name: 'Foreman Talia',
                race: 'Human',
                class: 'Scout',
                description: 'A soot-streaked foreman with a steady stare.',
                portraitUrl: '',
                imagePrompt: '',
              },
            },
          ],
        },
      },
    ]);

    expect(slots).toHaveLength(2);
    expect(slots).toMatchObject([
      { documentSlug: 'front-matter', blockType: 'titlePage', nodeIndex: 0 },
      { documentSlug: 'chapter-1', blockType: 'npcProfile', nodeIndex: 0 },
    ]);
  });

  it('automatically selects a complete art package without user decisions', () => {
    const selected = selectAutomaticArtSlots([
      {
        documentId: 'doc-front',
        documentSlug: 'front-matter',
        documentTitle: 'Front Matter',
        kind: 'front_matter',
        blockType: 'titlePage',
        nodeIndex: 0,
        context: 'A black-glass mine under a crimson moon.',
      },
      {
        documentId: 'doc-ch1',
        documentSlug: 'chapter-1',
        documentTitle: 'Chapter 1: The Descent',
        kind: 'chapter',
        blockType: 'chapterHeader',
        nodeIndex: 0,
        context: 'A rope bridge over a glowing chasm.',
      },
      {
        documentId: 'doc-ch2',
        documentSlug: 'chapter-2',
        documentTitle: 'Chapter 2: The Negotiation',
        kind: 'chapter',
        blockType: 'chapterHeader',
        nodeIndex: 0,
        context: 'A tense audience with drow envoys.',
      },
      {
        documentId: 'doc-map',
        documentSlug: 'chapter-2',
        documentTitle: 'Chapter 2: The Negotiation',
        kind: 'chapter',
        blockType: 'mapBlock',
        nodeIndex: 4,
        context: 'A fungal market carved into a cavern wall.',
      },
      {
        documentId: 'doc-npc',
        documentSlug: 'chapter-2',
        documentTitle: 'Chapter 2: The Negotiation',
        kind: 'chapter',
        blockType: 'npcProfile',
        nodeIndex: 5,
        context: 'An elegant drow fixer with silver jewelry.',
      },
    ], { includeMaps: true });

    expect(selected).toMatchObject([
      { documentSlug: 'front-matter', blockType: 'titlePage', nodeIndex: 0, model: 'gpt-image-1', size: '1024x1536' },
      { documentSlug: 'chapter-1', blockType: 'chapterHeader', nodeIndex: 0, model: 'gpt-image-1', size: '1536x1024' },
      { documentSlug: 'chapter-2', blockType: 'chapterHeader', nodeIndex: 0, model: 'gpt-image-1', size: '1536x1024' },
      { documentSlug: 'chapter-2', blockType: 'mapBlock', nodeIndex: 4, model: 'gpt-image-1', size: '1024x1024' },
      { documentSlug: 'chapter-2', blockType: 'npcProfile', nodeIndex: 5, model: 'gpt-image-1', size: '1024x1024' },
    ]);
  });

  it('skips map generation when maps are not requested', () => {
    const selected = selectAutomaticArtSlots([
      {
        documentId: 'doc-front',
        documentSlug: 'front-matter',
        documentTitle: 'Front Matter',
        kind: 'front_matter',
        blockType: 'titlePage',
        nodeIndex: 0,
        context: 'Cover context',
      },
      {
        documentId: 'doc-map',
        documentSlug: 'chapter-1',
        documentTitle: 'Chapter 1',
        kind: 'chapter',
        blockType: 'mapBlock',
        nodeIndex: 1,
        context: 'Battle map context',
      },
    ], { includeMaps: false });

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      documentSlug: 'front-matter',
      blockType: 'titlePage',
    });
  });

  it('sanitizes generated prompts so images do not contain typography instructions', () => {
    const coverPrompt = finalizeArtPrompt(
      "A foreboding cover for The Blackglass Mine. The title is displayed in a mystical font with eerie shadows creeping around the letters.",
      'titlePage',
    );
    const bannerPrompt = finalizeArtPrompt(
      'A dark mine entrance beneath twisted branches.',
      'chapterHeader',
    );

    expect(coverPrompt).not.toMatch(/mystical font/i);
    expect(coverPrompt).not.toMatch(/letters/i);
    expect(coverPrompt).toMatch(/no text, no lettering, no typography/i);
    expect(bannerPrompt).toMatch(/negative space/i);
    expect(bannerPrompt).toMatch(/chapter text/i);
  });

  it('applies prompts to matching document slots', () => {
    const updated = applyArtDirectionPlanToDocuments(
      [
        {
          id: 'doc-front',
          slug: 'front-matter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'titlePage',
                attrs: {
                  title: 'The Blackglass Mine',
                  coverImageUrl: '',
                  imagePrompt: '',
                },
              },
            ],
          },
        },
        {
          id: 'doc-ch1',
          slug: 'chapter-1',
          content: {
            type: 'doc',
            content: [
              {
                type: 'npcProfile',
                attrs: {
                  name: 'Foreman Talia',
                  portraitUrl: '',
                  imagePrompt: '',
                },
              },
            ],
          },
        },
      ],
      [
        {
          documentSlug: 'front-matter',
          nodeIndex: 0,
          blockType: 'titlePage',
          prompt: 'A dramatic fantasy cover showing a black-glass mine entrance under a red moon.',
          rationale: 'Strong focal cover image for the adventure.',
          model: 'gpt-image-1',
          size: '1024x1536',
        },
      ],
    );

    expect(updated[0].content).toMatchObject({
      content: [
        {
          attrs: {
            imagePrompt: 'A dramatic fantasy cover showing a black-glass mine entrance under a red moon.',
          },
        },
      ],
    });
    expect(updated[1].content).toMatchObject({
      content: [
        {
          attrs: {
            imagePrompt: '',
          },
        },
      ],
    });
  });

  it('applies realized image assets to the correct image field', () => {
    const updated = applyRealizedArtToDocuments(
      [
        {
          id: 'doc-front',
          slug: 'front-matter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'titlePage',
                attrs: {
                  title: 'The Blackglass Mine',
                  coverImageUrl: '',
                  imagePrompt: 'old prompt',
                },
              },
            ],
          },
        },
        {
          id: 'doc-ch1',
          slug: 'chapter-1',
          content: {
            type: 'doc',
            content: [
              {
                type: 'npcProfile',
                attrs: {
                  name: 'Foreman Talia',
                  portraitUrl: '',
                  imagePrompt: '',
                },
              },
            ],
          },
        },
      ],
      [
        {
          documentSlug: 'front-matter',
          nodeIndex: 0,
          blockType: 'titlePage',
          prompt: 'A black-glass mine under a crimson moon.',
          model: 'gpt-image-1',
          size: '1024x1536',
          assetId: 'asset-cover',
          assetUrl: '/uploads/project-1/cover.png',
        },
      ],
    );

    expect(updated[0].content).toMatchObject({
      content: [
        {
          attrs: {
            coverImageUrl: '/uploads/project-1/cover.png',
            imagePrompt: 'A black-glass mine under a crimson moon.',
            imageAssetId: 'asset-cover',
          },
        },
      ],
    });
    expect(updated[1].content).toMatchObject({
      content: [
        {
          attrs: {
            portraitUrl: '',
          },
        },
      ],
    });
  });

  it('materializes a chapterHeader slot from a leading H1 heading', () => {
    const content = ensureChapterHeaderImageSlot({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'The Village' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body copy.' }],
        },
      ],
    }, 'Chapter 1: The Village');

    expect(content).toMatchObject({
      content: [
        {
          type: 'chapterHeader',
          attrs: {
            title: 'The Village',
            chapterNumber: 'Chapter 1',
          },
        },
        {
          type: 'paragraph',
        },
      ],
    });
  });

  it('replaces workspace-like title-page titles with the generated publication title', () => {
    const content = ensureTitlePageSlot({
      type: 'doc',
      content: [
        {
          type: 'titlePage',
          attrs: {
            title: 'AI One-Shot Quick Review Workspace',
            coverImageUrl: '',
            imagePrompt: '',
          },
        },
      ],
    }, 'The Blackglass Mine');

    expect(content).toMatchObject({
      content: [
        {
          type: 'titlePage',
          attrs: {
            title: 'The Blackglass Mine',
          },
        },
      ],
    });
  });
});
