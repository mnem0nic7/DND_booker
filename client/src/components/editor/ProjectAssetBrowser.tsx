import { useEffect, useState } from 'react';
import type { Asset } from '@dnd-booker/shared';
import api from '../../lib/api';

interface ProjectAssetBrowserProps {
  projectId: string;
  selectedUrl?: string;
  onSelect: (url: string) => void;
}

export function ProjectAssetBrowser({
  projectId,
  selectedUrl,
  onSelect,
}: ProjectAssetBrowserProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadAssets() {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Asset[]>(`/v1/projects/${projectId}/assets`);
      setAssets(data);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'Failed to load assets.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(assetId: string) {
    try {
      await api.delete(`/v1/assets/${assetId}`);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'Failed to delete asset.');
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    void loadAssets();
  }, [isOpen, projectId]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="ai-generate-btn"
        title="Browse existing project assets"
      >
        Use Existing Asset
      </button>
    );
  }

  return (
    <div className="ai-generate-panel">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-medium text-gray-700">Project Assets</div>
          <div className="text-[11px] text-gray-500">Reuse artwork already uploaded or generated in this project.</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAssets()}
            className="ai-generate-cancel"
            disabled={isLoading}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setError(null);
            }}
            className="ai-generate-cancel"
          >
            Close
          </button>
        </div>
      </div>

      {error && <p className="ai-generate-error">{error}</p>}

      {isLoading ? (
        <p className="text-xs text-gray-500">Loading assets...</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-gray-500">No project assets yet. Upload or generate one first.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {assets.map((asset) => {
            const isSelected = asset.url === selectedUrl;
            return (
              <div
                key={asset.id}
                className={`rounded-lg border p-2 transition-colors ${
                  isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(asset.url)}
                  className="w-full text-left"
                >
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-gray-100 mb-2">
                    <img
                      src={asset.url}
                      alt={asset.filename}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-[11px] font-medium text-gray-700 truncate">{asset.filename}</div>
                  <div className="text-[10px] text-gray-400">
                    {Math.max(1, Math.round(asset.sizeBytes / 1024))} KB
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelect(asset.url)}
                    className="text-[11px] px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                  >
                    Select
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(asset.id)}
                    className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
