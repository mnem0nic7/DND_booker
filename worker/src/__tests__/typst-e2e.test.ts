import { describe, it, expect } from 'vitest';
import { assembleTypst } from '../renderers/typst-assembler.js';
import { generateTypstPdf } from '../generators/typst.generator.js';
import path from 'path';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const assetsDir = path.resolve(process.cwd(), 'assets');
const fontsDir = path.join(assetsDir, 'fonts');
const repoRoot = path.resolve(process.cwd(), '..');
const pdfTmpRoot = path.join(repoRoot, 'tmp', 'pdfs');
const execFile = promisify(execFileCallback);

describe('Typst E2E Pipeline', () => {
  async function extractPdfText(pdf: Buffer): Promise<string> {
    await mkdir(pdfTmpRoot, { recursive: true });
    const tempDir = await mkdtemp(path.join(pdfTmpRoot, 'typst-e2e-'));
    const pdfPath = path.join(tempDir, 'export.pdf');

    try {
      await writeFile(pdfPath, pdf);
      const { stdout } = await execFile('pdftotext', ['-layout', pdfPath, '-'], {
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

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

  it('should preserve representative D&D block content through a real export PDF', async () => {
    const documents = [
      {
        title: 'Front Matter',
        sortOrder: 0,
        kind: 'front_matter' as const,
        content: {
          type: 'doc' as const,
          content: [
            {
              type: 'titlePage',
              attrs: {
                title: 'The Blackglass Mine',
                subtitle: 'A level 4 one-shot for four heroes',
                author: 'DND Booker Test Suite',
              },
            },
          ],
        },
      },
      {
        title: 'Chapter 1: Into the Mine',
        sortOrder: 1,
        kind: 'chapter' as const,
        content: {
          type: 'doc' as const,
          content: [
            {
              type: 'chapterHeader',
              attrs: {
                title: 'Chapter 1: Into the Mine',
                chapterNumber: 'Chapter 1',
                subtitle: 'Where the curse first stirs',
              },
            },
            {
              type: 'readAloudBox',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Cold air spills from the mine mouth, carrying the scent of wet stone and old ash.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'sidebarCallout',
              attrs: { title: 'DM Tips', calloutType: 'info' },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Let the distant hammering echo before the party sees the first threat.',
                    },
                  ],
                },
              ],
            },
            {
              type: 'statBlock',
              attrs: {
                name: 'Gravel Guardian',
                size: 'Large',
                type: 'construct',
                alignment: 'unaligned',
                ac: 16,
                acType: 'stone plating',
                hp: 95,
                hitDice: '10d10 + 40',
                speed: '30 ft.',
                str: 18,
                dex: 8,
                con: 18,
                int: 3,
                wis: 12,
                cha: 6,
                damageResistances: 'bludgeoning, piercing, and slashing from nonmagical attacks',
                senses: 'darkvision 60 ft., tremorsense 30 ft., passive Perception 11',
                languages: 'understands Terran but cannot speak',
                cr: '6',
                xp: '2,300',
                traits: JSON.stringify([
                  {
                    name: 'Rubble Form',
                    description: 'The guardian can move through spaces occupied by loose stone without squeezing.',
                  },
                ]),
                actions: JSON.stringify([
                  {
                    name: 'Shattering Slam',
                    description: 'Melee Weapon Attack: +7 to hit, reach 10 ft., one target. Hit: 14 (2d8 + 5) bludgeoning damage.',
                  },
                ]),
              },
            },
            {
              type: 'spellCard',
              attrs: {
                name: 'Ashen Bolt',
                level: 2,
                school: 'evocation',
                castingTime: '1 action',
                range: '90 feet',
                components: 'V, S',
                duration: 'Instantaneous',
                description: 'A streak of ember-red force lashes a creature you can see.',
              },
            },
            {
              type: 'npcProfile',
              attrs: {
                name: 'Surveyor Vell',
                race: 'Human',
                class: 'Scout',
                description: 'A soot-streaked guide who knows the mine better than anyone still living.',
                personalityTraits: 'Dry humor, relentless caution',
                ideals: 'No one should die for the mine twice.',
              },
            },
            {
              type: 'magicItem',
              attrs: {
                name: 'Lantern of Returning',
                type: 'wondrous',
                rarity: 'uncommon',
                requiresAttunement: true,
                attunementRequirement: "by a creature proficient with navigator's tools",
                description: 'This brass lantern always sheds light toward the last safe exit you passed.',
              },
            },
            {
              type: 'encounterTable',
              attrs: {
                environment: 'Blackglass Mine',
                crRange: '4-6',
                entries: JSON.stringify([
                  { weight: 3, description: '2d4 splinter kobolds', cr: '1/4' },
                  { weight: 2, description: '1 ash mephit swarm', cr: '3' },
                  { weight: 1, description: 'The Gravel Guardian stirs', cr: '6' },
                ]),
              },
            },
            {
              type: 'randomTable',
              attrs: {
                title: 'Signs of the Curse',
                dieType: 'd6',
                entries: JSON.stringify([
                  { roll: '1-2', result: 'A wall weeps black glass sand.' },
                  { roll: '3-4', result: 'Distant picks strike stone with no visible miner.' },
                  { roll: '5-6', result: 'A whisper repeats the party’s marching order.' },
                ]),
              },
            },
            {
              type: 'classFeature',
              attrs: {
                name: 'Stonecunning',
                level: 2,
                className: 'Miner Adept',
                description: 'You can read stress fractures in stone to predict collapses and hidden seams.',
              },
            },
            {
              type: 'raceBlock',
              attrs: {
                name: 'Duskwrought Dwarf',
                abilityScoreIncreases: '+2 Constitution, +1 Wisdom',
                size: 'Medium',
                speed: '25 ft.',
                languages: 'Common, Dwarvish, Terran',
                features: JSON.stringify([
                  {
                    name: 'Ashsight',
                    description: 'You can see through smoke and ash as though it were light fog.',
                  },
                ]),
              },
            },
            {
              type: 'handout',
              attrs: {
                title: "Miner's Journal Fragment",
                content: 'The black glass sings when the foreman lies. I can hear it under my teeth.',
              },
            },
          ],
        },
      },
    ];

    const source = assembleTypst({
      documents,
      theme: 'dmguild',
      projectTitle: 'The Blackglass Mine',
    });

    const pdf = await generateTypstPdf(source, [fontsDir], assetsDir);
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const text = await extractPdfText(pdf);
    expect(text).toContain('Gravel Guardian');
    expect(text).toContain('Ashen Bolt');
    expect(text).toContain('Surveyor Vell');
    expect(text).toContain('Lantern of Returning');
    expect(text).toContain('Blackglass Mine Encounters');
    expect(text).toContain('Signs of the Curse');
    expect(text).toContain('Stonecunning');
    expect(text).toContain('Duskwrought Dwarf');
    expect(text).toContain('Journal Fragment');
    expect(text).not.toContain(':::readAloud');
    expect(text).not.toContain(':::dmTips');
  }, 45_000);

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
