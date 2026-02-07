'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CanvasChartEngine, type ChartCandle, type ChartTheme } from '@/lib/rendering/CanvasChartEngine';

/**
 * CUSTOM CANVAS CHART - 100% Custom Chart Component
 *
 * Chart professionnel sans dépendance externe
 * Rendu canvas pur avec support:
 * - Bougies japonaises
 * - Volume
 * - Crosshair
 * - Zoom/Pan (souris + touch)
 * - Thèmes
 */

interface CustomCanvasChartProps {
  className?: string;
  theme?: Partial<ChartTheme>;
  showVolume?: boolean;
  showGrid?: boolean;
  onPriceChange?: (price: number) => void;
  onCrosshairMove?: (time: number, price: number) => void;
}

export interface CustomCanvasChartRef {
  setCandles: (candles: ChartCandle[]) => void;
  updateCandle: (candle: ChartCandle) => void;
  fitToData: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTheme: (theme: Partial<ChartTheme>) => void;
}

const DEFAULT_THEME: ChartTheme = {
  background: '#0a0a0a',
  gridLines: '#1a1a1a',
  text: '#888888',
  textMuted: '#555555',
  candleUp: '#22c55e',
  candleDown: '#ef4444',
  wickUp: '#22c55e',
  wickDown: '#ef4444',
  volumeUp: 'rgba(34, 197, 94, 0.4)',
  volumeDown: 'rgba(239, 68, 68, 0.4)',
  crosshair: '#6b7280',
  crosshairLabel: '#ffffff',
  crosshairLabelBg: '#374151',
  priceLineColor: '#3b82f6',
};

export default function CustomCanvasChart({
  className = '',
  theme = DEFAULT_THEME,
  showVolume = true,
  showGrid = true,
  onPriceChange,
  onCrosshairMove,
}: CustomCanvasChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasChartEngine | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize engine
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const engine = new CanvasChartEngine(canvas, theme);
    engineRef.current = engine;

    engine.resize(rect.width, rect.height);
    engine.setShowVolume(showVolume);
    engine.setShowGrid(showGrid);

    if (onPriceChange) {
      engine.setOnPriceChange(onPriceChange);
    }
    if (onCrosshairMove) {
      engine.setOnCrosshairMove(onCrosshairMove);
    }

    setIsInitialized(true);

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          engine.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTheme(theme);
    }
  }, [theme]);

  // Update volume visibility
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setShowVolume(showVolume);
    }
  }, [showVolume]);

  // Update grid visibility
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setShowGrid(showGrid);
    }
  }, [showGrid]);

  // Public methods via ref pattern
  const setCandles = useCallback((candles: ChartCandle[]) => {
    if (engineRef.current) {
      engineRef.current.setCandles(candles);
    }
  }, []);

  const updateCandle = useCallback((candle: ChartCandle) => {
    if (engineRef.current) {
      engineRef.current.updateCandle(candle);
    }
  }, []);

  const fitToData = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.fitToData();
    }
  }, []);

  const zoomIn = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.zoomIn();
    }
  }, []);

  const zoomOut = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.zoomOut();
    }
  }, []);

  // Expose methods via window for external access
  useEffect(() => {
    if (isInitialized) {
      (window as unknown as Record<string, unknown>).__chartRef = {
        setCandles,
        updateCandle,
        fitToData,
        zoomIn,
        zoomOut,
      };
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__chartRef;
    };
  }, [isInitialized, setCandles, updateCandle, fitToData, zoomIn, zoomOut]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: 'crosshair' }}
      />

      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-lg bg-zinc-900/80 border border-zinc-800 z-10">
        <button
          onClick={zoomIn}
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
          title="Zoom In (+)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <button
          onClick={zoomOut}
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
          title="Zoom Out (-)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>
        <div className="w-px h-5 bg-zinc-700" />
        <button
          onClick={fitToData}
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all"
          title="Fit Content"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Export types for external use
export type { ChartCandle, ChartTheme };
