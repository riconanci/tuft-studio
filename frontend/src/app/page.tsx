'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';
import { UploadZone } from '@/components/upload/upload-zone';

export default function HomePage() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const resetProject = useProjectStore((s) => s.resetProject);
  const [showHelp, setShowHelp] = useState(false);

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

      {/* Footer */}
      <div className="mt-8 flex items-center gap-4">
        <p className="text-2xs font-mono text-tuft-text-dim">
          JPG · PNG · WebP &nbsp;·&nbsp; Max 20MB
        </p>
        <button
          onClick={() => setShowHelp(true)}
          className="text-2xs font-mono text-tuft-text-dim hover:text-tuft-accent transition-colors border border-tuft-border hover:border-tuft-accent/40 rounded-full w-5 h-5 flex items-center justify-center"
        >
          ?
        </button>
      </div>

      {/* Help modal */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-tuft-surface border border-tuft-border rounded-lg w-full max-w-lg max-h-[80dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-tuft-border sticky top-0 bg-tuft-surface rounded-t-lg">
          <h2 className="font-mono text-sm text-tuft-text tracking-wide">How It Works</h2>
          <button
            onClick={onClose}
            className="text-tuft-text-dim hover:text-tuft-text text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 text-sm text-tuft-text-muted font-mono leading-relaxed">
          <HelpSection title="1. Upload Your Image">
            Upload a JPG, PNG, or WebP image. Best results come from images with bold shapes,
            flat colors, and clear contrast between the subject and background. Think logos,
            cartoon characters, pop art, or simple illustrations.
          </HelpSection>

          <HelpSection title="2. Configure Settings">
            Set your rug dimensions (width × height in inches or cm).
            Choose how many colors (4–16) — the app will suggest an optimal count.
            Yarn Palette mode snaps colors to ~55 real tufting yarn colors.
            Toggle Isolate Subject to remove busy backgrounds.
          </HelpSection>

          <HelpSection title="3. Preview & Apply">
            A low-res preview updates automatically as you adjust settings.
            When you're happy with the preview, hit Apply to run the full pipeline —
            this generates the high-quality pattern with edge smoothing, small region cleanup,
            and minimum feature thickness enforcement.
          </HelpSection>

          <HelpSection title="4. Fine-Tune Colors">
            In the Palette tab, click any color swatch to swap it.
            Use the eye icon to hide colors and see what the rug looks like without them.
            Hidden colors are replaced with your background fill color.
          </HelpSection>

          <HelpSection title="5. Export & Project">
            Download the pattern as PNG or the outlines as SVG for tracing.
            Use Projection Mode to display the pattern fullscreen on a projector —
            it supports mirroring (for front-projection), solo color cycling,
            alignment guides, and a grid overlay based on your rug dimensions.
          </HelpSection>

          <HelpSection title="Projection Mode Controls">
            View modes: Pattern, Outline, or Both.
            Toggle outline color between white and black.
            Solo mode cycles through colors one at a time, dimming others.
            Grid overlay shows 1–4 inch increments.
            Keyboard: H hide controls, M mirror, R raw/pattern, G guides, ←→ solo, ESC exit.
          </HelpSection>

          <HelpSection title="Tips for Best Results">
            Simple images with 6–10 distinct colors work best.
            Avoid photorealistic portraits or busy landscapes.
            If edges look jagged, try increasing Min Feature Size.
            If there are too many tiny speckles, increase Cleanup Threshold.
            Your project auto-saves — refresh the page and resume where you left off.
          </HelpSection>
        </div>
      </div>
    </div>
  );
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs text-tuft-accent mb-1.5">{title}</h3>
      <p className="text-2xs text-tuft-text-dim leading-relaxed">{children}</p>
    </div>
  );
}
