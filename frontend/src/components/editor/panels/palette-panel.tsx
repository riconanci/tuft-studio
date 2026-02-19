'use client';

import { useState, useRef } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { YarnColorPicker } from '../yarn-color-picker';

export function PalettePanel() {
  const project = useProjectStore((s) => s.project);
  const hiddenColorIds = useProjectStore((s) => s.hiddenColorIds);
  const toggleColorVisibility = useProjectStore((s) => s.toggleColorVisibility);
  const swapColor = useProjectStore((s) => s.swapColor);

  const [pickerColorId, setPickerColorId] = useState<string | null>(null);

  if (!project) return null;

  const { palette, yarnEstimates } = project;

  if (palette.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs font-mono text-tuft-text-dim">
          Apply settings to extract palette
        </p>
      </div>
    );
  }

  const handleSwatchClick = (colorId: string) => {
    setPickerColorId(pickerColorId === colorId ? null : colorId);
  };

  const handleColorSelect = (colorId: string, hex: string, name?: string) => {
    swapColor(colorId, hex, name);
    setPickerColorId(null);
  };

  return (
    <div className="space-y-1">
      {palette.map((color) => {
        const estimate = yarnEstimates.find((y) => y.colorId === color.id);
        const isHidden = hiddenColorIds.has(color.id);
        const isPickerOpen = pickerColorId === color.id;

        return (
          <div
            key={color.id}
            className={`
              relative flex items-center gap-2.5 p-2 rounded transition-colors
              ${isHidden ? 'opacity-40' : ''}
              ${isPickerOpen ? 'bg-tuft-surface-raised' : 'hover:bg-tuft-surface-raised'}
            `}
          >
            {/* Visibility toggle */}
            <button
              onClick={() => toggleColorVisibility(color.id)}
              className={`
                w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors
                ${isHidden
                  ? 'border-tuft-border text-tuft-text-dim'
                  : 'border-tuft-border-active text-tuft-text'
                }
              `}
              title={isHidden ? 'Show color' : 'Hide color'}
            >
              {isHidden ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>

            {/* Color swatch — clickable */}
            <button
              onClick={() => handleSwatchClick(color.id)}
              className={`
                w-8 h-8 rounded border shrink-0 transition-all cursor-pointer
                ${isPickerOpen
                  ? 'border-tuft-accent ring-1 ring-tuft-accent/30 scale-110'
                  : 'border-tuft-border hover:border-tuft-border-active hover:scale-105'
                }
              `}
              style={{ backgroundColor: color.hex }}
              title="Change color"
            />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs text-tuft-text truncate">
                  {color.name || color.hex}
                </span>
                <span className="font-mono text-2xs text-tuft-text-muted ml-2 shrink-0">
                  {estimate
                    ? `${estimate.percentCoverage.toFixed(1)}%`
                    : '—'}
                </span>
              </div>

              {color.name && (
                <span className="font-mono text-2xs text-tuft-text-dim">
                  {color.hex}
                </span>
              )}

              {estimate && (
                <div className="mt-1 h-1 bg-tuft-bg rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${isHidden ? 0 : Math.min(estimate.percentCoverage, 100)}%`,
                      backgroundColor: color.hex,
                    }}
                  />
                </div>
              )}

              {estimate && (
                <span className={`font-mono text-2xs mt-0.5 block ${isHidden ? 'text-tuft-text-dim line-through' : 'text-tuft-text-dim'}`}>
                  {isHidden ? '—' : `~${Math.round(estimate.estimatedYards)} yds`}
                </span>
              )}
            </div>

            {/* Color picker popup */}
            {isPickerOpen && (
              project.useYarnPalette ? (
                <YarnColorPicker
                  currentHex={color.hex}
                  onSelect={(hex, name) => handleColorSelect(color.id, hex, name)}
                  onClose={() => setPickerColorId(null)}
                />
              ) : (
                <FreeColorPicker
                  currentHex={color.hex}
                  onSelect={(hex) => handleColorSelect(color.id, hex)}
                  onClose={() => setPickerColorId(null)}
                />
              )
            )}
          </div>
        );
      })}

      {/* Total yarn */}
      {yarnEstimates.length > 0 && (
        <div className="pt-3 mt-3 border-t border-tuft-border space-y-1.5">
          <div className="flex justify-between font-mono text-xs">
            <span className="text-tuft-text-muted">
              Total yarn
              {hiddenColorIds.size > 0 && (
                <span className="text-tuft-text-dim"> ({palette.length - hiddenColorIds.size} of {palette.length} colors)</span>
              )}
            </span>
            <span className="text-tuft-text">
              ~
              {Math.round(
                yarnEstimates
                  .filter((y) => !hiddenColorIds.has(y.colorId))
                  .reduce((sum, y) => sum + y.estimatedYards, 0)
              )}{' '}
              yds
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Free-mode color picker — uses native HTML color input
 */
function FreeColorPicker({
  currentHex,
  onSelect,
  onClose,
}: {
  currentHex: string;
  onSelect: (hex: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState(currentHex);

  return (
    <div
      ref={ref}
      className="absolute z-50 right-0 top-full mt-1 bg-tuft-surface border border-tuft-border rounded-lg shadow-xl p-3 w-48"
    >
      <div className="flex flex-col gap-2">
        {/* Native color picker */}
        <input
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          className="w-full h-20 rounded cursor-pointer border border-tuft-border bg-transparent"
        />

        {/* Hex input */}
        <input
          type="text"
          value={hex}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setHex(v);
          }}
          className="tuft-input w-full text-xs font-mono text-center"
          maxLength={7}
        />

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 tuft-btn-ghost text-xs py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                onSelect(hex);
              }
            }}
            className="flex-1 tuft-btn-primary text-xs py-1.5"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
