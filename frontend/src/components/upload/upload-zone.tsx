'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import { fileToBase64, isValidImageFile, isValidFileSize } from '@/lib/image-utils';

export function UploadZone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initProject = useProjectStore((s) => s.initProject);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!isValidImageFile(file)) {
        setError('Unsupported format. Use JPG, PNG, or WebP.');
        return;
      }

      if (!isValidFileSize(file)) {
        setError('File too large. Max 20MB.');
        return;
      }

      try {
        const base64 = await fileToBase64(file);
        initProject(base64);
        router.push('/editor');
      } catch {
        setError('Failed to read image.');
      }
    },
    [initProject, router]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onClick = () => inputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      className={`
        relative w-full max-w-lg aspect-[4/3] rounded-lg cursor-pointer
        border-2 border-dashed transition-all duration-200
        flex flex-col items-center justify-center gap-4
        ${
          isDragging
            ? 'border-tuft-accent bg-tuft-accent/5 scale-[1.02]'
            : 'border-tuft-border hover:border-tuft-border-active hover:bg-tuft-surface/50'
        }
      `}
    >
      {/* Icon */}
      <div
        className={`
          w-12 h-12 rounded-lg border transition-colors duration-200
          flex items-center justify-center
          ${isDragging ? 'border-tuft-accent text-tuft-accent' : 'border-tuft-border text-tuft-text-dim'}
        `}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <div className="text-center">
        <p className="text-sm text-tuft-text-muted">
          {isDragging ? 'Drop image' : 'Drop image or click to upload'}
        </p>
      </div>

      {error && (
        <p className="text-xs text-tuft-danger font-mono">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  );
}
