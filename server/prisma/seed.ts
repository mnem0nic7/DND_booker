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
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'Title Page' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Your Campaign Title' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Table of Contents' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 2' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 3' }] }] },
          ],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Begin writing your first chapter here...' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Chapter 2' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Continue your adventure here...' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Chapter 3' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Conclude or continue your story here...' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Credits' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Written by: [Author Name]' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [{ type: 'text', text: 'Back Cover' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'A brief blurb about your campaign...' }],
        },
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
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'Title Page' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Your One-Shot Title' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Table of Contents' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The Adventure' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Credits' }] }] },
          ],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'The Adventure' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Begin writing your one-shot adventure here...' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Credits' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Written by: [Author Name]' }],
        },
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
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'Title Page' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Your Supplement Title' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Table of Contents' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 2' }] }] },
          ],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Chapter 1' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Begin your first section of supplementary content...' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Chapter 2' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Continue with additional content...' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Credits' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Written by: [Author Name]' }],
        },
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
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'Title Page' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Your Sourcebook Title' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Table of Contents' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 1: Classes' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 2: Subclasses' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 3: Races' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chapter 4: Spells & Abilities' }] }] },
          ],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
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
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
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
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
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
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
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
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Credits' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Written by: [Author Name]' }],
        },
        { type: 'horizontalRule' },
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [{ type: 'text', text: 'Back Cover' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'A brief blurb about your sourcebook...' }],
        },
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
