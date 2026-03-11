import { describe, it, expect } from 'vitest';
import { assembleTypst } from '../renderers/typst-assembler.js';
import { generateTypstPdf } from '../generators/typst.generator.js';
import path from 'path';

const assetsDir = path.resolve(process.cwd(), 'assets');
const fontsDir = path.join(assetsDir, 'fonts');

describe('Typst E2E Pipeline', () => {
  it('should generate a PDF from a project with mixed content', async () => {
    const documents = [
      {
        title: 'Introduction',
        sortOrder: 1,
        content: {
          type: 'doc' as const,
          content: [
            // Title page
            {
              type: 'titlePage',
              attrs: {
                title: 'The Lost Mine of Phandelver',
                subtitle: 'A D&D 5e Adventure',
                author: 'Dungeon Master',
              },
            },
            // Chapter header
            {
              type: 'chapterHeader',
              attrs: {
                title: 'Chapter 1: Goblin Arrows',
                subtitle: 'The adventure begins',
                chapterNumber: 'Chapter 1',
              },
            },
            // Paragraph
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'The party has been hired to escort a wagon of supplies from Neverwinter to the rough-and-tumble settlement of Phandalin.',
                },
              ],
            },
            // Read aloud box
            {
              type: 'readAloudBox',
              attrs: {},
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'You have been on the Triboar Trail for about half a day. As you come around a bend, you spot two dead horses sprawled about fifty feet ahead of you, blocking the path.',
                    },
                  ],
                },
              ],
            },
            // Stat block (Goblin)
            {
              type: 'statBlock',
              attrs: {
                name: 'Goblin',
                size: 'Small',
                type: 'humanoid (goblinoid)',
                alignment: 'neutral evil',
                ac: 15,
                acType: 'leather armor, shield',
                hp: 7,
                hitDice: '2d6',
                speed: '30 ft.',
                str: 8,
                dex: 14,
                con: 10,
                int: 10,
                wis: 8,
                cha: 8,
                skills: 'Stealth +6',
                senses: 'darkvision 60 ft., passive Perception 9',
                languages: 'Common, Goblin',
                cr: '1/4',
                xp: '50',
                traits: JSON.stringify([
                  {
                    name: 'Nimble Escape',
                    description:
                      'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.',
                  },
                ]),
                actions: JSON.stringify([
                  {
                    name: 'Scimitar',
                    description:
                      'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.',
                  },
                  {
                    name: 'Shortbow',
                    description:
                      'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.',
                  },
                ]),
              },
            },
            // Column break
            {
              type: 'columnBreak',
            },
            // More paragraphs
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Four goblins are hiding in the woods, two on each side of the road. They wait until someone approaches the dead horses and then attack.',
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'When the characters defeat the goblins, any characters who search the area and succeed on a DC 10 Wisdom (Survival) check find the trail the goblins made.',
                  marks: [{ type: 'italic' }],
                },
              ],
            },
          ],
        },
      },
    ];

    const source = assembleTypst({
      documents,
      theme: 'dmguild',
      projectTitle: 'The Lost Mine of Phandelver',
    });

    expect(source).toBeTruthy();
    expect(source.length).toBeGreaterThan(100);

    const pdf = await generateTypstPdf(source, [fontsDir], assetsDir);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(1000);

    // Check PDF magic header
    const header = pdf.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  }, 30_000);

  it('should generate a PDF for a long-form export with synthetic front matter', async () => {
    const source = assembleTypst({
      documents: [
        {
          title: 'Foreword',
          sortOrder: 1,
          kind: 'front_matter',
          content: {
            type: 'doc' as const,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'This adventure was written for tables that enjoy careful investigation and high-stakes travel.',
                  },
                ],
              },
            ],
          },
        },
        {
          title: 'Arrival at Dawn',
          sortOrder: 2,
          kind: 'chapter',
          content: {
            type: 'doc' as const,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'The caravan reaches the valley just as the first light spills over the old watchtower.',
                  },
                ],
              },
            ],
          },
        },
        {
          title: 'Into the Wilds',
          sortOrder: 3,
          kind: 'chapter',
          content: {
            type: 'doc' as const,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Beyond the farms, the old road narrows into a track hemmed in by thorn and mist.',
                  },
                ],
              },
            ],
          },
        },
      ],
      theme: 'classic-parchment',
      projectTitle: 'The Ember Road',
    });

    const pdf = await generateTypstPdf(source, [fontsDir], assetsDir);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(1000);

    const header = pdf.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  }, 30_000);

  it('should generate a PDF with dedicated chapter opener pages during export polish', async () => {
    const source = assembleTypst({
      documents: [
        {
          title: 'Arrival at Dawn',
          sortOrder: 1,
          kind: 'chapter',
          content: {
            type: 'doc' as const,
            content: [
              {
                type: 'chapterHeader',
                attrs: {
                  title: 'Arrival at Dawn',
                  chapterNumber: 'Chapter 1',
                },
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'The caravan reaches the valley just as the first light spills over the old watchtower.',
                  },
                ],
              },
            ],
          },
        },
        {
          title: 'Into the Wilds',
          sortOrder: 2,
          kind: 'chapter',
          content: {
            type: 'doc' as const,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Beyond the farms, the old road narrows into a track hemmed in by thorn and mist.',
                  },
                ],
              },
            ],
          },
        },
      ],
      theme: 'classic-parchment',
      projectTitle: 'The Ember Road',
      exportPolish: {
        chapterOpenerMode: 'dedicated_page',
      },
    });

    const pdf = await generateTypstPdf(source, [fontsDir], assetsDir);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 30_000);

  it('should generate a PDF with all 6 themes', async () => {
    const themes = [
      'classic-parchment',
      'dark-tome',
      'clean-modern',
      'fey-wild',
      'infernal',
      'dmguild',
    ];

    for (const theme of themes) {
      const source = assembleTypst({
        documents: [
          {
            title: 'Test Document',
            sortOrder: 1,
            content: {
              type: 'doc' as const,
              content: [
                {
                  type: 'heading',
                  attrs: { level: 1 },
                  content: [{ type: 'text', text: `Theme: ${theme}` }],
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'This is a test paragraph to verify the theme compiles correctly.',
                    },
                  ],
                },
              ],
            },
          },
        ],
        theme,
        projectTitle: `Theme Test: ${theme}`,
      });

      const pdf = await generateTypstPdf(source, [fontsDir], assetsDir);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);

      const header = pdf.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    }
  }, 60_000);
});
