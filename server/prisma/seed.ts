import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const systemTemplates = [
  {
    name: 'Blank Campaign',
    description: 'A full campaign with multiple chapters — ideal for multi-session adventures.',
    type: 'campaign' as const,
    isSystem: true,
    content: {
      type: 'doc',
      content: [
        { type: 'titlePage', attrs: { title: 'Campaign Title', subtitle: 'A D&D 5e Adventure', author: 'Author Name', coverImageUrl: '' } },
        { type: 'pageBreak' },
        { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Begin writing your first chapter here...' }],
        },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 2' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Continue your adventure here...' }],
        },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 3' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Conclude or continue your story here...' }],
        },
        { type: 'pageBreak' },
        { type: 'creditsPage', attrs: { credits: 'Written by Author Name', legalText: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.', copyrightYear: new Date().getFullYear().toString() } },
        { type: 'pageBreak' },
        { type: 'backCover', attrs: { blurb: 'A thrilling adventure awaits! Deep in the forgotten ruins, an ancient evil stirs. Heroes must brave deadly traps, cunning monsters, and dark sorcery to save the realm from certain doom.', authorBio: 'Author Name is a tabletop RPG designer and storyteller.', authorImageUrl: '' } },
      ],
    },
  },
  {
    name: 'Blank One-Shot',
    description: 'A streamlined single-session adventure with one chapter.',
    type: 'one_shot' as const,
    isSystem: true,
    content: {
      type: 'doc',
      content: [
        { type: 'titlePage', attrs: { title: 'One-Shot Title', subtitle: 'A D&D 5e One-Shot', author: 'Author Name', coverImageUrl: '' } },
        { type: 'pageBreak' },
        { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'The Adventure' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Begin writing your one-shot adventure here...' }],
        },
        { type: 'pageBreak' },
        { type: 'creditsPage', attrs: { credits: 'Written by Author Name', legalText: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.', copyrightYear: new Date().getFullYear().toString() } },
      ],
    },
  },
  {
    name: 'Blank Supplement',
    description: 'Additional rules, items, or content with two organized chapters.',
    type: 'supplement' as const,
    isSystem: true,
    content: {
      type: 'doc',
      content: [
        { type: 'titlePage', attrs: { title: 'Supplement Title', subtitle: 'A D&D 5e Supplement', author: 'Author Name', coverImageUrl: '' } },
        { type: 'pageBreak' },
        { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Begin your first section of supplementary content...' }],
        },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 2' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Continue with additional content...' }],
        },
        { type: 'pageBreak' },
        { type: 'creditsPage', attrs: { credits: 'Written by Author Name', legalText: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.', copyrightYear: new Date().getFullYear().toString() } },
      ],
    },
  },
  {
    name: 'Blank Sourcebook',
    description: 'A comprehensive reference with class features, race blocks, and multiple chapters.',
    type: 'sourcebook' as const,
    isSystem: true,
    content: {
      type: 'doc',
      content: [
        { type: 'titlePage', attrs: { title: 'Sourcebook Title', subtitle: 'A D&D 5e Sourcebook', author: 'Author Name', coverImageUrl: '' } },
        { type: 'pageBreak' },
        { type: 'tableOfContents', attrs: { title: 'Table of Contents' } },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 1: Classes' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Class Feature Block' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Feature Name' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Starting at Xth level, you gain the following feature...' }],
        },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 2: Subclasses' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Class Feature Block' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Subclass Feature Name' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'At Xth level, this subclass grants the following ability...' }],
        },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 3: Races' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Race Block' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Race Name' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Ability Score Increase: ' }, { type: 'text', text: '+2 to one ability score' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Size: ' }, { type: 'text', text: 'Medium' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Speed: ' }, { type: 'text', text: '30 feet' }] }] },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Describe the race traits and lore here...' }],
        },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Chapter 4: Spells & Abilities' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Class Feature Block' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Spell/Ability Name' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'italic' }], text: 'Xth-level evocation' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Describe the spell or ability here...' }],
        },
        { type: 'pageBreak' },
        { type: 'creditsPage', attrs: { credits: 'Written by Author Name', legalText: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.', copyrightYear: new Date().getFullYear().toString() } },
        { type: 'pageBreak' },
        { type: 'backCover', attrs: { blurb: 'A comprehensive sourcebook for your D&D 5e campaign, featuring new classes, subclasses, races, and spells.', authorBio: 'Author Name is a tabletop RPG designer and storyteller.', authorImageUrl: '' } },
      ],
    },
  },
];

async function main() {
  console.log('Seeding system templates...');

  for (const template of systemTemplates) {
    const existing = await prisma.template.findFirst({
      where: { name: template.name, isSystem: true },
    });

    if (existing) {
      await prisma.template.update({
        where: { id: existing.id },
        data: template,
      });
      console.log(`  Updated: ${template.name}`);
    } else {
      await prisma.template.create({ data: template });
      console.log(`  Created: ${template.name}`);
    }
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
