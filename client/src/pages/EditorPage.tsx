import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../stores/documentStore';
import { useAuthStore } from '../stores/authStore';
import { EditorLayout } from '../components/editor/EditorLayout';

export default function EditorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    documents,
    activeDocumentId,
    isLoading,
    isSaving,
    fetchDocuments,
    setActiveDocument,
    updateDocumentContent,
    createDocument,
    deleteDocument,
  } = useDocumentStore();

  const [showNewDocInput, setShowNewDocInput] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  useEffect(() => {
    if (projectId) {
      fetchDocuments(projectId);
    }
  }, [projectId, fetchDocuments]);

  const activeDocument = documents.find((d) => d.id === activeDocumentId);

  const handleContentUpdate = useCallback(
    (content: any) => {
      if (activeDocumentId) {
        updateDocumentContent(activeDocumentId, content);
      }
    },
    [activeDocumentId, updateDocumentContent],
  );

  const handleCreateDocument = async () => {
    if (!projectId || !newDocTitle.trim()) return;
    await createDocument(projectId, newDocTitle.trim());
    setNewDocTitle('');
    setShowNewDocInput(false);
  };

  const handleDeleteDocument = async (docId: string) => {
    if (window.confirm('Delete this document? This cannot be undone.')) {
      await deleteDocument(docId);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Top header */}
      <header className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Back to Dashboard"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900">DND Booker</h1>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              Editor
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Save indicator */}
            <span className="text-xs text-gray-400">
              {isSaving ? 'Saving...' : 'Saved'}
            </span>
            <span className="text-sm text-gray-600">{user?.displayName}</span>
            <button
              onClick={() => logout()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Document sidebar */}
        <div className="w-56 border-r bg-white flex flex-col flex-shrink-0">
          <div className="p-3 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
            <button
              onClick={() => setShowNewDocInput(true)}
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

          {/* New document input */}
          {showNewDocInput && (
            <div className="p-2 border-b">
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateDocument();
                  if (e.key === 'Escape') {
                    setShowNewDocInput(false);
                    setNewDocTitle('');
                  }
                }}
                placeholder="Document title..."
                className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              <div className="flex gap-1 mt-1">
                <button
                  onClick={handleCreateDocument}
                  className="text-xs bg-indigo-600 text-white rounded px-2 py-0.5 hover:bg-indigo-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewDocInput(false);
                    setNewDocTitle('');
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Document list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="p-4 text-xs text-gray-400">Loading...</div>
            )}
            {!isLoading && documents.length === 0 && (
              <div className="p-4 text-xs text-gray-400 text-center">
                No documents yet. Create one to get started.
              </div>
            )}
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`group flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-50 transition-colors ${
                  doc.id === activeDocumentId
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setActiveDocument(doc.id)}
              >
                <span className="text-sm truncate">{doc.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteDocument(doc.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
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
              </div>
            ))}
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex-1 overflow-hidden">
          {activeDocument ? (
            <EditorLayout
              key={activeDocument.id}
              content={activeDocument.content}
              onUpdate={handleContentUpdate}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              {isLoading
                ? 'Loading documents...'
                : 'Select or create a document to start editing.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
