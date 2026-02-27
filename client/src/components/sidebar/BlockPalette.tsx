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
        </div>
      </div>
    </div>
  );
}
