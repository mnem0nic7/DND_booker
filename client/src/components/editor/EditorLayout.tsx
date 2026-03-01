import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { ErrorBoundary } from '../ErrorBoundary';
import type { DocumentContent } from '@dnd-booker/shared';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
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
import { ExportDialog } from './ExportDialog';
import { PropertiesPanel } from './PropertiesPanel';
import { PreviewPanel } from '../preview/PreviewPanel';
import { useThemeStore } from '../../stores/themeStore';
import { useExportStore } from '../../stores/exportStore';
import { useAiStore } from '../../stores/aiStore';
import { AiSettingsModal } from '../ai/AiSettingsModal';
import { AiChatPanel } from '../ai/AiChatPanel';

interface EditorLayoutProps {
  projectId: string;
  content: DocumentContent;
  onUpdate: (content: DocumentContent) => void;
}

export function EditorLayout({ projectId, content, onUpdate }: EditorLayoutProps) {
  const [showBlockPalette, setShowBlockPalette] = useState(true);
  const [showProperties, setShowProperties] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const openExportDialog = useExportStore((s) => s.openDialog);
  const setSettingsModalOpen = useAiStore((s) => s.setSettingsModalOpen);
  const [columnCount, setColumnCount] = useState<1 | 2>(2);
  const [showTexture, setShowTexture] = useState(true);
  const [sectionName, setSectionName] = useState('');

  const editor = useEditor({
    extensions: [StarterKit, Underline, Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }), StatBlock, ReadAloudBox, SidebarCallout, ChapterHeader, SpellCard, MagicItem, RandomTable, NpcProfile, EncounterTable, ClassFeature, RaceBlock, FullBleedImage, MapBlock, Handout, PageBorder, PageBreak, ColumnBreak, TitlePage, TableOfContents, CreditsPage, BackCover],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onUpdate(ed.getJSON());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const updateSection = () => {
      let found = '';
      const pos = editor.state.selection.$anchor.pos;
      editor.state.doc.nodesBetween(0, pos, (node) => {
        if (node.type.name === 'heading' && node.attrs.level === 1) {
          found = node.textContent;
        }
      });
      setSectionName(found);
    };
    editor.on('selectionUpdate', updateSection);
    editor.on('update', updateSection);
    return () => {
      editor.off('selectionUpdate', updateSection);
      editor.off('update', updateSection);
    };
  }, [editor]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar: Block Palette */}
      {showBlockPalette && <BlockPalette editor={editor} />}

      {/* Center: Toolbar + Editor */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center border-b bg-white flex-nowrap">
          <button
            onClick={() => setShowBlockPalette((v) => !v)}
            title={showBlockPalette ? 'Hide block palette' : 'Show block palette'}
            aria-label={showBlockPalette ? 'Hide block palette' : 'Show block palette'}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors border-r"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <Toolbar editor={editor} />
          </div>
          <button
            onClick={openExportDialog}
            title="Export project"
            aria-label="Export project"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-purple-700 hover:bg-purple-50 transition-colors rounded mr-1 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Export
          </button>
          <button
            onClick={() => setShowAiChat((v) => !v)}
            title={showAiChat ? 'Hide AI assistant' : 'Show AI assistant'}
            aria-label={showAiChat ? 'Hide AI assistant' : 'Show AI assistant'}
            className={`px-3 py-1.5 text-sm transition-colors rounded mr-1 flex items-center gap-1 ${
              showAiChat
                ? 'text-purple-700 bg-purple-50'
                : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            AI
          </button>
          <button
            onClick={() => setSettingsModalOpen(true)}
            title="AI Settings"
            aria-label="AI Settings"
            className="px-2 py-1.5 text-gray-400 hover:text-purple-600 transition-colors rounded mr-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" />
            </svg>
          </button>
          <button
            onClick={() => setShowPreview((v) => !v)}
            title={showPreview ? 'Hide preview' : 'Show preview'}
            aria-label={showPreview ? 'Hide preview' : 'Show preview'}
            className={`px-3 py-1.5 text-sm transition-colors rounded mr-1 flex items-center gap-1 ${
              showPreview
                ? 'text-purple-700 bg-purple-50'
                : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Preview
          </button>
          <button
            onClick={() => setShowProperties((v) => !v)}
            title={showProperties ? 'Hide properties' : 'Show properties'}
            aria-label={showProperties ? 'Hide properties' : 'Show properties'}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors border-l"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </button>
        </div>

        {/* Editor content area */}
        <div className="editor-outer" data-theme={currentTheme}>
          <div
            className="page-canvas editor-themed-content"
            data-columns={columnCount}
            {...(!showTexture ? { 'data-texture-off': '' } : {})}
          >
            {editor && (
              <ErrorBoundary fallbackMessage="A block encountered an error. Try removing the last edited block.">
                <EditorContent editor={editor} />
              </ErrorBoundary>
            )}
            <div className="page-footer">
              <span>{sectionName}</span>
              <span>1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar container — smooth width transitions */}
      {(() => {
        const showingAi = showAiChat && !showPreview;
        const showingPreview = showPreview;
        const showingProps = showProperties && !showPreview && !showAiChat;
        const isOpen = showingAi || showingPreview || showingProps;
        return (
          <div
            className={`overflow-hidden transition-[width,min-width,opacity] duration-300 ease-in-out ${
              isOpen ? 'opacity-100 border-l' : 'w-0 min-w-0 opacity-0'
            } ${
              showingAi ? 'w-[380px] min-w-[300px]'
              : showingPreview ? 'w-[480px] min-w-[320px]'
              : showingProps ? 'w-64'
              : ''
            }`}
          >
            {showingAi && <AiChatPanel projectId={projectId} editor={editor} />}
            {showingPreview && <PreviewPanel editor={editor} theme={currentTheme} />}
            {showingProps && <PropertiesPanel editor={editor} />}
          </div>
        );
      })()}

      {/* Export Dialog */}
      <ExportDialog projectId={projectId} />
      <AiSettingsModal />
    </div>
  );
}
