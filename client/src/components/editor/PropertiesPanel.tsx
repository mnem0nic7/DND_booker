import { useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import { ThemePicker } from './ThemePicker';

interface PropertiesPanelProps {
  editor: Editor | null;
}

interface BlockInfo {
  type: string;
  label: string;
  pos: number;
}

const BLOCK_LABELS: Record<string, string> = {
  statBlock: 'Stat Block',
  spellCard: 'Spell Card',
  magicItem: 'Magic Item',
  npcProfile: 'NPC Profile',
  randomTable: 'Random Table',
  encounterTable: 'Encounter Table',
  classFeature: 'Class Feature',
  raceBlock: 'Race Block',
  readAloudBox: 'Read Aloud Box',
  sidebarCallout: 'Sidebar Callout',
  chapterHeader: 'Chapter Header',
  fullBleedImage: 'Full Bleed Image',
  mapBlock: 'Map Block',
  handout: 'Handout',
  pageBorder: 'Page Border',
  pageBreak: 'Page Break',
  columnBreak: 'Column Break',
  titlePage: 'Title Page',
  tableOfContents: 'Table of Contents',
  creditsPage: 'Credits Page',
  backCover: 'Back Cover',
};

function getBlockDisplayName(node: { type: { name: string }; attrs?: Record<string, unknown> }): string {
  const typeName = node.type.name;
  const label = BLOCK_LABELS[typeName];
  if (!label) return '';

  // Add identifying info when available
  const attrs = node.attrs || {};
  const name = attrs.name || attrs.title || '';
  if (name) return `${label}: ${String(name)}`;
  return label;
}

export function PropertiesPanel({ editor }: PropertiesPanelProps) {
  const stats = useMemo(() => {
    if (!editor) return { words: 0, chars: 0, blocks: [] as BlockInfo[] };

    const doc = editor.state.doc;
    const text = doc.textContent || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;

    const blocks: BlockInfo[] = [];
    doc.descendants((node, pos) => {
      const label = getBlockDisplayName(node);
      if (label) {
        blocks.push({ type: node.type.name, label, pos });
      }
    });

    return { words, chars, blocks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state.doc]);

  return (
    <div className="w-64 border-l bg-gray-50 p-4 overflow-y-auto">
      <ThemePicker />

      <hr className="my-4 border-gray-200" />

      {/* Document stats */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Document Stats
      </h3>
      <div className="text-xs text-gray-600 space-y-1 mb-4">
        <div className="flex justify-between">
          <span>Words</span>
          <span className="font-medium">{stats.words.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Characters</span>
          <span className="font-medium">{stats.chars.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>D&D Blocks</span>
          <span className="font-medium">{stats.blocks.length}</span>
        </div>
      </div>

      <hr className="my-4 border-gray-200" />

      {/* Block outline */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Block Outline
      </h3>
      {stats.blocks.length > 0 ? (
        <ul className="text-xs space-y-1">
          {stats.blocks.map((block, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  if (!editor) return;
                  editor.commands.focus();
                  editor.commands.setTextSelection(block.pos + 1);
                  // Scroll the node into view
                  const dom = editor.view.domAtPos(block.pos + 1);
                  if (dom.node instanceof HTMLElement) {
                    dom.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  } else if (dom.node.parentElement) {
                    dom.node.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-gray-200 transition-colors text-gray-700 truncate"
                title={block.label}
              >
                {block.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">
          No D&D blocks in this document yet.
        </p>
      )}
    </div>
  );
}
