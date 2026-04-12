import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import {
  buildLayoutDocumentV2,
  ensureStableNodeIds,
  type DocumentContent,
  type LayoutDocumentV2,
  type LayoutPlan,
} from '@dnd-booker/shared';
import { buildEditorExtensions } from '../../lib/buildEditorExtensions';
import { useMeasuredLayoutDocument } from '../../lib/useMeasuredLayoutDocument';
import { Toolbar } from './Toolbar';
import { FloatingBlockPicker } from './FloatingBlockPicker';
import { ExportDialog } from './ExportDialog';
import { ProjectAssetGalleryDialog } from './ProjectAssetGalleryDialog';
import { RenderedDocumentCanvas } from './RenderedDocumentCanvas';
import { SelectedBlockEditorPanel } from './SelectedBlockEditorPanel';
import { PreviewPanel } from '../preview/PreviewPanel';
import { useThemeStore } from '../../stores/themeStore';
import { useExportStore } from '../../stores/exportStore';
import { useAiStore } from '../../stores/aiStore';
import { usePageAlignment } from '../../hooks/usePageAlignment';
import { AiSettingsModal } from '../ai/AiSettingsModal';
import { AiChatPanel } from '../ai/AiChatPanel';
import { AutonomousGenerationDialog } from '../ai/AutonomousGenerationDialog';
import { AutonomousAgentDialog } from '../ai/AutonomousAgentDialog';
import { ImprovementLoopDialog } from '../ai/ImprovementLoopDialog';

type PageSize = 'letter' | 'a4' | 'a5';

interface EditorLayoutProps {
  projectId: string;
  content: DocumentContent;
  layoutPlan?: LayoutPlan | null;
  layoutSnapshot?: LayoutDocumentV2 | null;
  textLayoutFallbackScopeIds?: string[];
  textLayoutFallbackScopeCount?: number;
  documentKind?: string | null;
  documentTitle?: string | null;
  onClearTextLayoutFallbacks?: () => Promise<void> | void;
  onUpdate: (content: DocumentContent, options?: { layoutSnapshot?: LayoutDocumentV2 | null }) => void;
  onLayoutPlanUpdate?: (layoutPlan: LayoutPlan) => Promise<void> | void;
}

function layoutSnapshotSignature(snapshot: LayoutDocumentV2 | null | undefined): string | null {
  if (!snapshot) return null;
  return JSON.stringify({
    preset: snapshot.preset,
    sectionRecipe: snapshot.sectionRecipe,
    pageCount: snapshot.metrics.pageCount,
    fragmentCount: snapshot.metrics.fragmentCount,
    pages: snapshot.pages.map((page) => ({
      index: page.index,
      fragmentIds: page.fragmentIds,
      boundaryType: page.boundaryType,
      boundaryNodeId: page.boundaryNodeId,
    })),
    fragments: snapshot.fragments.map((fragment) => ({
      id: fragment.id,
      nodeId: fragment.nodeId,
      pageIndex: fragment.pageIndex,
      columnIndex: fragment.columnIndex,
      region: fragment.region,
      flowBehavior: fragment.flowBehavior,
      bounds: fragment.bounds,
    })),
  });
}

