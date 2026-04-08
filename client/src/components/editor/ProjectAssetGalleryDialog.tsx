import { useEffect, useMemo, useState } from 'react';
import type { Asset } from '@dnd-booker/shared';
import api from '../../lib/api';
import { ImageUploader } from './ImageUploader';

interface ProjectAssetGalleryDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectAssetGalleryDialog({
  projectId,
  isOpen,
  onClose,
}: ProjectAssetGalleryDialogProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null,
    [assets, selectedAssetId],
  );

  async function loadAssets(preferredAssetUrl?: string) {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Asset[]>(`/v1/projects/${projectId}/assets`);
      setAssets(data);
      if (preferredAssetUrl) {
        const matchingAsset = data.find((asset) => asset.url === preferredAssetUrl);
        setSelectedAssetId(matchingAsset?.id ?? data[0]?.id ?? null);
      } else {
        setSelectedAssetId((current) => current && data.some((asset) => asset.id === current)
          ? current
          : data[0]?.id ?? null);
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'Failed to load project images.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(assetId: string) {
    try {
      await api.delete(`/v1/assets/${assetId}`);
      setAssets((current) => current.filter((asset) => asset.id !== assetId));
      setSelectedAssetId((current) => (current === assetId ? null : current));
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setError(message || 'Failed to delete image.');
    }
  }

  async function handleCopyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      window.setTimeout(() => {
        setCopiedUrl((current) => (current === url ? null : current));
      }, 2000);
    } catch {
      window.prompt('Copy image URL:', url);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    void loadAssets();
  }, [isOpen, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 flex h-[82vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex w-[380px] min-w-[340px] flex-col border-r border-slate-200 bg-slate-50/80">
          <div className="border-b border-slate-200 bg-white px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Project Images</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Asset Gallery</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Review every uploaded or AI-generated image attached to this project.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-700"
                aria-label="Close image gallery"
                title="Close image gallery"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <ImageUploader
                projectId={projectId}
                onUpload={(url) => {
                  void loadAssets(url);
                }}
                className="bg-white"
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>{assets.length} image{assets.length === 1 ? '' : 's'}</span>
              <button
                type="button"
                onClick={() => void loadAssets()}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {error && (
              <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
                Loading project images...
              </div>
            ) : assets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
                <p className="font-medium text-slate-700">No project images yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Upload artwork here or use AI image generation inside a block to populate the gallery.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {assets.map((asset) => {
                  const isSelected = selectedAsset?.id === asset.id;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`overflow-hidden rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'border-slate-900 bg-white shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                        <img
                          src={asset.url}
                          alt={asset.filename}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="px-3 py-2">
                        <div className="truncate text-xs font-semibold text-slate-800">{asset.filename}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{formatBytes(asset.sizeBytes)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-white">
          {selectedAsset ? (
            <>
              <div className="border-b border-slate-200 px-8 py-6">
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Selected Image</p>
                    <h3 className="mt-1 truncate text-2xl font-semibold text-slate-900">{selectedAsset.filename}</h3>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{formatBytes(selectedAsset.sizeBytes)}</span>
                      <span>{selectedAsset.mimeType}</span>
                      <span>{formatDate(selectedAsset.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={selectedAsset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(selectedAsset.url)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                      {copiedUrl === selectedAsset.url ? 'Copied URL' : 'Copy URL'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(selectedAsset.id)}
                      className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 transition-colors hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-8">
                <div className="flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef2ff_55%,_#e2e8f0)] p-6">
                  <img
                    src={selectedAsset.url}
                    alt={selectedAsset.filename}
                    className="max-h-full max-w-full rounded-2xl border border-white/70 bg-white object-contain shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              Select an image from the gallery to preview it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
