import type { Editor } from '@tiptap/react';

export interface BlockType {
  name: string;
  label: string;
  icon: string;
  category: string;
  insertContent: (editor: Editor) => void;
}

export const BLOCK_TYPES: BlockType[] = [
  // Basic
  {
    name: 'paragraph',
    label: 'Paragraph',
    icon: 'P',
    category: 'Basic',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'paragraph' }).run(),
  },
  {
    name: 'heading',
    label: 'Heading',
    icon: 'H',
    category: 'Basic',
    insertContent: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({ type: 'heading', attrs: { level: 2 } })
        .run(),
  },
  {
    name: 'bulletList',
    label: 'Bullet List',
    icon: '\u2022',
    category: 'Basic',
    insertContent: (editor) =>
      editor.chain().focus().toggleBulletList().run(),
  },
  {
    name: 'orderedList',
    label: 'Numbered List',
    icon: '1.',
    category: 'Basic',
    insertContent: (editor) =>
      editor.chain().focus().toggleOrderedList().run(),
  },
  {
    name: 'blockquote',
    label: 'Blockquote',
    icon: '\u201C',
    category: 'Basic',
    insertContent: (editor) =>
      editor.chain().focus().toggleBlockquote().run(),
  },
  {
    name: 'codeBlock',
    label: 'Code Block',
    icon: '<>',
    category: 'Basic',
    insertContent: (editor) =>
      editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    name: 'horizontalRule',
    label: 'Divider',
    icon: '\u2014',
    category: 'Basic',
    insertContent: (editor) =>
      editor.chain().focus().setHorizontalRule().run(),
  },
  // D&D
  {
    name: 'statBlock',
    label: 'Stat Block',
    icon: 'SB',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'statBlock' }).run(),
  },
  {
    name: 'readAloudBox',
    label: 'Read Aloud',
    icon: 'RA',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'readAloudBox', content: [{ type: 'paragraph' }] }).run(),
  },
  {
    name: 'sidebarCallout',
    label: 'Sidebar Callout',
    icon: 'SC',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'sidebarCallout', content: [{ type: 'paragraph' }] }).run(),
  },
  {
    name: 'chapterHeader',
    label: 'Chapter Header',
    icon: 'CH',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'chapterHeader' }).run(),
  },
  {
    name: 'spellCard',
    label: 'Spell Card',
    icon: 'SP',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'spellCard' }).run(),
  },
  {
    name: 'magicItem',
    label: 'Magic Item',
    icon: 'MI',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'magicItem' }).run(),
  },
  {
    name: 'randomTable',
    label: 'Random Table',
    icon: 'RT',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'randomTable' }).run(),
  },
  {
    name: 'npcProfile',
    label: 'NPC Profile',
    icon: 'NP',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'npcProfile' }).run(),
  },
  {
    name: 'encounterTable',
    label: 'Encounter Table',
    icon: 'ET',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'encounterTable' }).run(),
  },
  {
    name: 'classFeature',
    label: 'Class Feature',
    icon: 'CF',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'classFeature' }).run(),
  },
  {
    name: 'raceBlock',
    label: 'Race Block',
    icon: 'RB',
    category: 'D&D',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'raceBlock' }).run(),
  },
  // Layout
  {
    name: 'fullBleedImage',
    label: 'Full Bleed Image',
    icon: 'FI',
    category: 'Layout',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'fullBleedImage' }).run(),
  },
  {
    name: 'mapBlock',
    label: 'Map',
    icon: 'MP',
    category: 'Layout',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'mapBlock' }).run(),
  },
  {
    name: 'handout',
    label: 'Handout',
    icon: 'HO',
    category: 'Layout',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'handout' }).run(),
  },
  {
    name: 'pageBorder',
    label: 'Page Border',
    icon: 'PB',
    category: 'Layout',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'pageBorder' }).run(),
  },
  {
    name: 'pageBreak',
    label: 'Page Break',
    icon: 'PG',
    category: 'Layout',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'pageBreak' }).run(),
  },
  {
    name: 'columnBreak',
    label: 'Column Break',
    icon: 'CB',
    category: 'Layout',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'columnBreak' }).run(),
  },
  // Structure
  {
    name: 'titlePage',
    label: 'Title Page',
    icon: 'TP',
    category: 'Structure',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'titlePage' }).run(),
  },
  {
    name: 'tableOfContents',
    label: 'Table of Contents',
    icon: 'TC',
    category: 'Structure',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'tableOfContents' }).run(),
  },
  {
    name: 'creditsPage',
    label: 'Credits Page',
    icon: 'CR',
    category: 'Structure',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'creditsPage' }).run(),
  },
  {
    name: 'backCover',
    label: 'Back Cover',
    icon: 'BC',
    category: 'Structure',
    insertContent: (editor) =>
      editor.chain().focus().insertContent({ type: 'backCover' }).run(),
  },
];

export const CATEGORY_ORDER = ['Basic', 'D&D', 'Layout', 'Structure'];
