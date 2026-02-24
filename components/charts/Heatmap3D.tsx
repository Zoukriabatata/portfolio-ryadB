'use client';

/**
 * HEATMAP 3D v2 — React component
 *
 * 3D terrain visualization of orderbook depth with:
 * - Canvas2D overlay (HUD, axis labels, color legend, crosshair)
 * - Camera inertia & smooth transitions
 * - Keyboard shortcuts & camera presets
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import { SimulationEngine } from '@/lib/heatmap-v2/SimulationEngine';
import { LiveDataEngine, resetLiveDataEngine } from '@/lib/heatmap-v2/LiveDataEngine';
import type { MarketState, SimulationConfig } from '@/lib/heatmap-v2/types';
import { Heatmap3DRenderer } from '@/lib/heatmap-webgl/Heatmap3DRenderer';
import { adaptMarketStateToSurface, type SurfaceGridData } from '@/lib/heatmap-webgl/adapters/SurfaceDataAdapter';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';

// Camera preset definitions (matches CameraController.CAMERA_PRESETS)
const CAMERA_PRESETS = [
  { name: 'isometric', label: 'Iso',   shortcut: '1' },
  { name: 'top',       label: 'Top',   shortcut: '2' },
  { name: 'front',     label: 'Front', shortcut: '3' },
  { name: 'side',      label: 'Side',  shortcut: '4' },
  { name: 'overview',  label: '3/4',   shortcut: '5' },
] as const;

export type DataMode = 'simulation' | 'live';

interface Heatmap3DProps {
  height?: number;
  config?: Partial<SimulationConfig>;
  symbol?: string;
  initialMode?: DataMode;
}

// ── 3D→2D projection helper ──────────────────────────────────────────────

function project(
  vp: Float32Array,
  wx: number, wy: number, wz: number,
  canvasW: number, canvasH: number,
): { x: number; y: number } | null {
  const x = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
  const y = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
  const w = vp[3] * wx + vp[7] * wy + vp[11] * wz + vp[15];
  if (w <= 0.001) return null;
  return {
    x: (x / w * 0.5 + 0.5) * canvasW,
    y: (1 - (y / w * 0.5 + 0.5)) * canvasH,
  };
}

// ── Overlay drawing functions ────────────────────────────────────────────

interface OverlayData {
  midPrice: number;
  currentBid: number;
  currentAsk: number;
  grid: SurfaceGridData | null;
  crosshairScreen: { x: number; y: number } | null;
  crosshairWorld: { worldX: number; worldY: number } | null;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  data: OverlayData,
  tickSize: number,
) {
  ctx.clearRect(0, 0, w, h);

  drawHUD(ctx, data);
  if (data.grid) {
    drawAxisLabels(ctx, w, h, vp, data.grid, tickSize);
  }
  drawColorLegend(ctx, h);
  if (data.crosshairScreen && data.crosshairWorld && data.grid) {
    drawCrosshair(ctx, w, h, data, tickSize);
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, data: OverlayData) {
  const spread = data.currentAsk - data.currentBid;
  const precision = data.midPrice >= 100 ? 2 : data.midPrice >= 1 ? 4 : 6;

  // Panel background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundedRect(ctx, 8, 8, 195, 68, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  roundedRect(ctx, 8, 8, 195, 68, 6);
  ctx.stroke();

  ctx.font = '11px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';

  // Mid price
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Mid: ${data.midPrice.toFixed(precision)}`, 16, 26);

  // Bid / Ask
  ctx.fillStyle = '#22c55e';
  ctx.fillText(`Bid: ${data.currentBid.toFixed(precision)}`, 16, 42);
  ctx.fillStyle = '#ef4444';
  ctx.fillText(`Ask: ${data.currentAsk.toFixed(precision)}`, 110, 42);

  // Spread
  ctx.fillStyle = '#64748b';
  ctx.fillText(`Spread: ${spread.toFixed(precision)}`, 16, 58);
  ctx.fillStyle = '#475569';
  ctx.fillText(`(${((spread / data.midPrice) * 100).toFixed(4)}%)`, 110, 58);
}

function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vp: Float32Array,
  grid: SurfaceGridData,
  tickSize: number,
) {
  const { priceMin, priceMax } = grid;
  const priceRange = priceMax - priceMin;
  if (priceRange <= 0) return;

  const precision = tickSize >= 1 ? 0 : tickSize >= 0.01 ? 2 : 4;
  ctx.font = '10px Consolas, Monaco, monospace';

  // ── Price axis (along Y=1 right edge) ──
  const priceSteps = 8;
  for (let i = 0; i <= priceSteps; i++) {
    const t = i / priceSteps;
    const price = priceMin + t * priceRange;
    const screen = project(vp, 1.03, t, 0, w, h);
    if (!screen || screen.x < 0 || screen.x > w - 10 || screen.y < 10 || screen.y > h - 10) continue;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.textAlign = 'left';
    ctx.fillText(price.toFixed(precision), screen.x + 4, screen.y + 3);

    // Tick mark
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const tickStart = project(vp, 1.0, t, 0, w, h);
    if (tickStart) {
      ctx.moveTo(tickStart.x, tickStart.y);
      ctx.lineTo(screen.x + 2, screen.y);
      ctx.stroke();
    }
  }

  // ── Time axis (along X at Y=0 bottom edge) ──
  const timeSteps = 6;
  const totalTimeMs = (grid.timeIndexMax - grid.timeIndexMin) * 360; // ~360ms per index
  for (let i = 0; i <= timeSteps; i++) {
    const t = i / timeSteps;
    const screen = project(vp, t, -0.03, 0, w, h);
    if (!screen || screen.x < 30 || screen.x > w - 30 || screen.y < 10 || screen.y > h - 5) continue;

    const secsAgo = ((1 - t) * totalTimeMs / 1000);
    const label = secsAgo < 1 ? 'Now' : `-${Math.round(secsAgo)}s`;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText(label, screen.x, screen.y + 12);
  }

  // ── Axis titles ──
  // "Price →" near the Y axis
  const priceLabelPos = project(vp, 1.03, 0.5, 0, w, h);
  if (priceLabelPos && priceLabelPos.x < w - 5) {
    ctx.save();
    ctx.translate(priceLabelPos.x + 40, priceLabelPos.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.font = '9px Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRICE', 0, 0);
    ctx.restore();
  }

  // "Time →" near the X axis
  const timeLabelPos = project(vp, 0.5, -0.03, 0, w, h);
  if (timeLabelPos && timeLabelPos.y < h - 5) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.font = '9px Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TIME', timeLabelPos.x, timeLabelPos.y + 26);
  }
}

function drawColorLegend(ctx: CanvasRenderingContext2D, canvasH: number) {
  const x = 12;
  const y = canvasH / 2 - 55;
  const barW = 10;
  const barH = 110;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  roundedRect(ctx, x - 3, y - 16, barW + 50, barH + 32, 4);
  ctx.fill();

  // Gradient bar
  const grad = ctx.createLinearGradient(x, y + barH, x, y);
  grad.addColorStop(0, '#0a2e1a');
  grad.addColorStop(0.3, '#22c55e');
  grad.addColorStop(0.5, '#fbbf24');
  grad.addColorStop(0.8, '#ef4444');
  grad.addColorStop(1, '#fef3c7');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, barW, barH);

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);

  // Labels
  ctx.font = '9px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(254, 243, 199, 0.8)';
  ctx.fillText('High', x + barW + 4, y + 4);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
  ctx.fillText('Ask', x + barW + 4, y + barH * 0.3);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
  ctx.fillText('Mid', x + barW + 4, y + barH * 0.5 + 3);
  ctx.fillStyle = 'rgba(34, 197, 94, 0.7)';
  ctx.fillText('Bid', x + barW + 4, y + barH * 0.7);
  ctx.fillStyle = 'rgba(100, 116, 139, 0.6)';
  ctx.fillText('Low', x + barW + 4, y + barH);

  // Title
  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.font = '8px Consolas, Monaco, monospace';
  ctx.fillText('INTENSITY', x, y - 6);
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  data: OverlayData,
  tickSize: number,
) {
  const ch = data.crosshairScreen!;
  const world = data.crosshairWorld!;
  const grid = data.grid!;

  // Check bounds
  if (world.worldX < 0 || world.worldX > 1 || world.worldY < 0 || world.worldY > 1) return;

  // Dashed crosshair lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  ctx.beginPath();
  ctx.moveTo(ch.x, 0);
  ctx.lineTo(ch.x, h);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, ch.y);
  ctx.lineTo(w, ch.y);
  ctx.stroke();

  ctx.setLineDash([]);

  // Compute real-world values
  const price = grid.priceMin + world.worldY * (grid.priceMax - grid.priceMin);
  const precision = tickSize >= 1 ? 0 : tickSize >= 0.01 ? 2 : 4;

  const timeRatio = 1 - world.worldX;
  const totalTimeMs = (grid.timeIndexMax - grid.timeIndexMin) * 360;
  const secsAgo = (timeRatio * totalTimeMs) / 1000;
  const timeLabel = secsAgo < 1 ? 'Now' : `-${Math.round(secsAgo)}s`;

  // Tooltip box
  const lines = [
    `Price: ${price.toFixed(precision)}`,
    `Time: ${timeLabel}`,
  ];
  const padding = 8;
  const lineHeight = 14;
  const boxW = 130;
  const boxH = lines.length * lineHeight + padding * 2;

  // Position tooltip avoiding edges
  let tx = ch.x + 14;
  let ty = ch.y - boxH - 6;
  if (tx + boxW > w - 10) tx = ch.x - boxW - 14;
  if (ty < 10) ty = ch.y + 14;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  roundedRect(ctx, tx, ty, boxW, boxH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  roundedRect(ctx, tx, ty, boxW, boxH, 4);
  ctx.stroke();

  ctx.font = '10px Consolas, Monaco, monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2e8f0';
  lines.forEach((line, i) => {
    ctx.fillText(line, tx + padding, ty + padding + 10 + i * lineHeight);
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export const Heatmap3D = React.memo(function Heatmap3D({
  height = 600,
  config,
  symbol = 'btcusdt',
  initialMode = 'simulation',
}: Heatmap3DProps) {
  const isActive = usePageActive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Heatmap3DRenderer | null>(null);
  const simulationRef = useRef<SimulationEngine | null>(null);
  const liveEngineRef = useRef<LiveDataEngine | null>(null);
  const animationRef = useRef<number>(0);
  const stateRef = useRef<MarketState | null>(null);
  const cleanupControlsRef = useRef<(() => void) | null>(null);
  const crosshairRef = useRef<{ screenX: number; screenY: number } | null>(null);
  const overlayDirtyRef = useRef(true);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [isReady, setIsReady] = useState(false);
  const [heightScale, setHeightScale] = useState(0.8);
  const [showGrid, setShowGrid] = useState(true);
  const [dataMode] = useState<DataMode>(initialMode);

  const contrast = useHeatmapSettingsStore((s) => s.contrast);
  const upperCutoffPercent = useHeatmapSettingsStore((s) => s.upperCutoffPercent);

  const tickSize = config?.tickSize || 0.5;

  // Initialize renderer + data engine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };

    const renderer = new Heatmap3DRenderer({
      canvas: canvasRef.current,
      width: rect.width,
      height: rect.height,
    });
    rendererRef.current = renderer;

    // Attach orbit controls
    cleanupControlsRef.current = renderer.attachControls(canvasRef.current);

    // Setup overlay canvas
    if (overlayCanvasRef.current) {
      const dpr = window.devicePixelRatio || 1;
      overlayCanvasRef.current.width = rect.width * dpr;
      overlayCanvasRef.current.height = rect.height * dpr;
      overlayCanvasRef.current.style.width = `${rect.width}px`;
      overlayCanvasRef.current.style.height = `${rect.height}px`;
      const octx = overlayCanvasRef.current.getContext('2d');
      if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Data engine
    const onUpdate = (state: MarketState) => {
      stateRef.current = state;
    };

    if (dataMode === 'simulation') {
      const sim = new SimulationEngine(config);
      sim.setOnUpdate(onUpdate);
      sim.start();
      simulationRef.current = sim;
    } else {
      resetLiveDataEngine();
      const live = new LiveDataEngine({ symbol, tickSize });
      live.setOnUpdate(onUpdate);
      live.start();
      liveEngineRef.current = live;
    }

    setIsReady(true);

    return () => {
      cleanupControlsRef.current?.();
      cleanupControlsRef.current = null;
      simulationRef.current?.destroy();
      simulationRef.current = null;
      liveEngineRef.current?.destroy();
      liveEngineRef.current = null;
      renderer.destroy();
      rendererRef.current = null;
      setIsReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMode, symbol]);

  // Pause/resume
  useEffect(() => {
    if (isActive) {
      simulationRef.current?.start();
      liveEngineRef.current?.start();
    } else {
      simulationRef.current?.stop();
    }
  }, [isActive]);

  // Resize
  useEffect(() => {
    if (!containerRef.current || !rendererRef.current) return;

    const ro = new ResizeObserver(() => {
      const rect = containerRef.current!.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      rendererRef.current?.resize(rect.width, rect.height);

      // Resize overlay canvas
      if (overlayCanvasRef.current) {
        const dpr = window.devicePixelRatio || 1;
        overlayCanvasRef.current.width = rect.width * dpr;
        overlayCanvasRef.current.height = rect.height * dpr;
        overlayCanvasRef.current.style.width = `${rect.width}px`;
        overlayCanvasRef.current.style.height = `${rect.height}px`;
        const octx = overlayCanvasRef.current.getContext('2d');
        if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      overlayDirtyRef.current = true;
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [isReady]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isReady) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const camera = rendererRef.current?.camera;
      if (!camera) return;

      switch (e.key) {
        case '1': camera.goToPreset('isometric'); break;
        case '2': camera.goToPreset('top'); break;
        case '3': camera.goToPreset('front'); break;
        case '4': camera.goToPreset('side'); break;
        case '5': camera.goToPreset('overview'); break;
        case 'r': case 'R': camera.reset(); break;
        default: return;
      }
      overlayDirtyRef.current = true;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isReady]);

  // Render loop
  useEffect(() => {
    if (!isActive || !isReady) return;

    let lastDataUpdate = 0;
    const DATA_THROTTLE = 100;

    const render = () => {
      const renderer = rendererRef.current;
      const state = stateRef.current;

      if (renderer?.isInitialized) {
        const now = Date.now();

        // Apply camera inertia/transitions
        const cameraMoved = renderer.camera.tick();
        if (cameraMoved) overlayDirtyRef.current = true;

        // Throttle data adapter
        if (state && now - lastDataUpdate > DATA_THROTTLE) {
          lastDataUpdate = now;

          const priceRange = {
            min: state.midPrice - 50 * tickSize,
            max: state.midPrice + 50 * tickSize,
          };

          const grid = adaptMarketStateToSurface(state, priceRange, tickSize);
          if (grid) {
            renderer.updateData(grid, state.midPrice);
            overlayDirtyRef.current = true;
          }
        }

        // Render WebGL surface
        renderer.render({
          contrast,
          upperCutoff: upperCutoffPercent / 100,
          heightScale,
          showGridLines: showGrid,
        });

        // Render Canvas2D overlay (only when dirty)
        if (overlayDirtyRef.current) {
          const octx = overlayCanvasRef.current?.getContext('2d');
          if (octx && state) {
            const { w, h } = sizeRef.current;
            const aspect = w / h;
            const vp = renderer.camera.getViewProjectionMatrix(aspect);
            const gridData = renderer.getLastGridData();

            // Crosshair world position
            let crosshairWorld: { worldX: number; worldY: number } | null = null;
            const ch = crosshairRef.current;
            if (ch) {
              crosshairWorld = renderer.unprojectToFloor(ch.screenX, ch.screenY, w, h);
            }

            drawOverlay(octx, w, h, vp, {
              midPrice: state.midPrice,
              currentBid: state.currentBid,
              currentAsk: state.currentAsk,
              grid: gridData,
              crosshairScreen: ch ? { x: ch.screenX, y: ch.screenY } : null,
              crosshairWorld,
            }, tickSize);

            overlayDirtyRef.current = false;
          }
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive, isReady, contrast, upperCutoffPercent, heightScale, showGrid, tickSize]);

  // Mouse handlers for crosshair (use refs, not state, to avoid re-renders)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    crosshairRef.current = {
      screenX: e.clientX - rect.left,
      screenY: e.clientY - rect.top,
    };
    overlayDirtyRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = null;
    overlayDirtyRef.current = true;
  }, []);

  const handleResetCamera = useCallback(() => {
    rendererRef.current?.camera.reset();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: '#0a0c10' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ cursor: 'grab' }}
      />

      {/* Canvas2D overlay (pointer-events: none) */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ pointerEvents: 'none' }}
      />

      {/* Controls — top right */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
        {/* Height Scale */}
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
          <label className="text-[10px] text-white/50 uppercase tracking-wider block mb-1">
            Height
          </label>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.05"
            value={heightScale}
            onChange={(e) => setHeightScale(parseFloat(e.target.value))}
            className="w-20 h-1 accent-emerald-500"
          />
        </div>

        {/* Grid Toggle */}
        <button
          onClick={() => setShowGrid(!showGrid)}
          className={`bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 border text-[10px] uppercase tracking-wider transition-colors ${
            showGrid
              ? 'border-emerald-500/40 text-emerald-400'
              : 'border-white/10 text-white/40'
          }`}
        >
          Grid
        </button>

        {/* Reset Camera */}
        <button
          onClick={handleResetCamera}
          className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10 text-[10px] text-white/50 uppercase tracking-wider hover:text-white/80 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Camera Presets — bottom right */}
      <div className="absolute bottom-3 right-3 flex gap-1 z-10">
        {CAMERA_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => rendererRef.current?.camera.goToPreset(preset.name)}
            className="bg-black/60 backdrop-blur-sm rounded px-2.5 py-1 border border-white/10 text-[9px] text-white/50 uppercase tracking-wider hover:text-white/80 hover:border-white/20 transition-colors"
            title={`${preset.label} view (${preset.shortcut})`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Mode Badge — bottom left */}
      <div className="absolute bottom-3 left-3 z-10">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">
            3D Surface
          </span>
          <span className="text-[10px] text-white/30 ml-2">
            Drag rotate | Scroll zoom | Shift+drag pan | 1-5 presets
          </span>
        </div>
      </div>

      {/* Loading */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <span className="text-xs text-white/50">Initializing 3D...</span>
          </div>
        </div>
      )}
    </div>
  );
});