export function EditorLayout({
  projectId,
  content,
  layoutPlan = null,
  layoutSnapshot = null,
  textLayoutFallbackScopeIds = [],
  textLayoutFallbackScopeCount = 0,
  documentKind = null,
  documentTitle = null,
  onClearTextLayoutFallbacks,
  onUpdate,
  onLayoutPlanUpdate,
}: EditorLayoutProps) {
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [showGenerationDialog, setShowGenerationDialog] = useState(false);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [showImprovementLoopDialog, setShowImprovementLoopDialog] = useState(false);
  const [showAssetGallery, setShowAssetGallery] = useState(false);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const openExportDialog = useExportStore((s) => s.openDialog);
  const setSettingsModalOpen = useAiStore((s) => s.setSettingsModalOpen);
  const [columnCount, setColumnCount] = useState<1 | 2>(2);
  const [pageSize, setPageSize] = useState<PageSize>('letter');
  const [showTexture, setShowTexture] = useState(true);
  const [sectionName, setSectionName] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [localLayoutPlan, setLocalLayoutPlan] = useState<LayoutPlan | null>(layoutPlan);
  const [isClearingTextLayoutFallbacks, setIsClearingTextLayoutFallbacks] = useState(false);
  const resolvedDocumentTitle = documentTitle ?? sectionName ?? null;
  const layoutSnapshotRef = useRef<LayoutDocumentV2 | null>(layoutSnapshot);
  const liveLayoutSnapshotRef = useRef<LayoutDocumentV2 | null>(layoutSnapshot);
  const lastPublishedLayoutSignatureRef = useRef<string | null>(layoutSnapshotSignature(layoutSnapshot));
  const themeRef = useRef(currentTheme);
  const layoutPlanRef = useRef<LayoutPlan | null>(layoutPlan);
  const documentKindRef = useRef<string | null>(documentKind);
  const documentTitleRef = useRef<string | null>(resolvedDocumentTitle);
  const suppressOnUpdateRef = useRef(false);

  const editor = useEditor({
    extensions: buildEditorExtensions({
      includeSnapshotPagination: true,
      getLayoutSnapshot: () => liveLayoutSnapshotRef.current,
    }),
    content: ensureStableNodeIds(content),
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (suppressOnUpdateRef.current) {
        return;
      }
      const nextContent = ed.getJSON() as DocumentContent;
      const nextLayoutSnapshot = buildLayoutDocumentV2({
        content: nextContent,
        layoutPlan: layoutPlanRef.current,
        preset: 'standard_pdf',
        theme: themeRef.current,
        documentKind: documentKindRef.current,
        documentTitle: documentTitleRef.current,
        measurementMode: 'deterministic',
        respectManualPageBreaks: true,
      });
      layoutSnapshotRef.current = nextLayoutSnapshot;
      liveLayoutSnapshotRef.current = nextLayoutSnapshot;
      onUpdate(nextContent, { layoutSnapshot: nextLayoutSnapshot });
    },
  });

  useEffect(() => {
    setLocalLayoutPlan(layoutPlan);
  }, [layoutPlan]);

  useEffect(() => {
    themeRef.current = currentTheme;
  }, [currentTheme]);

  useEffect(() => {
    layoutPlanRef.current = localLayoutPlan;
  }, [localLayoutPlan]);

  useEffect(() => {
    documentKindRef.current = documentKind;
  }, [documentKind]);

  useEffect(() => {
    documentTitleRef.current = resolvedDocumentTitle;
  }, [resolvedDocumentTitle]);

  useEffect(() => {
    if (!editor) return;
    const updateSection = () => {
      let found = '';
      let selectedNode: string | null = null;
      const pos = editor.state.selection.$anchor.pos;
      editor.state.doc.forEach((node, offset) => {
        const nodeStart = offset + 1;
        const nodeEnd = nodeStart + node.nodeSize - 1;
        if (pos >= nodeStart && pos <= nodeEnd && typeof node.attrs?.nodeId === 'string') {
          selectedNode = String(node.attrs.nodeId);
        }
      });
      editor.state.doc.nodesBetween(0, pos, (node) => {
        if (node.type.name === 'heading' && node.attrs.level === 1) {
          found = node.textContent;
        }
      });
      setSectionName(found);
      setSelectedNodeId(selectedNode);
    };
    editor.on('selectionUpdate', updateSection);
    editor.on('update', updateSection);
    updateSection();
    return () => {
      editor.off('selectionUpdate', updateSection);
      editor.off('update', updateSection);
    };
  }, [editor]);

  // A5 is too narrow for two columns — force single column
  useEffect(() => {
    if (pageSize === 'a5' && columnCount === 2) {
      setColumnCount(1);
    }
  }, [pageSize, columnCount]);

  const measuredDocument = useMeasuredLayoutDocument({
    editor,
    initialContent: content,
    initialLayoutSnapshot: layoutSnapshot,
    theme: currentTheme,
    layoutPlan: localLayoutPlan,
    fallbackScopeIds: textLayoutFallbackScopeIds,
    documentKind,
    documentTitle: resolvedDocumentTitle,
    preset: 'standard_pdf',
    footerTitle: resolvedDocumentTitle,
  });

  usePageAlignment(editor);

  useEffect(() => {
    layoutSnapshotRef.current = measuredDocument.layoutSnapshot ?? layoutSnapshot ?? null;
    liveLayoutSnapshotRef.current = measuredDocument.layoutSnapshot ?? layoutSnapshot ?? null;
  }, [layoutSnapshot, measuredDocument.layoutSnapshot, layoutSnapshotRef]);

  useEffect(() => {
    if (!editor || !editor.view) return;
    editor.view.dispatch(
      editor.state.tr.setMeta('snapshotPaginationRefresh', Date.now()),
    );
  }, [editor, measuredDocument.layoutSnapshot]);

  useEffect(() => {
    lastPublishedLayoutSignatureRef.current = layoutSnapshotSignature(layoutSnapshot);
  }, [layoutSnapshot, lastPublishedLayoutSignatureRef]);

  useEffect(() => {
    if (!editor || !measuredDocument.layoutSnapshot) return;
    const nextSignature = layoutSnapshotSignature(measuredDocument.layoutSnapshot);
    if (!nextSignature || nextSignature === lastPublishedLayoutSignatureRef.current) return;
    lastPublishedLayoutSignatureRef.current = nextSignature;
    onUpdate(editor.getJSON() as DocumentContent, { layoutSnapshot: measuredDocument.layoutSnapshot });
  }, [editor, measuredDocument.layoutSnapshot, onUpdate]);

  const selectNodeById = useCallback((nodeId: string) => {
    if (!editor) return;
    editor.state.doc.forEach((node, offset) => {
      if (String(node.attrs?.nodeId ?? '') !== nodeId) return;
      editor.commands.focus();
      editor.commands.setNodeSelection(offset + 1);
    });
    setSelectedNodeId(nodeId);
    setShowProperties(true);
  }, [editor]);

  const handleReorderNode = useCallback(async (draggedNodeId: string, targetNodeId: string, placement: 'before' | 'after') => {
    if (!editor) return;
    const previousContent = editor.getJSON() as DocumentContent;
    const previousLayoutPlan = localLayoutPlan;

    const locateNode = (nodeId: string): { pos: number; size: number } | null => {
      let match: { pos: number; size: number } | null = null;
      editor.state.doc.forEach((node, offset) => {
        if (String(node.attrs?.nodeId ?? '') !== nodeId) return;
        match = {
          pos: offset + 1,
          size: node.nodeSize,
        };
      });
      return match;
    };

    const dragged = locateNode(draggedNodeId);
    const target = locateNode(targetNodeId);
    if (!dragged || !target) return;

    const draggedNode = editor.state.doc.nodeAt(dragged.pos);
    if (!draggedNode) return;

    const transaction = editor.state.tr.delete(dragged.pos, dragged.pos + dragged.size);
    const adjustedTargetPos = dragged.pos < target.pos ? target.pos - dragged.size : target.pos;
    const insertPos = placement === 'before'
      ? adjustedTargetPos
      : adjustedTargetPos + target.size;
    transaction.insert(insertPos, draggedNode);
    editor.view.dispatch(transaction);

    if (!localLayoutPlan || !onLayoutPlanUpdate) return;

    const orderedBlocks = [...localLayoutPlan.blocks].sort((left, right) => left.presentationOrder - right.presentationOrder);
    const draggedIndex = orderedBlocks.findIndex((block) => block.nodeId === draggedNodeId);
    const targetIndex = orderedBlocks.findIndex((block) => block.nodeId === targetNodeId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const [draggedBlock] = orderedBlocks.splice(draggedIndex, 1);
    const insertionIndexBase = orderedBlocks.findIndex((block) => block.nodeId === targetNodeId);
    const insertionIndex = placement === 'before' ? insertionIndexBase : insertionIndexBase + 1;
    orderedBlocks.splice(insertionIndex, 0, draggedBlock);

    const nextLayoutPlan: LayoutPlan = {
      ...localLayoutPlan,
      blocks: orderedBlocks.map((block, index) => ({
        ...block,
        presentationOrder: index,
      })),
    };

    setLocalLayoutPlan(nextLayoutPlan);
    try {
      await onLayoutPlanUpdate(nextLayoutPlan);
    } catch {
      suppressOnUpdateRef.current = true;
      editor.commands.setContent(previousContent, { emitUpdate: false });
      suppressOnUpdateRef.current = false;
      setLocalLayoutPlan(previousLayoutPlan);
    }
  }, [editor, localLayoutPlan, onLayoutPlanUpdate]);

  const handleClearTextLayoutFallbacks = useCallback(async () => {
    if (!onClearTextLayoutFallbacks || isClearingTextLayoutFallbacks) return;
    setIsClearingTextLayoutFallbacks(true);
    try {
      await onClearTextLayoutFallbacks();
    } finally {
      setIsClearingTextLayoutFallbacks(false);
    }
  }, [isClearingTextLayoutFallbacks, onClearTextLayoutFallbacks]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Center: Toolbar + Page Canvas */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center border-b bg-white flex-nowrap">
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <Toolbar
              editor={editor}
              columnCount={columnCount}
              setColumnCount={setColumnCount}
              pageSize={pageSize}
              setPageSize={setPageSize}
              showTexture={showTexture}
              setShowTexture={setShowTexture}
              onOpenBlockPicker={() => setShowBlockPicker(true)}
            />
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
            onClick={() => setShowAssetGallery(true)}
            title="Project images"
            aria-label="Project images"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-purple-700 hover:bg-purple-50 transition-colors rounded mr-1 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25v-.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15l4.5-4.5a2.121 2.121 0 013 0L15 15m-1.5-1.5l1.629-1.629a2.121 2.121 0 013 0L21 15" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75h.008v.008H8.25V9.75z" />
            </svg>
            Images
          </button>
          <button
            onClick={() => setShowGenerationDialog(true)}
            title="Generate Content"
            aria-label="Generate Content"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-purple-700 hover:bg-purple-50 transition-colors rounded mr-1 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
            </svg>
            Generate Content
          </button>
          <button
            onClick={() => setShowAgentDialog(true)}
            title="Autonomous creative director"
            aria-label="Autonomous creative director"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-amber-700 hover:bg-amber-50 transition-colors rounded mr-1 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 5.53h5.81l-4.7 3.42 1.8 5.53L12 14.06l-4.71 3.42 1.8-5.53-4.7-3.42h5.81L12 3z" />
            </svg>
            Creative Director
          </button>
          <button
            onClick={() => setShowImprovementLoopDialog(true)}
            title="Run creator, designer, editor, and engineering loop"
            aria-label="Run creator, designer, editor, and engineering loop"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors rounded mr-1 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0113.36-4.64M19.5 12a7.5 7.5 0 01-13.36 4.64" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5h1.5v1.5M7.5 19.5H6v-1.5" />
            </svg>
            Improvement Loop
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

        {/* Floating block picker */}
        {editor && (
          <FloatingBlockPicker
            editor={editor}
            isOpen={showBlockPicker}
            onClose={() => setShowBlockPicker(false)}
          />
        )}

        {textLayoutFallbackScopeCount > 0 && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-amber-900">Legacy fallback is active for this document</div>
                <p className="mt-1 text-xs text-amber-800">
                  {textLayoutFallbackScopeCount} scoped fallback{textLayoutFallbackScopeCount === 1 ? '' : 's'} are stabilizing preview, export, and server-side pagination for this document.
                </p>
              </div>
              <button
                onClick={() => { void handleClearTextLayoutFallbacks(); }}
                disabled={isClearingTextLayoutFallbacks}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isClearingTextLayoutFallbacks ? 'Clearing...' : 'Clear fallback'}
              </button>
            </div>
          </div>
        )}

        <RenderedDocumentCanvas
          editor={editor}
          theme={currentTheme}
          measuredDocument={measuredDocument}
          pageSize={pageSize}
          columnCount={columnCount}
          showTexture={showTexture}
          selectedNodeId={selectedNodeId}
          onSelectNodeId={selectNodeById}
          onReorderNode={handleReorderNode}
        />
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
            {showingAi && <AiChatPanel projectId={projectId} editor={editor} pageMetrics={measuredDocument.pageMetrics} />}
            {showingPreview && (
              <PreviewPanel
                theme={currentTheme}
                measuredDocument={measuredDocument}
              />
            )}
            {showingProps && (
              <SelectedBlockEditorPanel
                editor={editor}
                selectedNodeId={selectedNodeId}
              />
            )}
          </div>
        );
      })()}

      {/* Export Dialog */}
      <ExportDialog projectId={projectId} />
      <ProjectAssetGalleryDialog
        projectId={projectId}
        isOpen={showAssetGallery}
        onClose={() => setShowAssetGallery(false)}
      />
      <AutonomousGenerationDialog
        projectId={projectId}
        isOpen={showGenerationDialog}
        onClose={() => setShowGenerationDialog(false)}
      />
      <AutonomousAgentDialog
        projectId={projectId}
        isOpen={showAgentDialog}
        onClose={() => setShowAgentDialog(false)}
      />
      <ImprovementLoopDialog
        projectId={projectId}
        isOpen={showImprovementLoopDialog}
        onClose={() => setShowImprovementLoopDialog(false)}
      />
      <AiSettingsModal />
    </div>
  );
}
