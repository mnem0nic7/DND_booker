import { useState, useMemo } from 'react';
import { Editor } from '@tiptap/react';

interface BlockType {
  name: string;
  label: string;
  icon: string;
  category: string;
  insertContent: (editor: Editor) => void;
}

interface CategoryMeta {
  accent: string;       // Tailwind border-l color
  iconBg: string;       // Tailwind bg for icon
  iconText: string;     // Tailwind text for icon
}

const CATEGORY_STYLES: Record<string, CategoryMeta> = {
  Basic:     { accent: 'border-l-gray-300',    iconBg: 'bg-gray-100',    iconText: 'text-gray-600' },
  'D&D':     { accent: 'border-l-amber-400',   iconBg: 'bg-amber-100',   iconText: 'text-amber-800' },
  Layout:    { accent: 'border-l-blue-400',     iconBg: 'bg-blue-100',    iconText: 'text-blue-800' },
  Structure: { accent: 'border-l-rose-400',     iconBg: 'bg-rose-100',    iconText: 'text-rose-800' },
};

const BLOCK_TYPES: BlockType[] = [
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

const CATEGORY_ORDER = ['Basic', 'D&D', 'Layout', 'Structure'];

function groupByCategory(blocks: BlockType[]) {
  return blocks.reduce(
    (acc, block) => {
      if (!acc[block.category]) acc[block.category] = [];
      acc[block.category].push(block);
      return acc;
    },
    {} as Record<string, BlockType[]>,
  );
}

interface BlockPaletteProps {
  editor: Editor | null;
}

export function BlockPalette({ editor }: BlockPaletteProps) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim()) return BLOCK_TYPES;
    const q = filter.toLowerCase();
    return BLOCK_TYPES.filter(
      (b) => b.label.toLowerCase().includes(q) || b.category.toLowerCase().includes(q),
    );
  }, [filter]);

  if (!editor) return null;

  const categories = groupByCategory(filtered);

  return (
    <div className="w-60 border-r bg-gray-50 flex flex-col h-full">
      {/* Header + search */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Blocks
        </h3>
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter blocks..."
            aria-label="Filter blocks"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 transition-colors"
          />
        </div>
      </div>

      {/* Scrollable block list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {CATEGORY_ORDER.filter((cat) => categories[cat]?.length).map((category) => {
          const blocks = categories[category];
          const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.Basic;

          return (
            <div key={category} className="mb-3">
              <h4
                className={`text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5 pl-2 border-l-2 ${style.accent}`}
              >
                {category}
              </h4>
              <div className="space-y-0.5">
                {blocks.map((block) => (
                  <button
                    key={block.name}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      block.insertContent(editor);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-gray-600 rounded-md hover:bg-white hover:text-gray-900 hover:shadow-sm transition-all group"
                  >
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold ${style.iconBg} ${style.iconText} group-hover:scale-110 transition-transform`}
                    >
                      {block.icon}
                    </span>
                    <span className="truncate">{block.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">
            No blocks match "{filter}"
          </p>
        )}
      </div>
    </div>
  );
}
