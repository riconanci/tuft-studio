'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from '@/stores/project-store';

export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((s) => s.project);
  const processingStatus = useProjectStore((s) => s.processingStatus);
  const processingError = useProjectStore((s) => s.processingError);
  const hiddenColorIds = useProjectStore((s) => s.hiddenColorIds);
  const showOutline = useProjectStore((s) => s.showOutline);
  const toggleOutline = useProjectStore((s) => s.toggleOutline);
  const outlineWidth = useProjectStore((s) => s.outlineWidth);
  const setOutlineWidth = useProjectStore((s) => s.setOutlineWidth);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [showRaw, setShowRaw] = useState(false);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Outline image cache
  const outlineImgRef = useRef<HTMLImageElement | null>(null);
  const [outlineReady, setOutlineReady] = useState(0);

  const hasProcessed = !!project?.processedImage;
  const hasOutline = !!project?.outlineSvg;

  // Reset zoom/pan when image changes
  useEffect(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [project?.processedImage, project?.originalImage]);

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

  // Wheel to zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(Math.max(z * delta, 0.25), 10));
  }, []);

  // Mouse drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setPanX((p) => p + dx);
    setPanY((p) => p + dy);
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Build outline image when SVG or line width changes
  useEffect(() => {
    if (!project?.outlineSvg) {
      outlineImgRef.current = null;
      return;
    }

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

      const baseScale = Math.min(availW / img.width, availH / img.height, 1);
      const scale = baseScale * zoom;
      const drawW = img.width * scale;
      const drawH = img.height * scale;

      canvas.width = containerSize.w;
      canvas.height = containerSize.h;

      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const offX = (containerSize.w - drawW) / 2 + panX;
      const offY = (containerSize.h - drawH) / 2 + panY;

      drawCheckerboard(ctx, offX, offY, drawW, drawH);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, offX, offY, drawW, drawH);

      // Hide colors
      if (!showRaw && hiddenColorIds.size > 0 && project.processedImage && project.palette.length > 0) {
        const hiddenRgbs = project.palette
          .filter((c) => hiddenColorIds.has(c.id))
          .map((c) => c.rgb);

        if (hiddenRgbs.length > 0) {
          // Clamp getImageData to canvas bounds
          const sx = Math.max(0, Math.floor(offX));
          const sy = Math.max(0, Math.floor(offY));
          const ex = Math.min(canvas.width, Math.ceil(offX + drawW));
          const ey = Math.min(canvas.height, Math.ceil(offY + drawH));
          const sw = ex - sx;
          const sh = ey - sy;

          if (sw > 0 && sh > 0) {
            const imageData = ctx.getImageData(sx, sy, sw, sh);
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
            ctx.putImageData(imageData, sx, sy);
          }
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
  }, [project, containerSize, hiddenColorIds, showRaw, showOutline, outlineReady, zoom, panX, panY]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isPanningRef.current ? 'grabbing' : 'grab' }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <span className="font-mono text-2xs text-tuft-text-dim bg-tuft-surface/90 border border-tuft-border rounded px-2 py-1 backdrop-blur-sm">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
            className="font-mono text-2xs text-tuft-text-dim bg-tuft-surface/90 border border-tuft-border rounded px-2 py-1 backdrop-blur-sm hover:text-tuft-text"
          >
            Reset
          </button>
        </div>
      )}

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

      {/* Error overlay */}
      {processingStatus === 'error' && processingError && (
        <div className="absolute inset-0 flex items-center justify-center bg-tuft-bg/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 max-w-sm px-4 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-red-500/50 flex items-center justify-center">
              <span className="text-red-400 text-sm">!</span>
            </div>
            <span className="font-mono text-xs text-red-400">
              {processingError}
            </span>
            <button
              onClick={() => useProjectStore.getState().setProcessingStatus('idle')}
              className="font-mono text-2xs text-tuft-text-dim hover:text-tuft-text border border-tuft-border rounded px-3 py-1.5"
            >
              Dismiss
            </button>
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
