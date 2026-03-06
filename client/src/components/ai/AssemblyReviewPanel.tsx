import { useEffect } from 'react';
import { useGenerationStore } from '../../stores/generationStore';

const KIND_STYLES: Record<string, { label: string; color: string }> = {
  front_matter: { label: 'Front Matter', color: 'bg-blue-100 text-blue-700' },
  chapter: { label: 'Chapter', color: 'bg-purple-100 text-purple-700' },
  appendix: { label: 'Appendix', color: 'bg-green-100 text-green-700' },
  back_matter: { label: 'Back Matter', color: 'bg-gray-100 text-gray-600' },
};

interface Props {
  projectId: string;
  runId: string;
}

export function AssemblyReviewPanel({ projectId, runId }: Props) {
  const { assemblyManifest, isLoadingAssembly, fetchAssemblyManifest } = useGenerationStore();

  useEffect(() => {
    fetchAssemblyManifest(projectId, runId);
  }, [projectId, runId, fetchAssemblyManifest]);

  if (isLoadingAssembly) {
    return <div className="text-sm text-gray-500 p-3">Loading assembly manifest...</div>;
  }

  if (!assemblyManifest) {
    return (
      <div className="text-sm text-gray-500 p-3">
        No assembly manifest yet. Assembly happens after all artifacts are accepted.
      </div>
    );
  }

  const docs = [...assemblyManifest.documents].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalPages = docs.reduce((sum, d) => sum + (d.targetPageCount ?? 0), 0);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Assembly Manifest</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>v{assemblyManifest.version}</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] ${
              assemblyManifest.status === 'assembled'
                ? 'bg-green-100 text-green-700'
                : assemblyManifest.status === 'accepted'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {assemblyManifest.status}
          </span>
        </div>
      </div>

      {/* Page budget summary */}
      {totalPages > 0 && (
        <div className="text-xs text-gray-500 mb-3">
          {docs.length} documents, ~{totalPages} pages estimated
        </div>
      )}

      {/* Document list */}
      <div className="space-y-1.5">
        {docs.map((doc) => {
          const kindStyle = KIND_STYLES[doc.kind] ?? KIND_STYLES.chapter;
          return (
            <div
              key={doc.documentSlug}
              className="flex items-center justify-between px-2.5 py-2 border border-gray-200 rounded-lg"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${kindStyle.color}`}>
                    {kindStyle.label}
                  </span>
                  <span className="text-xs font-medium text-gray-700 truncate">{doc.title}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {doc.artifactKeys.length} artifact{doc.artifactKeys.length !== 1 ? 's' : ''}
                  {doc.targetPageCount ? ` · ~${doc.targetPageCount}pp` : ''}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0 ml-2">#{doc.sortOrder}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
