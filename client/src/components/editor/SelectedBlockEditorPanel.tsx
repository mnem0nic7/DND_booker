import { useEffect, useMemo, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { ensureStableNodeIds, type DocumentContent } from '@dnd-booker/shared';
import { buildEditorExtensions } from '../../lib/buildEditorExtensions';

interface SelectedBlockEditorPanelProps {
  editor: Editor | null;
  selectedNodeId: string | null;
}

interface TopLevelBlockMatch {
  nodeId: string;
  pos: number;
  size: number;
  content: DocumentContent;
  label: string;
}

function getTopLevelBlockMatch(editor: Editor | null, selectedNodeId: string | null): TopLevelBlockMatch | null {
  if (!editor || !selectedNodeId) return null;

  let match: TopLevelBlockMatch | null = null;
  editor.state.doc.forEach((node, offset) => {
    const nodeId = typeof node.attrs?.nodeId === 'string' ? String(node.attrs.nodeId) : null;
    if (!nodeId || nodeId !== selectedNodeId) return;
    match = {
      nodeId,
      pos: offset + 1,
      size: node.nodeSize,
      content: node.toJSON() as DocumentContent,
      label: node.type.name,
    };
  });

  return match;
}

function blockDocContent(content: DocumentContent): DocumentContent {
  return ensureStableNodeIds({
    type: 'doc',
    content: [content],
  });
}

export function SelectedBlockEditorPanel({
  editor,
  selectedNodeId,
}: SelectedBlockEditorPanelProps) {
  const selectedBlock = useMemo(
    () => getTopLevelBlockMatch(editor, selectedNodeId),
    [editor, selectedNodeId, editor?.state.doc],
  );
  const syncingRef = useRef(false);

  const blockEditor = useEditor(
    {
      extensions: buildEditorExtensions(),
      content: selectedBlock ? blockDocContent(selectedBlock.content) : { type: 'doc', content: [{ type: 'paragraph' }] },
      immediatelyRender: false,
      onUpdate: ({ editor: blockEditorInstance }) => {
        if (!editor || !selectedBlock || syncingRef.current) return;

        const nextDoc = blockEditorInstance.getJSON() as DocumentContent;
        const replacement = ensureStableNodeIds((nextDoc.content?.[0] as DocumentContent | undefined) ?? selectedBlock.content);
        const currentSelection = getTopLevelBlockMatch(editor, selectedBlock.nodeId);
        if (!currentSelection) return;

        syncingRef.current = true;
        try {
          const nextAttrs = {
            ...(replacement.attrs ?? {}),
            nodeId: selectedBlock.nodeId,
          };
          const nextNode = editor.state.schema.nodeFromJSON({
            ...replacement,
            attrs: nextAttrs,
          });
          const transaction = editor.state.tr.replaceWith(
            currentSelection.pos,
            currentSelection.pos + currentSelection.size,
            nextNode,
          );
          editor.view.dispatch(transaction);
        } finally {
          syncingRef.current = false;
        }
      },
    },
    [selectedBlock?.nodeId],
  );

  useEffect(() => {
    if (!blockEditor || !selectedBlock) return;
    syncingRef.current = true;
    blockEditor.commands.setContent(blockDocContent(selectedBlock.content), { emitUpdate: false });
    syncingRef.current = false;
  }, [blockEditor, selectedBlock]);

  if (!selectedBlock) {
    return (
      <div className="w-80 border-l bg-gray-50 p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Block Editor
        </h3>
        <p className="text-sm text-gray-500">
          Select a block in the page canvas to edit it here.
        </p>
      </div>
    );
  }

  return (
    <div className="w-80 border-l bg-gray-50 flex flex-col">
      <div className="px-4 py-3 border-b bg-white">
        <h3 className="text-sm font-semibold text-gray-700">Selected Block</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {selectedBlock.label} • {selectedBlock.nodeId}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {blockEditor && <EditorContent editor={blockEditor} className="selected-block-editor" />}
        </div>
      </div>
    </div>
  );
}
