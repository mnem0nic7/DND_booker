import { useState, useRef, useCallback, type ReactNode } from 'react';

interface DocumentListProps {
  projectId: string;
  documents: Array<{ id: string; title: string; sortOrder: number }>;
  activeDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onAddDocument: () => void;
  onReorder: (documentIds: string[]) => void;
  onDeleteDocument?: (id: string) => void;
  onRenameDocument?: (id: string, title: string) => Promise<void>;
  children?: ReactNode;
}

export function DocumentList({
  documents,
  activeDocumentId,
  onSelectDocument,
  onAddDocument,
  onReorder,
  onDeleteDocument,
  onRenameDocument,
  children,
}: DocumentListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const dragOverCounter = useRef<Map<string, number>>(new Map());
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, docId: string) => {
      if (renamingId) return; // Don't drag while renaming
      setDraggedId(docId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', docId);
    },
    [renamingId],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
    dragOverCounter.current.clear();
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>, docId: string) => {
      e.preventDefault();
      const count = (dragOverCounter.current.get(docId) ?? 0) + 1;
      dragOverCounter.current.set(docId, count);
      if (docId !== draggedId) {
        setDropTargetId(docId);
      }
    },
    [draggedId],
  );

  const handleDragLeave = useCallback(
    (_e: React.DragEvent<HTMLDivElement>, docId: string) => {
      const count = (dragOverCounter.current.get(docId) ?? 1) - 1;
      dragOverCounter.current.set(docId, count);
      if (count <= 0) {
        dragOverCounter.current.delete(docId);
        if (dropTargetId === docId) {
          setDropTargetId(null);
        }
      }
    },
    [dropTargetId],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData('text/plain');
      if (!sourceId || sourceId === targetId) {
        setDraggedId(null);
        setDropTargetId(null);
        dragOverCounter.current.clear();
        return;
      }

      const currentIds = documents.map((d) => d.id);
      const sourceIndex = currentIds.indexOf(sourceId);
      const targetIndex = currentIds.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      // Remove source from its position and insert at target position
      const newIds = [...currentIds];
      newIds.splice(sourceIndex, 1);
      newIds.splice(targetIndex, 0, sourceId);

      onReorder(newIds);
      setDraggedId(null);
      setDropTargetId(null);
      dragOverCounter.current.clear();
    },
    [documents, onReorder],
  );

  const startRename = useCallback((docId: string, currentTitle: string) => {
    setRenamingId(docId);
    setRenameTitle(currentTitle);
    // Focus input after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId || !renameTitle.trim()) {
      setRenamingId(null);
      return;
    }
    const doc = documents.find((d) => d.id === renamingId);
    if (doc && doc.title !== renameTitle.trim() && onRenameDocument) {
      try {
        await onRenameDocument(renamingId, renameTitle.trim());
      } catch {
        // Rollback handled by store
      }
    }
    setRenamingId(null);
  }, [renamingId, renameTitle, documents, onRenameDocument]);

  return (
    <div className="w-56 border-r bg-white flex flex-col flex-shrink-0">
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
        <button
          onClick={onAddDocument}
          className="text-gray-400 hover:text-purple-600 transition-colors"
          title="New document"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {children}

      <div className="flex-1 overflow-y-auto">
        {documents.length === 0 && (
          <div className="p-4 text-xs text-gray-400 text-center">
            No documents yet. Create one to get started.
          </div>
        )}
        {documents.map((doc) => {
          const isDragged = doc.id === draggedId;
          const isDropTarget = doc.id === dropTargetId && doc.id !== draggedId;
          const isActive = doc.id === activeDocumentId;
          const isRenaming = doc.id === renamingId;

          return (
            <div
              key={doc.id}
              draggable={!isRenaming}
              onDragStart={(e) => handleDragStart(e, doc.id)}
              onDragEnd={handleDragEnd}
              onDragEnter={(e) => handleDragEnter(e, doc.id)}
              onDragLeave={(e) => handleDragLeave(e, doc.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, doc.id)}
              className={`
                group flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-50 transition-all text-sm select-none
                ${isActive ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
                ${isDragged ? 'opacity-40' : 'opacity-100'}
                ${isDropTarget ? 'border-t-2 border-t-purple-400' : ''}
              `}
              onClick={() => {
                if (!isRenaming) onSelectDocument(doc.id);
              }}
            >
              <div className="flex items-center min-w-0 flex-1">
                <svg
                  className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                </svg>
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameTitle}
                    onChange={(e) => setRenameTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitRename}
                    className="w-full text-sm border rounded px-1 py-0 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (onRenameDocument) startRename(doc.id, doc.title);
                    }}
                  >
                    {doc.title}
                  </span>
                )}
              </div>
              {!isRenaming && onDeleteDocument && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDocument(doc.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0 ml-1"
                  title="Delete document"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
