import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { DocumentContent } from '@dnd-booker/shared';

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
  typeName: string;
  isAtomLike: boolean;
}

const INLINE_EDIT_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'readAloudBox',
  'sidebarCallout',
]);

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
      typeName: node.type.name,
      isAtomLike: node.isAtom || !INLINE_EDIT_NODE_TYPES.has(node.type.name),
    };
  });

  return match;
}

export function SelectedBlockEditorPanel({
  editor,
  selectedNodeId,
}: SelectedBlockEditorPanelProps) {
  const selectedBlock = useMemo(
    () => getTopLevelBlockMatch(editor, selectedNodeId),
    [editor, selectedNodeId, editor?.state.doc],
  );
  const [draftAttrs, setDraftAttrs] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBlock) {
      setDraftAttrs('{}');
      setError(null);
      return;
    }
    setDraftAttrs(JSON.stringify(selectedBlock.content.attrs ?? {}, null, 2));
    setError(null);
  }, [selectedBlock]);

  if (!selectedBlock) {
    return (
      <div className="w-80 border-l bg-gray-50 p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Block Inspector
        </h3>
        <p className="text-sm text-gray-500">
          Select a block in the page canvas to inspect it.
        </p>
      </div>
    );
  }

  const handleApply = () => {
    if (!editor) return;

    try {
      const nextAttrs = JSON.parse(draftAttrs) as Record<string, unknown>;
      const nextNode = editor.state.schema.nodeFromJSON({
        ...selectedBlock.content,
        attrs: {
          ...nextAttrs,
          nodeId: selectedBlock.nodeId,
        },
      });
      const transaction = editor.state.tr.replaceWith(
        selectedBlock.pos,
        selectedBlock.pos + selectedBlock.size,
        nextNode,
      );
      editor.view.dispatch(transaction);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to apply block attributes.');
    }
  };

  return (
    <div className="w-80 border-l bg-gray-50 flex flex-col">
      <div className="px-4 py-3 border-b bg-white">
        <h3 className="text-sm font-semibold text-gray-700">Selected Block</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {selectedBlock.label} • {selectedBlock.nodeId}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!selectedBlock.isAtomLike && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            This block edits inline on the visible page. Use the inspector only for structural attributes.
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Attributes
          </div>
          <textarea
            value={draftAttrs}
            onChange={(event) => setDraftAttrs(event.target.value)}
            spellCheck={false}
            className="min-h-[280px] w-full resize-y rounded-b-lg border-0 bg-white p-3 font-mono text-xs text-gray-800 outline-none"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleApply}
          className="rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          Apply Attributes
        </button>
      </div>
    </div>
  );
}
