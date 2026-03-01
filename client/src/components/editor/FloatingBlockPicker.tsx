import { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import { BLOCK_TYPES, CATEGORY_ORDER } from './blockDefinitions';
import type { BlockType } from './blockDefinitions';

const CATEGORY_STYLES: Record<string, { iconBg: string; iconText: string }> = {
  Basic:     { iconBg: 'bg-gray-100',   iconText: 'text-gray-600' },
  'D&D':     { iconBg: 'bg-amber-100',  iconText: 'text-amber-800' },
  Layout:    { iconBg: 'bg-blue-100',    iconText: 'text-blue-800' },
  Structure: { iconBg: 'bg-rose-100',    iconText: 'text-rose-800' },
};

interface FloatingBlockPickerProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
}

export function FloatingBlockPicker({ editor, isOpen, onClose }: FloatingBlockPickerProps) {
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = search.trim()
    ? BLOCK_TYPES.filter((b) => b.label.toLowerCase().includes(search.toLowerCase()))
    : BLOCK_TYPES;

  const categories = CATEGORY_ORDER.reduce<Record<string, BlockType[]>>((acc, cat) => {
    const blocks = filtered.filter((b) => b.category === cat);
    if (blocks.length) acc[cat] = blocks;
    return acc;
  }, {});

  return (
    <div
      ref={panelRef}
      className="fixed top-16 left-1/2 -translate-x-1/2 w-80 bg-white rounded-lg shadow-xl border z-50 max-h-[70vh] overflow-hidden flex flex-col"
    >
      <div className="p-2 border-b">
        <input
          ref={inputRef}
          type="text"
          placeholder="Filter blocks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>
      <div className="overflow-y-auto p-2">
        {Object.entries(categories).map(([category, blocks]) => {
          const style = CATEGORY_STYLES[category] || CATEGORY_STYLES.Basic;
          return (
            <div key={category} className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 px-1">
                {category}
              </div>
              {blocks.map((block) => (
                <button
                  key={block.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    block.insertContent(editor);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <span className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold ${style.iconBg} ${style.iconText}`}>
                    {block.icon}
                  </span>
                  <span className="truncate">{block.label}</span>
                </button>
              ))}
            </div>
          );
        })}
        {Object.keys(categories).length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No matching blocks</p>
        )}
      </div>
    </div>
  );
}
