'use client';

import { useProjectStore } from '@/stores/project-store';

export function ExportPanel() {
  const project = useProjectStore((s) => s.project);

  if (!project) return null;

  const hasResult = !!project.processedImage;
  const hasOutline = !!project.outlineSvg;

  const handleDownloadPNG = () => {
    if (!project.processedImage) return;

    const link = document.createElement('a');
    link.download = `tuft-pattern-${project.width}x${project.height}${project.unit}.png`;
    link.href = project.processedImage;
    link.click();
  };

  const handleDownloadSVG = () => {
    if (!project.outlineSvg) return;

    const blob = new Blob([project.outlineSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `tuft-outline-${project.width}x${project.height}${project.unit}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {!hasResult ? (
        <div className="text-center py-8">
          <p className="text-xs font-mono text-tuft-text-dim">
            Apply settings to enable exports
          </p>
        </div>
      ) : (
        <>
          {/* PNG export */}
          <ExportOption
            label="Pattern PNG"
            description="High-resolution color map"
            onClick={handleDownloadPNG}
          />

          {/* SVG outline export */}
          <ExportOption
            label="Outline SVG"
            description="Vector outlines for tracing & projection"
            onClick={handleDownloadSVG}
            disabled={!hasOutline}
          />

          {/* Future exports */}
          <ExportOption
            label="Grid PDF"
            description="Printable tiled grid with legend"
            disabled
          />

          <div className="pt-2 border-t border-tuft-border">
            <p className="text-2xs font-mono text-tuft-text-dim">
              PDF export coming in a future update.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ExportOption({
  label,
  description,
  onClick,
  disabled = false,
}: {
  label: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full text-left p-3 rounded border transition-all
        ${
          disabled
            ? 'border-tuft-border/50 opacity-40 cursor-not-allowed'
            : 'border-tuft-border hover:border-tuft-border-active hover:bg-tuft-surface-raised'
        }
      `}
    >
      <span className="block font-mono text-xs text-tuft-text">{label}</span>
      <span className="block text-2xs text-tuft-text-dim mt-0.5">
        {description}
      </span>
    </button>
  );
}
