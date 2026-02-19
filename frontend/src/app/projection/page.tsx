'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/stores/project-store';

type ViewMode = 'pattern' | 'outline' | 'both';

export default function ProjectionPage() {
  const router = useRouter();
  const project = useProjectStore((s) => s.project);
  const hasHydrated = useProjectStore((s) => s._hasHydrated);
  const outlineWidth = useProjectStore((s) => s.outlineWidth);
  const setOutlineWidth = useProjectStore((s) => s.setOutlineWidth);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outlineImgRef = useRef<HTMLImageElement | null>(null);

  const [mirrored, setMirrored] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('both');
  const [patternOpacity, setPatternOpacity] = useState(1);
  const [soloIndex, setSoloIndex] = useState(-1); // -1 = all colors
  const [showControls, setShowControls] = useState(true);
  const [showGuides, setShowGuides] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [outlineReady, setOutlineReady] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide controls after 3s of no interaction
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowControls(true);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Start timer on mount
  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [resetHideTimer]);

  const palette = project?.palette ?? [];
  const soloColor = soloIndex >= 0 && soloIndex < palette.length ? palette[soloIndex] : null;

  // Redirect if no processed image (after hydration)
  useEffect(() => {
    if (hasHydrated && !project?.processedImage) {
      router.replace('/editor');
    }
  }, [project, hasHydrated, router]);

  // Request fullscreen on mount
  useEffect(() => {
    const tryFullscreen = async () => {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Silently fail — user may have denied
      }
    };
    tryFullscreen();
  }, []);

  // Exit when fullscreen drops (browser intercepts ESC before keydown)
  const wasFullscreenRef = useRef(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        wasFullscreenRef.current = true;
      } else if (wasFullscreenRef.current) {
        // Only navigate if we were actually in fullscreen before
        wasFullscreenRef.current = false;
        router.push('/editor');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [router]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // ESC fallback (when not fullscreen)
      if (e.key === 'Escape') {
        router.push('/editor');
        return;
      }
      // H to toggle controls
      if (e.key === 'h' || e.key === 'H') {
        setShowControls((v) => {
          if (!v) resetHideTimer();
          else { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }
          return !v;
        });
      }
      // M to mirror
      if (e.key === 'm' || e.key === 'M') {
        setMirrored((v) => !v);
      }
      // G to toggle guides
      if (e.key === 'g' || e.key === 'G') {
        setShowGuides((v) => !v);
      }
      // R to toggle raw/pattern
      if (e.key === 'r' || e.key === 'R') {
        setShowRaw((v) => !v);
      }
      // Arrow keys to cycle solo color
      if (e.key === 'ArrowRight') {
        setSoloIndex((i) => {
          if (i >= palette.length - 1) return -1;
          return i + 1;
        });
      }
      if (e.key === 'ArrowLeft') {
        setSoloIndex((i) => {
          if (i <= -1) return palette.length - 1;
          return i - 1;
        });
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [router, palette.length, resetHideTimer]);

  // Build outline image (white strokes for projection)
  useEffect(() => {
    if (!project?.outlineSvg) {
      outlineImgRef.current = null;
      return;
    }

    // Use white strokes in projection — visible on both black bg and dimmed pattern
    const modifiedSvg = project.outlineSvg
      .replace(/stroke="#[^"]*"/, 'stroke="#ffffff"')
      .replace(/stroke-width="[^"]*"/, `stroke-width="${outlineWidth}"`);

    const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      outlineImgRef.current = img;
      URL.revokeObjectURL(url);
      setOutlineReady((n) => n + 1);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [project?.outlineSvg, outlineWidth]);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project?.processedImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    canvas.width = screenW;
    canvas.height = screenH;

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, screenW, screenH);

    // Pick image source
    const imageSource = showRaw
      ? project.originalImage
      : project.processedImage;

    const img = new Image();
    img.onload = () => {
      const padding = 40;
      const availW = screenW - padding * 2;
      const availH = screenH - padding * 2;

      const scale = Math.min(availW / img.width, availH / img.height, 1);
      const drawW = Math.round(img.width * scale);
      const drawH = Math.round(img.height * scale);
      const offX = Math.round((screenW - drawW) / 2);
      const offY = Math.round((screenH - drawH) / 2);

      // Render to offscreen canvas first (no mirror) so pixel ops work correctly
      const offscreen = document.createElement('canvas');
      offscreen.width = drawW;
      offscreen.height = drawH;
      const oCtx = offscreen.getContext('2d')!;

      if (showRaw) {
        // Raw mode: just draw the original, no effects
        oCtx.imageSmoothingEnabled = false;
        oCtx.drawImage(img, 0, 0, drawW, drawH);
      } else {
      // Draw pattern
      if (viewMode === 'pattern' || viewMode === 'both') {
        oCtx.imageSmoothingEnabled = false;
        oCtx.globalAlpha = patternOpacity;
        oCtx.drawImage(img, 0, 0, drawW, drawH);

        // Solo color: dim non-matching pixels
        if (soloColor) {
          const imageData = oCtx.getImageData(0, 0, drawW, drawH);
          const data = imageData.data;
          const [sr, sg, sb] = soloColor.rgb;
          const tol = 12;

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const match =
              Math.abs(r - sr) <= tol &&
              Math.abs(g - sg) <= tol &&
              Math.abs(b - sb) <= tol;

            if (!match) {
              data[i] = Math.round(data[i] * 0.1);
              data[i + 1] = Math.round(data[i + 1] * 0.1);
              data[i + 2] = Math.round(data[i + 2] * 0.1);
            }
          }
          oCtx.putImageData(imageData, 0, 0);
        }
        oCtx.globalAlpha = 1;
      }

      // Draw outline
      if ((viewMode === 'outline' || viewMode === 'both') && outlineImgRef.current) {
        oCtx.imageSmoothingEnabled = true;
        oCtx.globalAlpha = 1;
        oCtx.drawImage(outlineImgRef.current, 0, 0, drawW, drawH);
      }
      } // end !showRaw

      // Blit offscreen to main canvas (with optional mirror)
      ctx.save();
      if (mirrored) {
        ctx.translate(screenW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(offscreen, offX, offY);
      ctx.restore();

      // Alignment guides (drawn on main canvas, NOT mirrored)
      if (showGuides) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#D4FF00';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);

        const cx = offX + drawW / 2;
        const cy = offY + drawH / 2;

        // Center crosshair
        ctx.beginPath();
        ctx.moveTo(cx, offY);
        ctx.lineTo(cx, offY + drawH);
        ctx.moveTo(offX, cy);
        ctx.lineTo(offX + drawW, cy);
        ctx.stroke();

        // Corner markers (L-shaped, 20px)
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        const m = 20;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(offX, offY + m);
        ctx.lineTo(offX, offY);
        ctx.lineTo(offX + m, offY);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(offX + drawW - m, offY);
        ctx.lineTo(offX + drawW, offY);
        ctx.lineTo(offX + drawW, offY + m);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(offX, offY + drawH - m);
        ctx.lineTo(offX, offY + drawH);
        ctx.lineTo(offX + m, offY + drawH);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(offX + drawW - m, offY + drawH);
        ctx.lineTo(offX + drawW, offY + drawH);
        ctx.lineTo(offX + drawW, offY + drawH - m);
        ctx.stroke();

        ctx.globalAlpha = 1;
      }
    };
    img.src = imageSource;
  }, [project, mirrored, viewMode, patternOpacity, soloColor, outlineWidth, outlineReady, showGuides, showRaw]);

  useEffect(() => {
    render();
  }, [render]);

  // Re-render on resize
  useEffect(() => {
    const handleResize = () => render();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  if (!project?.processedImage) return null;

  return (
    <div className="fixed inset-0 bg-black z-50">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onClick={() => {
          if (showControls) {
            setShowControls(false);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          } else {
            resetHideTimer();
          }
        }}
      />

      {/* Controls panel — bottom right */}
      {showControls && (
        <div
          className="absolute bottom-3 right-3 flex flex-col gap-1.5 items-end"
          onPointerDown={resetHideTimer}
          onClick={(e) => { e.stopPropagation(); resetHideTimer(); }}
        >
          {/* Solo color indicator */}
          {soloColor && (
            <div className="flex items-center gap-2 bg-black/80 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm">
              <div
                className="w-4 h-4 rounded border border-white/20"
                style={{ backgroundColor: soloColor.hex }}
              />
              <span className="font-mono text-xs text-white/80">
                {soloColor.name || soloColor.hex}
              </span>
              <span className="font-mono text-2xs text-white/40">
                {soloIndex + 1}/{palette.length}
              </span>
            </div>
          )}

          {/* Main controls */}
          <div className="bg-black/80 border border-white/10 rounded-lg p-2.5 backdrop-blur-sm space-y-2 min-w-[190px] md:min-w-[220px]">
            {/* Image source toggle */}
            <div className="flex gap-1">
              <button
                onClick={() => setShowRaw(false)}
                className={`
                  flex-1 px-2 py-1.5 text-2xs font-mono rounded transition-colors
                  ${!showRaw
                    ? 'bg-[#D4FF00] text-black'
                    : 'text-white/50 hover:text-white/80 bg-white/5'
                  }
                `}
              >
                Pattern
              </button>
              <button
                onClick={() => setShowRaw(true)}
                className={`
                  flex-1 px-2 py-1.5 text-2xs font-mono rounded transition-colors
                  ${showRaw
                    ? 'bg-[#D4FF00] text-black'
                    : 'text-white/50 hover:text-white/80 bg-white/5'
                  }
                `}
              >
                Original
              </button>
            </div>

            {/* View mode (disabled when showing raw) */}
            {!showRaw && (
            <div className="flex gap-1">
              {(['pattern', 'outline', 'both'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`
                    flex-1 px-2 py-1.5 text-2xs font-mono rounded transition-colors capitalize
                    ${viewMode === mode
                      ? 'bg-[#D4FF00] text-black'
                      : 'text-white/50 hover:text-white/80 bg-white/5'
                    }
                  `}
                >
                  {mode}
                </button>
              ))}
            </div>
            )}

            {/* Mirror toggle */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs text-white/50">Mirror</span>
              <button
                onClick={() => setMirrored(!mirrored)}
                className={`
                  px-3 py-1 text-2xs font-mono rounded transition-colors
                  ${mirrored
                    ? 'bg-[#D4FF00] text-black'
                    : 'text-white/50 bg-white/5 hover:text-white/80'
                  }
                `}
              >
                {mirrored ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Alignment guides toggle */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs text-white/50">Guides</span>
              <button
                onClick={() => setShowGuides(!showGuides)}
                className={`
                  px-3 py-1 text-2xs font-mono rounded transition-colors
                  ${showGuides
                    ? 'bg-[#D4FF00] text-black'
                    : 'text-white/50 bg-white/5 hover:text-white/80'
                  }
                `}
              >
                {showGuides ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Pattern opacity */}
            {!showRaw && viewMode !== 'outline' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xs text-white/50">Pattern opacity</span>
                  <span className="font-mono text-2xs text-white/40">
                    {Math.round(patternOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={patternOpacity}
                  onChange={(e) => setPatternOpacity(Number(e.target.value))}
                  className="tuft-slider w-full"
                />
              </div>
            )}

            {/* Outline width */}
            {!showRaw && viewMode !== 'pattern' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xs text-white/50">Outline width</span>
                  <span className="font-mono text-2xs text-white/40">{outlineWidth}px</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={outlineWidth}
                  onChange={(e) => setOutlineWidth(Number(e.target.value))}
                  className="tuft-slider w-full"
                />
              </div>
            )}

            {/* Solo color controls */}
            {!showRaw && (
            <div className="flex items-center justify-between">
              <span className="font-mono text-2xs text-white/50">Solo color</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setSoloIndex((i) => (i <= -1 ? palette.length - 1 : i - 1))}
                  className="px-2 py-1 text-2xs font-mono text-white/50 bg-white/5 rounded hover:text-white/80"
                >
                  ◀
                </button>
                <button
                  onClick={() => setSoloIndex(-1)}
                  className={`
                    px-2 py-1 text-2xs font-mono rounded transition-colors
                    ${soloIndex === -1
                      ? 'bg-[#D4FF00] text-black'
                      : 'text-white/50 bg-white/5 hover:text-white/80'
                    }
                  `}
                >
                  All
                </button>
                <button
                  onClick={() => setSoloIndex((i) => (i >= palette.length - 1 ? -1 : i + 1))}
                  className="px-2 py-1 text-2xs font-mono text-white/50 bg-white/5 rounded hover:text-white/80"
                >
                  ▶
                </button>
              </div>
            </div>
            )}
          </div>

          {/* Bottom row: exit + hide hint */}
          <div className="flex gap-2 items-center">
            <span className="font-mono text-2xs text-white/20 hidden md:inline">
              H hide · M mirror · R raw · G guides · ←→ solo · ESC exit
            </span>
            <button
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                } else {
                  router.push('/editor');
                }
              }}
              className="px-3 py-1.5 text-xs font-mono text-white/50 bg-white/5 border border-white/10 rounded-lg hover:text-white/80 transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Hidden state: show tiny hint */}
      {!showControls && (
        <div
          className="absolute bottom-3 right-3 cursor-pointer"
          onClick={() => resetHideTimer()}
        >
          <span className="font-mono text-2xs text-white/20">
            Tap to show controls
          </span>
        </div>
      )}
    </div>
  );
}
