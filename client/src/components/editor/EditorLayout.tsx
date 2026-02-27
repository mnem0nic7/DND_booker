import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Toolbar } from './Toolbar';
import { BlockPalette } from '../sidebar/BlockPalette';

interface EditorLayoutProps {
  content: any;
  onUpdate: (content: any) => void;
}

export function EditorLayout({ content, onUpdate }: EditorLayoutProps) {
  const [showBlockPalette, setShowBlockPalette] = useState(true);
  const [showProperties, setShowProperties] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onUpdate(ed.getJSON());
    },
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar: Block Palette */}
      {showBlockPalette && <BlockPalette editor={editor} />}

      {/* Center: Toolbar + Editor */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center border-b bg-white">
          <button
            onClick={() => setShowBlockPalette((v) => !v)}
            title={showBlockPalette ? 'Hide block palette' : 'Show block palette'}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors border-r"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex-1">
            <Toolbar editor={editor} />
          </div>
          <button
            onClick={() => setShowProperties((v) => !v)}
            title={showProperties ? 'Hide properties' : 'Show properties'}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors border-l"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
        </div>

        {/* Editor content area */}
        <div className="flex-1 overflow-y-auto p-8 bg-white">
          <div className="max-w-3xl mx-auto prose prose-lg max-w-none">
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>
      </div>

      {/* Right sidebar: Properties panel placeholder */}
      {showProperties && (
        <div className="w-64 border-l bg-gray-50 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Properties
          </h3>
          <p className="text-xs text-gray-400 italic">
            Select a block to edit its properties.
          </p>
        </div>
      )}
    </div>
  );
}
