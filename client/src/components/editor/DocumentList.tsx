import { useState, useRef, useCallback, type ReactNode } from 'react';

interface DocumentListProps {
  projectId: string;
  documents: Array<{ id: string; title: string; sortOrder: number }>;
  activeDocumentId: string | null;
  onSelectDocument: (id: string) => void;
  onAddDocument: () => void;
  onReorder: (documentIds: string[]) => void;
  onDeleteDocument?: (id: string) => void;
  children?: ReactNode;
}

export function DocumentList({
  documents,
  activeDocumentId,
  onSelectDocument,
  onAddDocument,
  onReorder,
  onDeleteDocument,
  children,
}: DocumentListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragOverCounter = useRef<Map<string, number>>(new Map());

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, docId: string) => {
      setDraggedId(docId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', docId);
    },
    [],
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

  return (
    <div className="w-56 border-r bg-white flex flex-col flex-shrink-0">
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
        <button
          onClick={onAddDocument}
          className="text-gray-400 hover:text-indigo-600 transition-colors"
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

          return (
            <div
              key={doc.id}
              draggable
              onDragStart={(e) => handleDragStart(e, doc.id)}
              onDragEnd={handleDragEnd}
              onDragEnter={(e) => handleDragEnter(e, doc.id)}
              onDragLeave={(e) => handleDragLeave(e, doc.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, doc.id)}
              className={`
                group flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-50 transition-all text-sm select-none
                ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
                ${isDragged ? 'opacity-40' : 'opacity-100'}
                ${isDropTarget ? 'border-t-2 border-t-indigo-400' : ''}
              `}
              onClick={() => onSelectDocument(doc.id)}
            >
              <div className="flex items-center min-w-0">
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
                <span className="truncate">{doc.title}</span>
              </div>
              {onDeleteDocument && (
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
