import { useCallback, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import api from '../../lib/api';

interface ImageUploaderProps {
  projectId: string;
  onUpload: (url: string) => void;
  className?: string;
}

export function ImageUploader({ projectId, onUpload, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const { data } = await api.post(
          `/v1/projects/${projectId}/assets`,
          formData,
          {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              if (e.total) {
                setProgress(Math.round((e.loaded * 100) / e.total));
              }
            },
          }
        );
        setProgress(null);
        onUpload(data.url);
      } catch (err) {
        setProgress(null);
        const message = err instanceof AxiosError
          ? err.response?.data?.error
          : null;
        setError(message || 'Upload failed. Please try again.');
      }
    },
    [projectId, onUpload]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed.');
        return;
      }
      uploadFile(file);
    },
    [uploadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // Reset the input so the same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  return (
    <div
      className={`relative rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
        isDragging
          ? 'border-purple-500 bg-purple-50'
          : 'border-gray-300 hover:border-gray-400'
      } ${className ?? ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />

      {progress !== null ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Uploading...</p>
          <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-purple-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">{progress}%</p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600">
            Drop an image here or click to browse
          </p>
          <p className="mt-1 text-xs text-gray-400">
            JPEG, PNG, GIF, or WebP up to 10 MB
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
