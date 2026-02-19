'use client';

import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';

export function EditorTopbar() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const processingStatus = useProjectStore((s) => s.processingStatus);
  const resetProject = useProjectStore((s) => s.resetProject);

  const handleBack = () => {
    resetProject();
    router.push('/');
  };

  return (
    <header className="h-12 flex items-center justify-between px-3 md:px-4 border-b border-tuft-border bg-tuft-surface shrink-0">
      {/* Left: back + title */}
      <div className="flex items-center gap-2 md:gap-3">
        <button
          onClick={handleBack}
          className="tuft-btn-ghost text-xs px-2 py-1"
        >
          ←
        </button>
        <span className="font-mono text-xs tracking-wider text-tuft-text-muted uppercase hidden sm:inline">
          Tuft Studio
        </span>
      </div>

      {/* Center: rug dimensions */}
      {project && (
        <div className="font-mono text-xs text-tuft-text-dim">
          {project.width} × {project.height} {project.unit}
        </div>
      )}

      {/* Right: status + actions */}
      <div className="flex items-center gap-2 md:gap-3">
        {processingStatus === 'processing' && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-tuft-accent animate-pulse-slow" />
            <span className="font-mono text-xs text-tuft-text-muted hidden sm:inline">
              Processing…
            </span>
          </div>
        )}

        <button
          className="tuft-btn-ghost text-xs px-2 md:px-3 py-1.5"
          disabled={!project?.processedImage}
          onClick={() => {
            if (project?.processedImage) {
              router.push('/projection');
            }
          }}
        >
          Projection
        </button>
      </div>
    </header>
  );
}
