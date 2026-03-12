import { describe, it, expect } from 'vitest';
import {
  applyArtDirectionPlanToDocuments,
  collectImageSlots,
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
          model: 'dall-e-3',
          size: '1024x1792',
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
});
