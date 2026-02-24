'use client';

/**
 * HEATMAP 3D — React component
 *
 * 3D terrain visualization of orderbook depth.
 * Reuses the same data engines as StaircaseHeatmap.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import { SimulationEngine } from '@/lib/heatmap-v2/SimulationEngine';
import { LiveDataEngine, resetLiveDataEngine } from '@/lib/heatmap-v2/LiveDataEngine';
import type { MarketState, SimulationConfig } from '@/lib/heatmap-v2/types';
import { Heatmap3DRenderer } from '@/lib/heatmap-webgl/Heatmap3DRenderer';
import { adaptMarketStateToSurface } from '@/lib/heatmap-webgl/adapters/SurfaceDataAdapter';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';

export type DataMode = 'simulation' | 'live';

interface Heatmap3DProps {
  height?: number;
  config?: Partial<SimulationConfig>;
  symbol?: string;
  initialMode?: DataMode;
}

export const Heatmap3D = React.memo(function Heatmap3D({
  height = 600,
  config,
  symbol = 'btcusdt',
  initialMode = 'simulation',
}: Heatmap3DProps) {
  const isActive = usePageActive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Heatmap3DRenderer | null>(null);
  const simulationRef = useRef<SimulationEngine | null>(null);
  const liveEngineRef = useRef<LiveDataEngine | null>(null);
  const animationRef = useRef<number>(0);
  const stateRef = useRef<MarketState | null>(null);
  const cleanupControlsRef = useRef<(() => void) | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [heightScale, setHeightScale] = useState(0.8);
  const [showGrid, setShowGrid] = useState(true);
  const [dataMode] = useState<DataMode>(initialMode);

  const { colorScheme, contrast, upperCutoffPercent } = useHeatmapSettingsStore((s) => ({
    colorScheme: s.colorScheme,
    contrast: s.contrast,
    upperCutoffPercent: s.upperCutoffPercent,
  }));

  const tickSize = config?.tickSize || 0.5;

  // Initialize renderer + data engine
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const renderer = new Heatmap3DRenderer({
      canvas: canvasRef.current,
      width: rect.width,
      height: rect.height,
    });
    rendererRef.current = renderer;

    // Attach orbit controls
    cleanupControlsRef.current = renderer.attachControls(canvasRef.current);

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
      const live = new LiveDataEngine({
        symbol,
        tickSize,
      });
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
      rendererRef.current?.resize(rect.width, rect.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [isReady]);

  // Render loop
  useEffect(() => {
    if (!isActive || !isReady) return;

    let lastDataUpdate = 0;
    const DATA_THROTTLE = 100; // 10 FPS for data, 60 FPS for camera

    const render = () => {
      const renderer = rendererRef.current;
      const state = stateRef.current;

      if (renderer?.isInitialized) {
        const now = Date.now();

        // Throttle data adapter
        if (state && now - lastDataUpdate > DATA_THROTTLE) {
          lastDataUpdate = now;

          const priceRange = {
            min: state.midPrice - 50 * tickSize,
            max: state.midPrice + 50 * tickSize,
          };

          const grid = adaptMarketStateToSurface(state, priceRange, tickSize);
          if (grid) {
            renderer.updateData(grid);
          }
        }

        // Always render (camera might have moved)
        renderer.render({
          contrast,
          upperCutoff: upperCutoffPercent / 100,
          heightScale,
          showGridLines: showGrid,
        });
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive, isReady, contrast, upperCutoffPercent, heightScale, showGrid, tickSize]);

  const handleResetCamera = useCallback(() => {
    rendererRef.current?.camera.reset();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: '#0a0c10' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        style={{ cursor: 'grab' }}
      />

      {/* 3D Controls Overlay */}
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

      {/* Mode Badge */}
      <div className="absolute bottom-3 left-3 z-10">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">
            3D Surface
          </span>
          <span className="text-[10px] text-white/30 ml-2">
            Drag to rotate • Scroll to zoom • Right-drag to pan
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
