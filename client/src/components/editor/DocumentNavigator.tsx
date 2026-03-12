import { useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import type { DocumentKind } from '@dnd-booker/shared';
import type { ProjectDocument } from '@dnd-booker/shared';

const KIND_LABELS: Record<DocumentKind, string> = {
  front_matter: 'Front Matter',
  chapter: 'Chapters',
  appendix: 'Appendices',
  back_matter: 'Back Matter',
};

const KIND_ORDER: DocumentKind[] = ['front_matter', 'chapter', 'appendix', 'back_matter'];

interface Props {
  projectId: string;
}

export function DocumentNavigator({ projectId }: Props) {
  const {
    documents,
    activeDocument,
    isLoadingDocuments,
    loadDocument,
  } = useProjectStore();

  useEffect(() => {
    if (documents.length === 0) return;
    if (activeDocument && documents.some((doc) => doc.id === activeDocument.id)) return;
    void loadDocument(projectId, documents[0].id);
  }, [projectId, documents, activeDocument, loadDocument]);

  if (isLoadingDocuments && documents.length === 0) {
    return (
      <div className="w-56 border-r border-gray-200 bg-white p-3">
        <div className="text-xs text-gray-400">Loading documents...</div>
      </div>
    );
  }

  if (documents.length === 0) return null;

  // Group by kind
  const grouped = documents.reduce<Record<string, ProjectDocument[]>>((acc, doc) => {
    if (!acc[doc.kind]) acc[doc.kind] = [];
    acc[doc.kind].push(doc);
    return acc;
  }, {});

  return (
    <div className="w-56 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Documents
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {KIND_ORDER.map((kind) => {
          const docs = grouped[kind];
          if (!docs?.length) return null;
          return (
            <div key={kind} className="mb-1">
              <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                {KIND_LABELS[kind]}
              </div>
              {docs.map((doc) => {
                const isActive = activeDocument?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => loadDocument(projectId, doc.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
                      isActive
                        ? 'bg-purple-50 text-purple-700 font-medium border-r-2 border-purple-500'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                    title={doc.title}
                  >
                    {doc.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
