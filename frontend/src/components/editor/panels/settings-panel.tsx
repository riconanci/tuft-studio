'use client';

import { useProjectStore } from '@/stores/project-store';
import { api } from '@/lib/api';
import { stripDataUrlPrefix } from '@/lib/image-utils';

const PALETTE_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16];

export function SettingsPanel() {
  const project = useProjectStore((s) => s.project);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const setProcessedResult = useProjectStore((s) => s.setProcessedResult);
  const setProcessingStatus = useProjectStore((s) => s.setProcessingStatus);
  const processingStatus = useProjectStore((s) => s.processingStatus);

  if (!project) return null;

  const handleApply = async () => {
    setProcessingStatus('processing');

    try {
      const result = await api.processImage({
        image: stripDataUrlPrefix(project.originalImage),
        width: project.width,
        height: project.height,
        unit: project.unit,
        paletteSize: project.paletteSize,
        minThickness: project.minThickness,
        regionThreshold: project.regionThreshold,
        useYarnPalette: project.useYarnPalette,
      });

      setProcessedResult({
        processedImage: `data:image/png;base64,${result.processedImage}`,
        palette: result.palette,
        layers: result.layers,
        yarnEstimates: result.yarnEstimates,
        outlineSvg: result.outlineSvg,
      });
    } catch (err: any) {
      setProcessingStatus('error', err.message || 'Processing failed');
    }
  };

  const isProcessing = processingStatus === 'processing';

  return (
    <div className="space-y-5">
      {/* Rug Dimensions */}
      <Section title="Rug Size">
        <div className="flex gap-2 items-end">
          <Field label="Width">
            <input
              type="number"
              value={project.width}
              onChange={(e) => updateSettings({ width: Number(e.target.value) })}
              min={1}
              max={240}
              className="tuft-input w-full"
            />
          </Field>
          <span className="text-tuft-text-dim text-sm pb-2">×</span>
          <Field label="Height">
            <input
              type="number"
              value={project.height}
              onChange={(e) => updateSettings({ height: Number(e.target.value) })}
              min={1}
              max={240}
              className="tuft-input w-full"
            />
          </Field>
          <Field label="Unit">
            <select
              value={project.unit}
              onChange={(e) =>
                updateSettings({ unit: e.target.value as 'in' | 'cm' })
              }
              className="tuft-input w-full"
            >
              <option value="in">in</option>
              <option value="cm">cm</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Yarn Palette Mode */}
      <Section title="Color Mode">
        <button
          onClick={() => updateSettings({ useYarnPalette: !project.useYarnPalette })}
          className={`
            w-full flex items-center gap-3 p-3 rounded border transition-all
            ${project.useYarnPalette
              ? 'border-tuft-accent/40 bg-tuft-accent/5'
              : 'border-tuft-border hover:border-tuft-border-active'
            }
          `}
        >
          {/* Checkbox */}
          <div
            className={`
              w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
              ${project.useYarnPalette
                ? 'border-tuft-accent bg-tuft-accent'
                : 'border-tuft-border-active'
              }
            `}
          >
            {project.useYarnPalette && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4.5 7.5L8 3" stroke="#0A0A0A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div className="text-left">
            <span className="block text-xs text-tuft-text font-mono">
              Yarn Palette
            </span>
            <span className="block text-2xs text-tuft-text-dim mt-0.5">
              {project.useYarnPalette
                ? 'Snapped to ~55 real yarn colors'
                : 'Free range — any colors allowed'
              }
            </span>
          </div>
        </button>
      </Section>

      {/* Palette Size */}
      <Section title="Colors">
        <div className="grid grid-cols-5 gap-1.5">
          {PALETTE_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => updateSettings({ paletteSize: n })}
              className={`
                py-2 text-xs font-mono rounded transition-all
                ${
                  project.paletteSize === n
                    ? 'bg-tuft-accent text-tuft-bg'
                    : 'bg-tuft-bg text-tuft-text-muted hover:text-tuft-text border border-tuft-border'
                }
              `}
            >
              {n}
            </button>
          ))}
        </div>
      </Section>

      {/* Minimum Feature Size */}
      <Section title="Min Feature Size">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={15}
            step={0.5}
            value={project.minThickness}
            onChange={(e) =>
              updateSettings({ minThickness: Number(e.target.value) })
            }
            className="tuft-slider flex-1"
          />
          <span className="font-mono text-xs text-tuft-text-muted w-10 text-right">
            {project.minThickness}mm
          </span>
        </div>
        <p className="text-2xs text-tuft-text-dim mt-1 font-mono">
          Removes lines thinner than this on the physical rug
        </p>
      </Section>

      {/* Cleanup Threshold */}
      <Section title="Cleanup Threshold">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0.0001}
            max={0.02}
            step={0.0001}
            value={project.regionThreshold}
            onChange={(e) =>
              updateSettings({ regionThreshold: Number(e.target.value) })
            }
            className="tuft-slider flex-1"
          />
          <span className="font-mono text-xs text-tuft-text-muted w-14 text-right">
            {project.regionThreshold < 0.001
              ? `${(project.regionThreshold * 100).toFixed(2)}%`
              : `${(project.regionThreshold * 100).toFixed(1)}%`
            }
          </span>
        </div>
      </Section>

      {/* Apply button */}
      <button
        onClick={handleApply}
        disabled={isProcessing}
        className={`
          tuft-btn-primary w-full py-3 font-mono text-sm tracking-wide
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {isProcessing ? 'Processing…' : 'Apply'}
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="tuft-label block mb-2">{title}</label>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1">
      <span className="block text-2xs text-tuft-text-dim mb-1 font-mono">
        {label}
      </span>
      {children}
    </div>
  );
}
