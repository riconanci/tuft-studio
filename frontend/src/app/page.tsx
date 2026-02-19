'use client';

import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import { UploadZone } from '@/components/upload/upload-zone';

export default function HomePage() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const resetProject = useProjectStore((s) => s.resetProject);

  const hasProject = !!project?.originalImage;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="font-mono text-sm font-semibold tracking-[0.3em] uppercase text-tuft-text-muted mb-2">
          Tuft Studio
        </h1>
        <p className="text-tuft-text-dim text-sm font-mono">
          Image → Rug Pattern
        </p>
      </div>

      {/* Resume previous project */}
      {hasProject && (
        <div className="mb-6 w-full max-w-md">
          <button
            onClick={() => router.push('/editor')}
            className="w-full p-4 rounded border border-tuft-accent/30 bg-tuft-accent/5 hover:bg-tuft-accent/10 transition-colors group"
          >
            <span className="block text-xs font-mono text-tuft-accent mb-1">
              Resume previous project
            </span>
            <span className="block text-2xs font-mono text-tuft-text-dim">
              {project!.width} × {project!.height} {project!.unit}
              {project!.processedImage ? ' · Processed' : ' · Not yet processed'}
            </span>
          </button>
          <button
            onClick={resetProject}
            className="w-full mt-1.5 text-2xs font-mono text-tuft-text-dim hover:text-tuft-text-muted transition-colors"
          >
            Discard and start fresh
          </button>
        </div>
      )}

      {/* Upload area */}
      <UploadZone />

      {/* Footer hint */}
      <p className="mt-8 text-2xs font-mono text-tuft-text-dim">
        JPG · PNG · WebP &nbsp;·&nbsp; Max 20MB
      </p>
    </div>
  );
}
