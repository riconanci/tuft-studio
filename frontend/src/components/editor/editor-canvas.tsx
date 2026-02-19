'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/project-store';

export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((s) => s.project);
  const processingStatus = useProjectStore((s) => s.processingStatus);
  const hiddenColorIds = useProjectStore((s) => s.hiddenColorIds);
  const showOutline = useProjectStore((s) => s.showOutline);
  const toggleOutline = useProjectStore((s) => s.toggleOutline);
  const outlineWidth = useProjectStore((s) => s.outlineWidth);
  const setOutlineWidth = useProjectStore((s) => s.setOutlineWidth);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [showRaw, setShowRaw] = useState(false);

  // Outline image cache — keyed on actual SVG content hash + width
  const outlineImgRef = useRef<HTMLImageElement | null>(null);
  // Counter to force re-render when outline image finishes loading
  const [outlineReady, setOutlineReady] = useState(0);

  const hasProcessed = !!project?.processedImage;
  const hasOutline = !!project?.outlineSvg;

  // Track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build outline image when SVG or line width changes
  useEffect(() => {
    if (!project?.outlineSvg) {
      outlineImgRef.current = null;
      return;
    }

    // Replace stroke-width in the SVG
    const modifiedSvg = project.outlineSvg.replace(
      /stroke-width="[^"]*"/,
      `stroke-width="${outlineWidth}"`
    );

    const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      outlineImgRef.current = img;
      URL.revokeObjectURL(url);
      // Bump counter to trigger canvas re-render
      setOutlineReady((n) => n + 1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [project?.outlineSvg, outlineWidth]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageSource = showRaw
      ? project.originalImage
      : (project.processedImage || project.originalImage);
    if (!imageSource) return;

    const img = new Image();
    img.onload = () => {
      const padding = 32;
      const availW = containerSize.w - padding * 2;
      const availH = containerSize.h - padding * 2;

      if (availW <= 0 || availH <= 0) return;

      const scale = Math.min(availW / img.width, availH / img.height, 1);
      const drawW = img.width * scale;
      const drawH = img.height * scale;

      canvas.width = containerSize.w;
      canvas.height = containerSize.h;

      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const offX = (containerSize.w - drawW) / 2;
      const offY = (containerSize.h - drawH) / 2;

      drawCheckerboard(ctx, offX, offY, drawW, drawH);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, offX, offY, drawW, drawH);

      // Hide colors
      if (!showRaw && hiddenColorIds.size > 0 && project.processedImage && project.palette.length > 0) {
        const hiddenRgbs = project.palette
          .filter((c) => hiddenColorIds.has(c.id))
          .map((c) => c.rgb);

        if (hiddenRgbs.length > 0) {
          const imageData = ctx.getImageData(offX, offY, drawW, drawH);
          const data = imageData.data;
          const tol = 12;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            for (const [hr, hg, hb] of hiddenRgbs) {
              if (
                Math.abs(r - hr) <= tol &&
                Math.abs(g - hg) <= tol &&
                Math.abs(b - hb) <= tol
              ) {
                data[i + 3] = 0;
                break;
              }
            }
          }
          ctx.putImageData(imageData, offX, offY);
        }
      }

      // Draw outline overlay
      if (!showRaw && showOutline && outlineImgRef.current) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(outlineImgRef.current, offX, offY, drawW, drawH);
      }

      ctx.strokeStyle = '#2A2A2A';
      ctx.lineWidth = 1;
      ctx.strokeRect(offX - 0.5, offY - 0.5, drawW + 1, drawH + 1);
    };
    img.src = imageSource;
  }, [project, containerSize, hiddenColorIds, showRaw, showOutline, outlineReady]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Top-left controls */}
      {hasProcessed && (
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {/* Row 1: Pattern/Original + Outline toggle */}
          <div className="flex gap-2">
            {/* Raw / Post toggle */}
            <div className="flex bg-tuft-surface/90 border border-tuft-border rounded-lg overflow-hidden backdrop-blur-sm">
              <button
                onClick={() => setShowRaw(false)}
                className={`
                  px-3 py-1.5 text-xs font-mono transition-colors
                  ${!showRaw
                    ? 'bg-tuft-accent text-tuft-bg'
                    : 'text-tuft-text-dim hover:text-tuft-text'
                  }
                `}
              >
                Pattern
              </button>
              <button
                onClick={() => setShowRaw(true)}
                className={`
                  px-3 py-1.5 text-xs font-mono transition-colors
                  ${showRaw
                    ? 'bg-tuft-accent text-tuft-bg'
                    : 'text-tuft-text-dim hover:text-tuft-text'
                  }
                `}
              >
                Original
              </button>
            </div>

            {/* Outline toggle */}
            {hasOutline && !showRaw && (
              <button
                onClick={toggleOutline}
                className={`
                  px-3 py-1.5 text-xs font-mono rounded-lg border backdrop-blur-sm transition-colors
                  ${showOutline
                    ? 'bg-tuft-accent text-tuft-bg border-tuft-accent'
                    : 'bg-tuft-surface/90 text-tuft-text-dim hover:text-tuft-text border-tuft-border'
                  }
                `}
              >
                Outline
              </button>
            )}
          </div>

          {/* Row 2: Outline width slider (only when outline is on) */}
          {hasOutline && !showRaw && showOutline && (
            <div className="flex items-center gap-2 bg-tuft-surface/90 border border-tuft-border rounded-lg backdrop-blur-sm px-3 py-1.5">
              <span className="text-2xs font-mono text-tuft-text-dim shrink-0">Thin</span>
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.5}
                value={outlineWidth}
                onChange={(e) => setOutlineWidth(Number(e.target.value))}
                className="tuft-slider w-24"
              />
              <span className="text-2xs font-mono text-tuft-text-dim shrink-0">Thick</span>
            </div>
          )}
        </div>
      )}

      {/* Processing overlay */}
      {processingStatus === 'processing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-tuft-bg/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-tuft-accent border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-xs text-tuft-text-muted">
              Processing pattern…
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {processingStatus === 'idle' && !project?.processedImage && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <p className="font-mono text-xs text-tuft-text-dim bg-tuft-surface/80 px-3 py-1.5 rounded border border-tuft-border">
            Configure settings → Apply to generate pattern
          </p>
        </div>
      )}
    </div>
  );
}

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const size = 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  for (let row = 0; row < Math.ceil(h / size); row++) {
    for (let col = 0; col < Math.ceil(w / size); col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#1a1a1a' : '#141414';
      ctx.fillRect(x + col * size, y + row * size, size, size);
    }
  }
  ctx.restore();
}
