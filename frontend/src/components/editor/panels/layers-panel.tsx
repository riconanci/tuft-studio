'use client';

import { useProjectStore } from '@/stores/project-store';

export function LayersPanel() {
  const project = useProjectStore((s) => s.project);
  const showOutline = useProjectStore((s) => s.showOutline);
  const soloColorId = useProjectStore((s) => s.soloColorId);
  const hiddenColorIds = useProjectStore((s) => s.hiddenColorIds);
  const toggleOutline = useProjectStore((s) => s.toggleOutline);
  const setSoloColor = useProjectStore((s) => s.setSoloColor);
  const toggleColorVisibility = useProjectStore(
    (s) => s.toggleColorVisibility
  );

  if (!project) return null;
  const { palette } = project;

  if (palette.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs font-mono text-tuft-text-dim">
          Apply settings to view layers
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Outline toggle */}
      <div className="flex items-center justify-between p-2 rounded bg-tuft-bg">
        <span className="font-mono text-xs text-tuft-text-muted">
          Outline
        </span>
        <button
          onClick={toggleOutline}
          className={`
            w-8 h-4.5 rounded-full transition-colors relative
            ${showOutline ? 'bg-tuft-accent' : 'bg-tuft-border'}
          `}
        >
          <div
            className={`
              absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm
              ${showOutline ? 'translate-x-4' : 'translate-x-0.5'}
            `}
          />
        </button>
      </div>

      {/* Color layers */}
      <div className="space-y-1">
        {palette.map((color) => {
          const isSolo = soloColorId === color.id;
          const isHidden = hiddenColorIds.has(color.id);

          return (
            <div
              key={color.id}
              className={`
                flex items-center gap-2 p-2 rounded transition-colors
                ${isSolo ? 'bg-tuft-accent/10 border border-tuft-accent/20' : 'hover:bg-tuft-surface-raised'}
              `}
            >
              {/* Visibility toggle */}
              <button
                onClick={() => toggleColorVisibility(color.id)}
                className={`
                  w-4 h-4 rounded border text-[10px] flex items-center justify-center
                  ${isHidden ? 'border-tuft-border text-tuft-text-dim' : 'border-tuft-border-active text-tuft-text'}
                `}
              >
                {isHidden ? '' : '✓'}
              </button>

              {/* Swatch */}
              <div
                className="w-5 h-5 rounded border border-tuft-border"
                style={{ backgroundColor: color.hex }}
              />

              {/* Hex */}
              <span className="font-mono text-xs text-tuft-text-muted flex-1">
                {color.hex}
              </span>

              {/* Solo button */}
              <button
                onClick={() =>
                  setSoloColor(isSolo ? null : color.id)
                }
                className={`
                  font-mono text-2xs px-1.5 py-0.5 rounded transition-colors
                  ${
                    isSolo
                      ? 'bg-tuft-accent text-tuft-bg'
                      : 'text-tuft-text-dim hover:text-tuft-text'
                  }
                `}
              >
                S
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
