import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { DocumentContent, LayoutDocumentV2, LayoutPlan } from '@dnd-booker/shared';
import { useProjectStore } from '../stores/projectStore';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import {
  countDocumentTextLayoutFallbackScopes,
  getDocumentTextLayoutFallbackScopeIds,
} from '../lib/projectSettings';
import { EditorLayout } from '../components/editor/EditorLayout';
import { DocumentNavigator } from '../components/editor/DocumentNavigator';

export default function EditorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const {
    currentProject,
    isLoadingProject,
    isSaving,
    hasPendingChanges,
    saveError,
    fetchProject,
    updateContent,
    flushPendingSave,
    cancelPendingSave,
    retrySave,
    documents,
    activeDocument,
    isLoadingDocuments,
    isLoadingDocument,
    fetchDocuments,
    updateDocumentContent,
    updateDocumentLayoutPlan,
    clearDocumentTextLayoutFallbacks,
    clearActiveDocument,
  } = useProjectStore();

  const { loadProjectTheme } = useThemeStore();

  useEffect(() => {
    if (projectId) {
      cancelPendingSave(); // Cancel saves for previous project
      fetchProject(projectId).then(() => {
        const project = useProjectStore.getState().currentProject;
        if (project) {
          loadProjectTheme(projectId, project.settings);
        }
      });
      fetchDocuments(projectId);
    }
    return () => {
      flushPendingSave();
      clearActiveDocument();
    };
  }, [projectId, fetchProject, fetchDocuments, loadProjectTheme, cancelPendingSave, flushPendingSave, clearActiveDocument]);

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

  const handleContentUpdate = useCallback(
    (content: DocumentContent) => {
      updateContent(content);
    },
    [updateContent],
  );

  const handleDocumentContentUpdate = useCallback(
    (content: DocumentContent, options?: { layoutSnapshot?: LayoutDocumentV2 | null }) => {
      updateDocumentContent(content, options);
    },
    [updateDocumentContent],
  );

  const handleDocumentLayoutPlanUpdate = useCallback(
    async (layoutPlan: LayoutPlan) => {
      await updateDocumentLayoutPlan(layoutPlan);
    },
    [updateDocumentLayoutPlan],
  );

  const activeDocumentFallbackScopeIds = activeDocument
    ? getDocumentTextLayoutFallbackScopeIds(currentProject?.settings, activeDocument.id)
    : [];
  const activeDocumentFallbackScopeCount = activeDocument
    ? countDocumentTextLayoutFallbackScopes(currentProject?.settings, activeDocument.id)
    : 0;

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
            {saveError ? (
              <span className="text-xs text-red-500 font-medium flex items-center gap-2">
                {saveError.message}
                <button
                  onClick={retrySave}
                  className="underline hover:text-red-400 transition-colors"
                >
                  Retry
                </button>
              </span>
            ) : (
              <span className="text-xs text-gray-400">
                {isSaving ? 'Saving...' : hasPendingChanges ? 'Unsaved changes' : 'Saved'}
              </span>
            )}
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

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {documents.length > 0 && (
          <DocumentNavigator projectId={projectId!} />
        )}
        <div className="flex-1 overflow-hidden">
          {isLoadingProject ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading...
            </div>
          ) : isLoadingDocuments && documents.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading documents...
            </div>
          ) : documents.length > 0 && activeDocument ? (
            <EditorLayout
              key={activeDocument.id}
              projectId={projectId!}
              content={activeDocument.content as DocumentContent}
              layoutPlan={activeDocument.layoutPlan}
              layoutSnapshot={activeDocument.layoutSnapshotJson}
              textLayoutFallbackScopeIds={activeDocumentFallbackScopeIds}
              textLayoutFallbackScopeCount={activeDocumentFallbackScopeCount}
              documentKind={activeDocument.kind}
              documentTitle={activeDocument.title}
              onClearTextLayoutFallbacks={() => clearDocumentTextLayoutFallbacks(activeDocument.id)}
              onUpdate={handleDocumentContentUpdate}
              onLayoutPlanUpdate={handleDocumentLayoutPlanUpdate}
            />
          ) : documents.length > 0 && !activeDocument ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              {isLoadingDocument ? 'Loading document...' : 'Select a document from the sidebar to begin editing.'}
            </div>
          ) : currentProject?.content ? (
            <EditorLayout
              key={currentProject.id}
              projectId={projectId!}
              content={currentProject.content}
              onUpdate={handleContentUpdate}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Project not found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
