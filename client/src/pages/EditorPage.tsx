import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { DocumentContent } from '@dnd-booker/shared';
import { useDocumentStore } from '../stores/documentStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { EditorLayout } from '../components/editor/EditorLayout';
import { DocumentList } from '../components/editor/DocumentList';
import api from '../lib/api';

export default function EditorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    documents,
    activeDocumentId,
    isLoading,
    isSaving,
    hasPendingChanges,
    fetchDocuments,
    setActiveDocument,
    updateDocumentContent,
    createDocument,
    deleteDocument,
    renameDocument,
    reorderDocuments,
    flushPendingSave,
    cancelPendingSave,
  } = useDocumentStore();

  const { loadProjectTheme } = useThemeStore();
  const [showNewDocInput, setShowNewDocInput] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');

  useEffect(() => {
    if (projectId) {
      cancelPendingSave(); // Cancel saves for previous project
      fetchDocuments(projectId);
      // Load project settings (including theme) from server
      api.get(`/projects/${projectId}`).then(({ data }) => {
        loadProjectTheme(projectId, data.settings);
      }).catch(() => {/* theme will use local fallback */});
    }
    return () => {
      // Flush pending save on unmount (navigation away from editor)
      flushPendingSave();
    };
  }, [projectId, fetchDocuments, loadProjectTheme, cancelPendingSave, flushPendingSave]);

  // Warn user about unsaved changes when closing/navigating away
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isSaving || hasPendingChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isSaving, hasPendingChanges]);

  const activeDocument = documents.find((d) => d.id === activeDocumentId);

  const handleContentUpdate = useCallback(
    (content: DocumentContent) => {
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

  const handleRename = useCallback(
    async (docId: string, title: string) => {
      await renameDocument(docId, title);
    },
    [renameDocument],
  );

  const handleReorder = useCallback(
    (documentIds: string[]) => {
      if (projectId) {
        reorderDocuments(projectId, documentIds);
      }
    },
    [projectId, reorderDocuments],
  );

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
        {isLoading ? (
          <div className="w-56 border-r bg-white flex items-center justify-center flex-shrink-0">
            <span className="text-xs text-gray-400">Loading...</span>
          </div>
        ) : (
          <DocumentList
            projectId={projectId!}
            documents={documents}
            activeDocumentId={activeDocumentId}
            onSelectDocument={setActiveDocument}
            onAddDocument={() => setShowNewDocInput(true)}
            onReorder={handleReorder}
            onDeleteDocument={handleDeleteDocument}
            onRenameDocument={handleRename}
          >
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
          </DocumentList>
        )}

        {/* Main editor area */}
        <div className="flex-1 overflow-hidden">
          {activeDocument ? (
            <EditorLayout
              key={activeDocument.id}
              projectId={projectId!}
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
