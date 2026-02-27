import { Editor } from '@tiptap/react';

interface BlockType {
  name: string;
  label: string;
  icon: string;
  category: string;
  insertContent: (editor: Editor) => void;
}

const BLOCK_TYPES: BlockType[] = [
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
];

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
  if (!editor) return null;

  const categories = groupByCategory(BLOCK_TYPES);

  return (
    <div className="w-60 border-r bg-gray-50 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Blocks
      </h3>
      {Object.entries(categories).map(([category, blocks]) => (
        <div key={category} className="mb-4">
          <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
            {category}
          </h4>
          <div className="space-y-1">
            {blocks.map((block) => (
              <button
                key={block.name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  block.insertContent(editor);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                <span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded text-xs font-mono">
                  {block.icon}
                </span>
                {block.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {/* D&D blocks */}
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
          D&D
        </h4>
        <div className="space-y-1">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor
                .chain()
                .focus()
                .insertContent({ type: 'statBlock' })
                .run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-800 rounded text-xs font-mono">
              SB
            </span>
            Stat Block
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'readAloudBox', content: [{ type: 'paragraph' }] }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-800 rounded text-xs font-mono">RA</span>
            Read Aloud
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'sidebarCallout', content: [{ type: 'paragraph' }] }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-800 rounded text-xs font-mono">SC</span>
            Sidebar Callout
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'chapterHeader' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-800 rounded text-xs font-mono">CH</span>
            Chapter Header
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'spellCard' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-indigo-100 text-indigo-800 rounded text-xs font-mono">SP</span>
            Spell Card
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'magicItem' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-emerald-100 text-emerald-800 rounded text-xs font-mono">MI</span>
            Magic Item
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'randomTable' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-yellow-100 text-yellow-800 rounded text-xs font-mono">RT</span>
            Random Table
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'npcProfile' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-amber-100 text-amber-800 rounded text-xs font-mono">NP</span>
            NPC Profile
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'encounterTable' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-green-100 text-green-800 rounded text-xs font-mono">ET</span>
            Encounter Table
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'classFeature' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-red-100 text-red-800 rounded text-xs font-mono">CF</span>
            Class Feature
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'raceBlock' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-orange-100 text-orange-800 rounded text-xs font-mono">RB</span>
            Race Block
          </button>
        </div>
      </div>
      {/* Layout blocks */}
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
          Layout
        </h4>
        <div className="space-y-1">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'fullBleedImage' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-800 rounded text-xs font-mono">FI</span>
            Full Bleed Image
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'mapBlock' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-800 rounded text-xs font-mono">MP</span>
            Map
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'handout' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-800 rounded text-xs font-mono">HO</span>
            Handout
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'pageBorder' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-800 rounded text-xs font-mono">PB</span>
            Page Border
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'pageBreak' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-800 rounded text-xs font-mono">PG</span>
            Page Break
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'columnBreak' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-gray-100 text-gray-800 rounded text-xs font-mono">CB</span>
            Column Break
          </button>
        </div>
      </div>
      {/* Structure blocks */}
      <div className="mt-6 pt-4 border-t">
        <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">
          Structure
        </h4>
        <div className="space-y-1">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'titlePage' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-rose-100 text-rose-800 rounded text-xs font-mono">TP</span>
            Title Page
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'tableOfContents' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-rose-100 text-rose-800 rounded text-xs font-mono">TC</span>
            Table of Contents
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'creditsPage' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-rose-100 text-rose-800 rounded text-xs font-mono">CR</span>
            Credits Page
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent({ type: 'backCover' }).run();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded hover:bg-gray-200 transition-colors"
          >
            <span className="w-6 h-6 flex items-center justify-center bg-rose-100 text-rose-800 rounded text-xs font-mono">BC</span>
            Back Cover
          </button>
        </div>
      </div>
    </div>
  );
}
