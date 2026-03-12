import { describe, it, expect } from 'vitest';
import { renderTypstNode, tiptapToTypst } from '../renderers/tiptap-to-typst.js';

// Helper to cast node objects to the expected type
const node = (n: any) => n;

describe('TipTap-to-Typst Renderer', () => {
  // ── Text & Marks ──

  describe('text nodes', () => {
    it('should render plain text with escaping', () => {
      const result = renderTypstNode(node({ type: 'text', text: 'Hello World' }));
      expect(result).toBe('Hello World');
    });

    it('should escape special Typst characters in text', () => {
      const result = renderTypstNode(node({ type: 'text', text: 'a*b_c#d' }));
      expect(result).toBe('a\\*b\\_c\\#d');
    });

    it('should render bold marks', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'hello',
        marks: [{ type: 'bold' }],
      }));
      expect(result).toBe('*hello*');
    });

    it('should render italic marks', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'hello',
        marks: [{ type: 'italic' }],
      }));
      expect(result).toBe('_hello_');
    });

    it('should render code marks without escaping text', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'let x = *y*',
        marks: [{ type: 'code' }],
      }));
      expect(result).toBe('`let x = *y*`');
    });

    it('should render strike marks', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'removed',
        marks: [{ type: 'strike' }],
      }));
      expect(result).toBe('#strike[removed]');
    });

    it('should render underline marks', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'important',
        marks: [{ type: 'underline' }],
      }));
      expect(result).toBe('#underline[important]');
    });

    it('should render link marks', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'click here',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      }));
      expect(result).toBe('#link("https://example.com")[click here]');
    });

    it('should render nested marks correctly', () => {
      const result = renderTypstNode(node({
        type: 'text',
        text: 'hello',
        marks: [{ type: 'bold' }, { type: 'italic' }],
      }));
      expect(result).toBe('_*hello*_');
    });
  });

  // ── Paragraphs ──

  describe('paragraph', () => {
    it('should render a paragraph with content', () => {
      const result = renderTypstNode(node({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world' }],
      }));
      expect(result).toBe('Hello world\n\n');
    });

    it('should render an empty paragraph as a newline', () => {
      const result = renderTypstNode(node({ type: 'paragraph' }));
      expect(result).toBe('\n');
    });
  });

  // ── Headings ──

  describe('headings', () => {
    it('should render h1', () => {
      const result = renderTypstNode(node({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Title' }],
      }));
      expect(result).toBe('= Title\n\n');
    });

    it('should render h2', () => {
      const result = renderTypstNode(node({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Subtitle' }],
      }));
      expect(result).toBe('== Subtitle\n\n');
    });

    it('should render h3', () => {
      const result = renderTypstNode(node({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Section' }],
      }));
      expect(result).toBe('=== Section\n\n');
    });
  });

  // ── Lists ──

  describe('bullet list', () => {
    it('should render bullet list items with - prefix', () => {
      const result = renderTypstNode(node({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }],
          },
        ],
      }));
      expect(result).toContain('- Item one');
      expect(result).toContain('- Item two');
    });
  });

  describe('ordered list', () => {
    it('should render ordered list items with + prefix', () => {
      const result = renderTypstNode(node({
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
          },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
          },
        ],
      }));
      expect(result).toContain('+ First');
      expect(result).toContain('+ Second');
    });
  });

  // ── Block Elements ──

  describe('blockquote', () => {
    it('should render blockquote with #quote', () => {
      const result = renderTypstNode(node({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A wise saying' }] }],
      }));
      expect(result).toContain('#quote[');
      expect(result).toContain('A wise saying');
    });
  });

  describe('horizontalRule', () => {
    it('should render as #line', () => {
      const result = renderTypstNode(node({ type: 'horizontalRule' }));
      expect(result).toBe('#line(length: 100%)\n\n');
    });
  });

  describe('hardBreak', () => {
    it('should render as #linebreak()', () => {
      const result = renderTypstNode(node({ type: 'hardBreak' }));
      expect(result).toBe('#linebreak()\n');
    });
  });

  describe('pageBreak', () => {
    it('should render as #pagebreak()', () => {
      const result = renderTypstNode(node({ type: 'pageBreak' }));
      expect(result).toBe('#pagebreak()\n');
    });
  });

  describe('columnBreak', () => {
    it('should render as #colbreak()', () => {
      const result = renderTypstNode(node({ type: 'columnBreak' }));
      expect(result).toBe('#colbreak()\n');
    });
  });

  describe('codeBlock', () => {
    it('should render a code block with language', () => {
      const result = renderTypstNode(node({
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const x = 1;' }],
      }));
      expect(result).toContain('```typescript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('should render a code block without language', () => {
      const result = renderTypstNode(node({
        type: 'codeBlock',
        content: [{ type: 'text', text: 'plain code' }],
      }));
      expect(result).toBe('```\nplain code\n```\n\n');
    });
  });

  // ── doc root ──

  describe('doc root', () => {
    it('should render a document with multiple children', () => {
      const result = tiptapToTypst(node({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Body text.' }] },
        ],
      }));
      expect(result).toContain('= Title');
      expect(result).toContain('Body text.');
    });
  });

  // ── D&D Blocks ──

  describe('statBlock', () => {
    it('should render a stat block with name, abilities, and themed styling', () => {
      const result = renderTypstNode(node({
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
          senses: 'darkvision 60 ft.',
          languages: 'Common, Goblin',
          cr: '1/4',
          xp: '50',
          traits: JSON.stringify([{ name: 'Nimble Escape', description: 'The goblin can take the Disengage or Hide action as a bonus action.' }]),
          actions: JSON.stringify([{ name: 'Scimitar', description: 'Melee Weapon Attack: +4 to hit' }]),
        },
      }));
      expect(result).toContain('#block(');
      expect(result).toContain('theme-stat-block-bg');
      expect(result).toContain('Goblin');
      expect(result).toContain('Small');
      expect(result).toContain('*Armor Class*');
      expect(result).toContain('15');
      expect(result).toContain('*STR*');
      expect(result).toContain('8 (-1)');
      expect(result).toContain('14 (+2)');
      expect(result).toContain('*Nimble Escape.*');
      expect(result).toContain('Actions');
      expect(result).toContain('*Scimitar.*');
    });

    it('should render stat block entries that use legacy desc fields', () => {
      const result = renderTypstNode(node({
        type: 'statBlock',
        attrs: {
          name: 'Gravel Guardian',
          traits: JSON.stringify([{ name: 'Immutable Form', desc: 'The guardian cannot be reshaped.' }]),
          actions: JSON.stringify([{ name: 'Slam', desc: 'Melee Weapon Attack: +6 to hit.' }]),
          reactions: JSON.stringify([{ name: 'Stone Shield', desc: 'Gain +2 AC until the start of its next turn.' }]),
        },
      }));

      expect(result).toContain('Immutable Form');
      expect(result).toContain('The guardian cannot be reshaped.');
      expect(result).toContain('Melee Weapon Attack: +6 to hit.');
      expect(result).toContain('Gain +2 AC until the start of its next turn.');
    });
  });

  describe('readAloudBox', () => {
    it('should render a read-aloud box with themed styling', () => {
      const result = renderTypstNode(node({
        type: 'readAloudBox',
        attrs: { style: 'parchment' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'You enter a dark room.' }] }],
      }));
      expect(result).toContain('theme-read-aloud-bg');
      expect(result).toContain('theme-read-aloud-border');
      expect(result).toContain('You enter a dark room.');
    });
  });

  describe('sidebarCallout', () => {
    it('should render a sidebar callout with title', () => {
      const result = renderTypstNode(node({
        type: 'sidebarCallout',
        attrs: { title: 'DM Tip', calloutType: 'info' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be creative!' }] }],
      }));
      expect(result).toContain('theme-sidebar-bg');
      expect(result).toContain('DM Tip');
      expect(result).toContain('Be creative!');
    });
  });

  describe('chapterHeader', () => {
    it('should render a chapter header with number and title', () => {
      const result = renderTypstNode(node({
        type: 'chapterHeader',
        attrs: {
          title: 'The Beginning',
          chapterNumber: 'Chapter 1',
          subtitle: 'An Introduction',
          backgroundImage: '/uploads/project-1/chapter-banner.png',
        },
      }));
      expect(result).toContain('image("/uploads/project-1/chapter-banner.png"');
      expect(result).toContain('Chapter 1');
      expect(result).toContain('= The Beginning');
      expect(result).toContain('theme-divider');
      expect(result).toContain('An Introduction');
    });

    it('should strip a duplicated chapter prefix from the title when a chapter number is provided', () => {
      const result = renderTypstNode(node({
        type: 'chapterHeader',
        attrs: { title: 'Chapter 2: Approaching the Mine', chapterNumber: 'Chapter 2' },
      }));

      expect(result).toContain('Chapter 2');
      expect(result).toContain('= Approaching the Mine');
      expect(result).not.toContain('= Chapter 2: Approaching the Mine');
    });
  });

  describe('spellCard', () => {
    it('should render a spell card with properties', () => {
      const result = renderTypstNode(node({
        type: 'spellCard',
        attrs: {
          name: 'Fireball',
          level: 3,
          school: 'evocation',
          castingTime: '1 action',
          range: '150 feet',
          components: 'V, S, M',
          duration: 'Instantaneous',
          description: 'A bright streak flashes from your pointing finger.',
        },
      }));
      expect(result).toContain('Fireball');
      expect(result).toContain('3rd-level evocation');
      expect(result).toContain('*Casting Time*');
      expect(result).toContain('1 action');
      expect(result).toContain('theme-spell-card-accent');
    });
  });

  describe('magicItem', () => {
    it('should render a magic item with subtitle', () => {
      const result = renderTypstNode(node({
        type: 'magicItem',
        attrs: {
          name: 'Bag of Holding',
          type: 'wondrous',
          rarity: 'uncommon',
          requiresAttunement: false,
          description: 'This bag has an interior space considerably larger.',
        },
      }));
      expect(result).toContain('Bag of Holding');
      expect(result).toContain('Wondrous, uncommon');
      expect(result).toContain('theme-magic-item-accent');
    });
  });

  describe('randomTable', () => {
    it('should render a random table with entries', () => {
      const result = renderTypstNode(node({
        type: 'randomTable',
        attrs: {
          title: 'Random Encounters',
          dieType: 'd6',
          entries: JSON.stringify([
            { roll: '1', result: 'Nothing happens' },
            { roll: '2-4', result: 'Wolves attack' },
          ]),
        },
      }));
      expect(result).toContain('#table(');
      expect(result).toContain('Random Encounters');
      expect(result).toContain('d6');
      expect(result).toContain('Nothing happens');
      expect(result).toContain('Wolves attack');
    });

    it('returns no Typst for an empty random table', () => {
      const result = renderTypstNode(node({
        type: 'randomTable',
        attrs: {
          title: 'Hidden Path Discoveries',
          dieType: 'd6',
          entries: JSON.stringify([]),
        },
      }));
      expect(result).toBe('');
    });
  });

  describe('npcProfile', () => {
    it('should render an NPC profile', () => {
      const result = renderTypstNode(node({
        type: 'npcProfile',
        attrs: {
          name: 'Elara',
          race: 'Elf',
          class: 'Wizard',
          description: 'A wise sage.',
          personalityTraits: 'Curious and quiet',
        },
      }));
      expect(result).toContain('Elara');
      expect(result).toContain('Elf');
      expect(result).toContain('Wizard');
      expect(result).toContain('*Personality Traits.*');
    });
  });

  describe('encounterTable', () => {
    it('should render an encounter table', () => {
      const result = renderTypstNode(node({
        type: 'encounterTable',
        attrs: {
          environment: 'Forest',
          crRange: '1-5',
          entries: JSON.stringify([
            { weight: 3, description: '2d4 wolves', cr: '1/4' },
            { weight: 2, description: '1 owlbear', cr: '3' },
          ]),
        },
      }));
      expect(result).toContain('Forest Encounters');
      expect(result).toContain('CR Range: 1-5');
      expect(result).toContain('#table(');
      expect(result).toContain('d5');
      expect(result).toContain('2d4 wolves');
      expect(result).toContain('breakable: false');
    });

    it('returns no Typst for an empty encounter table', () => {
      const result = renderTypstNode(node({
        type: 'encounterTable',
        attrs: {
          environment: 'Forest',
          crRange: '1-5',
          entries: JSON.stringify([]),
        },
      }));
      expect(result).toBe('');
    });
  });

  describe('classFeature', () => {
    it('should render a class feature', () => {
      const result = renderTypstNode(node({
        type: 'classFeature',
        attrs: {
          name: 'Wild Shape',
          level: 2,
          className: 'Druid',
          description: 'You can use your action to magically assume the shape of a beast.',
        },
      }));
      expect(result).toContain('Wild Shape');
      expect(result).toContain('Level 2 Druid Feature');
      expect(result).toContain('theme-class-feature-accent');
    });
  });

  describe('raceBlock', () => {
    it('should render a race block with properties and features', () => {
      const result = renderTypstNode(node({
        type: 'raceBlock',
        attrs: {
          name: 'High Elf',
          abilityScoreIncreases: '+2 Dexterity, +1 Intelligence',
          size: 'Medium',
          speed: '30 ft.',
          languages: 'Common, Elvish',
          features: JSON.stringify([{ name: 'Darkvision', description: 'You can see in dim light.' }]),
        },
      }));
      expect(result).toContain('High Elf');
      expect(result).toContain('*Ability Score Increase.*');
      expect(result).toContain('*Darkvision.*');
      expect(result).toContain('Racial Features');
    });
  });

  // ── Layout Blocks ──

  describe('fullBleedImage', () => {
    it('should render a figure with image', () => {
      const result = renderTypstNode(node({
        type: 'fullBleedImage',
        attrs: { src: '/images/dragon.png', caption: 'A fearsome dragon' },
      }));
      expect(result).toContain('#figure(');
      expect(result).toContain('image("/images/dragon.png"');
      expect(result).toContain('caption: [A fearsome dragon]');
    });
  });

  describe('mapBlock', () => {
    it('should render a map block with legend', () => {
      const result = renderTypstNode(node({
        type: 'mapBlock',
        attrs: {
          src: '/maps/dungeon.png',
          scale: '1 inch = 5 feet',
          keyEntries: JSON.stringify([{ label: 'A', description: 'Entrance' }]),
        },
      }));
      expect(result).toContain('image("/maps/dungeon.png"');
      expect(result).toContain('Scale: 1 inch = 5 feet');
      expect(result).toContain('Map Key');
      expect(result).toContain('*A.*');
    });
  });

  describe('handout', () => {
    it('should render a handout block', () => {
      const result = renderTypstNode(node({
        type: 'handout',
        attrs: { title: 'Ancient Letter', content: 'Dear adventurer...' },
      }));
      expect(result).toContain('Ancient Letter');
      expect(result).toContain('Dear adventurer...');
      expect(result).toContain('luma(245)');
    });
  });

  describe('pageBorder', () => {
    it('should render a page border comment', () => {
      const result = renderTypstNode(node({
        type: 'pageBorder',
        attrs: { borderStyle: 'ornate' },
      }));
      expect(result).toContain('// page-border: ornate');
      expect(result).toContain('theme-divider');
    });
  });

  // ── Structure Blocks ──

  describe('titlePage', () => {
    it('should render a title page with single-column switching', () => {
      const result = renderTypstNode(node({
        type: 'titlePage',
        attrs: { title: 'The Lost Mine', subtitle: 'A D&D Adventure', author: 'J. Smith' },
      }));
      expect(result).toContain('#set page(columns: 1)');
      expect(result).toContain('The Lost Mine');
      expect(result).toContain('A D&D Adventure');
      expect(result).toContain('by J. Smith');
      expect(result).toContain('#pagebreak()');
      expect(result).toContain('#set page(columns: 2)');
    });
  });

  describe('tableOfContents', () => {
    it('should render a table of contents with outline', () => {
      const result = renderTypstNode(node({
        type: 'tableOfContents',
        attrs: { title: 'Contents', depth: 1 },
      }));
      expect(result).toContain('#set page(columns: 1)');
      expect(result).toContain('Contents');
      expect(result).toContain('#outline(title: none, depth: 1)');
      expect(result).toContain('#set page(columns: 2)');
    });
  });

  describe('creditsPage', () => {
    it('should render a credits page', () => {
      const result = renderTypstNode(node({
        type: 'creditsPage',
        attrs: { credits: 'Author: John Doe\nEditor: Jane Doe', legalText: 'OGL licensed', copyrightYear: '2024' },
      }));
      expect(result).toContain('#set page(columns: 1)');
      expect(result).toContain('Credits');
      expect(result).toContain('Author: John Doe');
      expect(result).toContain('Editor: Jane Doe');
      expect(result).toContain('Legal');
      expect(result).toContain('OGL licensed');
      expect(result).toContain('2024');
    });
  });

  describe('backCover', () => {
    it('should render a back cover', () => {
      const result = renderTypstNode(node({
        type: 'backCover',
        attrs: { blurb: 'An epic tale of adventure.', authorBio: 'A veteran DM.' },
      }));
      expect(result).toContain('#set page(columns: 1)');
      expect(result).toContain('An epic tale of adventure.');
      expect(result).toContain('A veteran DM.');
    });
  });

  // ── Unknown node ──

  describe('unknown node', () => {
    it('should render children for unknown node types', () => {
      const result = renderTypstNode(node({
        type: 'customUnknown',
        content: [{ type: 'text', text: 'fallback content' }],
      }));
      expect(result).toBe('fallback content');
    });
  });
});
