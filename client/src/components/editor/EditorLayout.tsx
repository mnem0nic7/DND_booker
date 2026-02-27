import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { StatBlock } from '../blocks/StatBlock/StatBlockExtension';
import { ReadAloudBox } from '../blocks/ReadAloudBox/ReadAloudBoxExtension';
import { SidebarCallout } from '../blocks/SidebarCallout/SidebarCalloutExtension';
import { ChapterHeader } from '../blocks/ChapterHeader/ChapterHeaderExtension';
import { SpellCard } from '../blocks/SpellCard/SpellCardExtension';
import { MagicItem } from '../blocks/MagicItem/MagicItemExtension';
import { RandomTable } from '../blocks/RandomTable/RandomTableExtension';
import { NpcProfile } from '../blocks/NpcProfile/NpcProfileExtension';
import { EncounterTable } from '../blocks/EncounterTable/EncounterTableExtension';
import { ClassFeature } from '../blocks/ClassFeature/ClassFeatureExtension';
import { RaceBlock } from '../blocks/RaceBlock/RaceBlockExtension';
import { FullBleedImage } from '../blocks/FullBleedImage/FullBleedImageExtension';
import { MapBlock } from '../blocks/MapBlock/MapBlockExtension';
import { Handout } from '../blocks/Handout/HandoutExtension';
import { PageBorder } from '../blocks/PageBorder/PageBorderExtension';
import { PageBreak } from '../blocks/PageBreak/PageBreakExtension';
import { ColumnBreak } from '../blocks/ColumnBreak/ColumnBreakExtension';
import { TitlePage } from '../blocks/TitlePage/TitlePageExtension';
import { TableOfContents } from '../blocks/TableOfContents/TableOfContentsExtension';
import { CreditsPage } from '../blocks/CreditsPage/CreditsPageExtension';
import { BackCover } from '../blocks/BackCover/BackCoverExtension';
import { Toolbar } from './Toolbar';
import { BlockPalette } from '../sidebar/BlockPalette';
import { ThemePicker } from './ThemePicker';
import { ExportDialog } from './ExportDialog';
import { useThemeStore } from '../../stores/themeStore';
import { useExportStore } from '../../stores/exportStore';

interface EditorLayoutProps {
  projectId: string;
  content: any;
  onUpdate: (content: any) => void;
}

export function EditorLayout({ projectId, content, onUpdate }: EditorLayoutProps) {
  const [showBlockPalette, setShowBlockPalette] = useState(true);
  const [showProperties, setShowProperties] = useState(false);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const openExportDialog = useExportStore((s) => s.openDialog);

  const editor = useEditor({
    extensions: [StarterKit, StatBlock, ReadAloudBox, SidebarCallout, ChapterHeader, SpellCard, MagicItem, RandomTable, NpcProfile, EncounterTable, ClassFeature, RaceBlock, FullBleedImage, MapBlock, Handout, PageBorder, PageBreak, ColumnBreak, TitlePage, TableOfContents, CreditsPage, BackCover],
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
            onClick={openExportDialog}
            title="Export project"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 transition-colors rounded mr-1 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Export
          </button>
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
        <div className="flex-1 overflow-y-auto p-8" data-theme={currentTheme}>
          <div className="max-w-3xl mx-auto prose prose-lg max-w-none editor-themed-content">
            {editor && <EditorContent editor={editor} />}
          </div>
        </div>
      </div>

      {/* Right sidebar: Properties panel */}
      {showProperties && (
        <div className="w-64 border-l bg-gray-50 p-4 overflow-y-auto">
          <ThemePicker />
          <hr className="my-4 border-gray-200" />
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Properties
          </h3>
          <p className="text-xs text-gray-400 italic">
            Select a block to edit its properties.
          </p>
        </div>
      )}

      {/* Export Dialog */}
      <ExportDialog projectId={projectId} />
    </div>
  );
}
