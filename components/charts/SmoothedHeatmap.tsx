'use client';

/**
 * SMOOTHED LIQUIDITY HEATMAP
 *
 * Human-readable, professional-pace visualization.
 *
 * Speed Modes:
 * - ANALYSIS (0.35x): Maximum readability, heavy smoothing
 * - TRADING (0.55x): Balanced realism
 * - REPLAY (1.0x): Fast review
 *
 * All timing is time-dilated:
 * - Liquidity fades in/out over 400-800ms
 * - Price moves with 120-200ms minimum interval
 * - Trade bubbles live 600-1500ms
 * - No jitter, no chaos
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  SmoothedSimulationEngine,
  SmoothedState,
  SmoothedConfig,
  SpeedMode,
  SPEED_PRESETS,
} from '@/lib/heatmap/simulation/SmoothedSimulationEngine';
import {
  SmoothedHeatmapRenderer,
  SmoothedRenderContext,
  SmoothedRenderSettings,
  CALM_PALETTE,
} from '@/lib/heatmap/rendering/SmoothedHeatmapRenderer';
import type { PriceRange, Point } from '@/lib/heatmap/core/types';

// ============================================================================
// PROPS
// ============================================================================
interface SmoothedHeatmapProps {
  height?: number;
  priceRangeTicks?: number;
  initialConfig?: Partial<SmoothedConfig>;
  initialSpeedMode?: SpeedMode;
  showControls?: boolean;
}

// ============================================================================
// HISTORY COLUMN
// ============================================================================
interface HistoryColumn {
  timestamp: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
}

// ============================================================================
// SPEED MODE LABELS
// ============================================================================
const SPEED_MODE_LABELS: Record<SpeedMode, { label: string; description: string; color: string }> = {
  analysis: { label: '🧠 ANALYSIS', description: '0.30x - Max readability', color: 'bg-purple-600/40 text-purple-300' },
  trading: { label: '📈 TRADING', description: '0.47x - Balanced', color: 'bg-blue-600/40 text-blue-300' },
  replay: { label: '⚡ REPLAY', description: '0.85x - Fast review', color: 'bg-amber-600/40 text-amber-300' },
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function SmoothedHeatmap({
  height = 700,
  priceRangeTicks = 60,
  initialConfig,
  initialSpeedMode = 'trading',
  showControls = true,
}: SmoothedHeatmapProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<SmoothedSimulationEngine | null>(null);
  const rendererRef = useRef<SmoothedHeatmapRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);

  // History buffer
  const historyRef = useRef<HistoryColumn[]>([]);
  const maxHistory = 350;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [mousePosition, setMousePosition] = useState<Point | null>(null);
  const [cursorStyle, setCursorStyle] = useState('crosshair');

  // Simulation state
  const [simulationState, setSimulationState] = useState<SmoothedState | null>(null);

  // Speed mode
  const [speedMode, setSpeedMode] = useState<SpeedMode>(initialSpeedMode);

  // Zoom
  const [priceZoom, setPriceZoom] = useState(1.0);
  const [autoCenter, setAutoCenter] = useState(true);

  // Control panel
  const [showPanel, setShowPanel] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Config
  const [config, setConfig] = useState<SmoothedConfig>({
    tickSize: 0.5,
    basePrice: 100000,
    liquidityIntensity: 1.0,
    baseLiquidityPerLevel: 12,
    liquiditySpread: 55,
    wallProbability: 0.02,
    wallSizeMultiplier: 8,
    spoofProbability: 0.012,
    spoofLifetimeMs: 1200,
    tradeFrequency: 6,
    avgTradeSize: 2.5,
    tradeSizeVariance: 3,
    burstProbability: 0.025,
    volatility: 0.00005,
    trendStrength: 0,
    ...initialConfig,
  });

  // Display toggles
  const [showGhostBars, setShowGhostBars] = useState(true);
  const [showAbsorption, setShowAbsorption] = useState(true);
  const [showContactFeedback, setShowContactFeedback] = useState(true);
  const [showTextureVariation, setShowTextureVariation] = useState(true);
  const [showThermalSolidity, setShowThermalSolidity] = useState(true);
  const [showAfterimages, setShowAfterimages] = useState(true);
  const [showDirectionalPressure, setShowDirectionalPressure] = useState(true);
  const [enableSilence, setEnableSilence] = useState(true);

  // Price range calculation
  const getPriceRange = useCallback((): PriceRange => {
    const center = simulationState?.displayPrice || config.basePrice;
    const baseRange = config.tickSize * priceRangeTicks;
    const effectiveRange = baseRange / priceZoom;

    return {
      min: center - effectiveRange / 2,
      max: center + effectiveRange / 2,
    };
  }, [simulationState?.displayPrice, config.basePrice, config.tickSize, priceRangeTicks, priceZoom]);

  // Initialize
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // Create simulation with initial speed mode
      simulationRef.current = new SmoothedSimulationEngine(config, speedMode);

      // Create renderer
      rendererRef.current = new SmoothedHeatmapRenderer(canvasRef.current);
      rendererRef.current.setTickSize(config.tickSize);

      // Callback
      simulationRef.current.setOnStateUpdate((state) => {
        setSimulationState(state);

        // Add to history (using displaySize for smooth history)
        const bids = new Map<number, number>();
        const asks = new Map<number, number>();
        for (const [price, level] of state.bids) bids.set(price, level.displaySize);
        for (const [price, level] of state.asks) asks.set(price, level.displaySize);

        historyRef.current.push({
          timestamp: state.timestamp,
          bids,
          asks,
        });

        if (historyRef.current.length > maxHistory) {
          historyRef.current.shift();
        }
      });

      // Start
      simulationRef.current.start(25);
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to initialize:', err);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      simulationRef.current?.destroy();
      rendererRef.current?.destroy();
    };
  }, []);

  // Update config
  useEffect(() => {
    simulationRef.current?.updateConfig(config);
    rendererRef.current?.setTickSize(config.tickSize);
  }, [config]);

  // Update speed mode
  useEffect(() => {
    simulationRef.current?.setSpeedMode(speedMode);
  }, [speedMode]);

  // Update renderer settings
  useEffect(() => {
    rendererRef.current?.updateSettings({
      showGhostBars,
      showAbsorptionHalos: showAbsorption,
      focusModeEnabled: focusMode,
      showContactFeedback,
      showTextureVariation,
      showThermalSolidity,
      showAfterimages,
      showDirectionalPressure,
      enableSilenceOptimization: enableSilence,
    });
  }, [showGhostBars, showAbsorption, focusMode, showContactFeedback, showTextureVariation,
      showThermalSolidity, showAfterimages, showDirectionalPressure, enableSilence]);

  // Render loop
  useEffect(() => {
    const render = () => {
      if (!rendererRef.current || !canvasRef.current || !simulationState) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const priceRange = getPriceRange();

      const context: SmoothedRenderContext = {
        state: simulationState,
        history: historyRef.current,
        mousePosition,
      };

      rendererRef.current.render(context, priceRange);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [simulationState, mousePosition, getPriceRange]);

  // Resize
  useEffect(() => {
    const handleResize = () => rendererRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setCursorStyle(rendererRef.current?.isInPriceAxis(e.clientX - rect.left) ? 'ns-resize' : 'crosshair');
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePosition(null);
    setCursorStyle('crosshair');
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setPriceZoom(prev => Math.max(0.5, Math.min(6, prev * factor)));
  }, []);

  const handleDoubleClick = useCallback(() => {
    setPriceZoom(1.0);
    setAutoCenter(true);
  }, []);

  // Config updater
  const updateConfig = useCallback((key: keyof SmoothedConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;

      switch (e.key.toLowerCase()) {
        case 'r': setPriceZoom(1); setAutoCenter(true); break;
        case 'c': setAutoCenter(prev => !prev); break;
        case 'f': setFocusMode(prev => !prev); break;
        case 's': setShowPanel(prev => !prev); break;
        case 'g': setShowGhostBars(prev => !prev); break;
        case 'a': setShowAbsorption(prev => !prev); break;
        case 't': setShowThermalSolidity(prev => !prev); break;  // Thermal memory
        case 'i': setShowAfterimages(prev => !prev); break;      // Afterimages
        case 'd': setShowDirectionalPressure(prev => !prev); break;  // Directional pressure
        case 'q': setEnableSilence(prev => !prev); break;        // Quiet/silence
        case '1': setSpeedMode('analysis'); break;
        case '2': setSpeedMode('trading'); break;
        case '3': setSpeedMode('replay'); break;
        case '+':
        case '=': setPriceZoom(prev => Math.min(6, prev * 1.15)); break;
        case '-': setPriceZoom(prev => Math.max(0.5, prev * 0.85)); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const speedInfo = SPEED_MODE_LABELS[speedMode];

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: CALM_PALETTE.bg }}
      tabIndex={0}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block', cursor: cursorStyle }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
          <div className="text-zinc-400 text-sm">Initializing smoothed simulation...</div>
        </div>
      )}

      {/* Top-right indicators */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        {priceZoom !== 1 && (
          <div className="px-2 py-0.5 bg-zinc-800/70 rounded text-[9px] text-zinc-300 font-mono">
            {priceZoom.toFixed(1)}x
          </div>
        )}
        {autoCenter && (
          <div className="px-2 py-0.5 bg-blue-600/30 rounded text-[9px] text-blue-300">AUTO</div>
        )}
        {focusMode && (
          <div className="px-2 py-0.5 bg-amber-600/30 rounded text-[9px] text-amber-300">FOCUS</div>
        )}
      </div>

      {/* Speed mode selector */}
      <div className="absolute top-2 left-2 flex items-center gap-1">
        {(Object.keys(SPEED_MODE_LABELS) as SpeedMode[]).map((mode) => {
          const info = SPEED_MODE_LABELS[mode];
          const isActive = speedMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setSpeedMode(mode)}
              className={`px-2 py-1 rounded text-[9px] transition-all ${
                isActive ? info.color + ' border border-white/20' : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
              title={info.description}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {/* Display toggles */}
      <div className="absolute top-10 left-2 flex flex-col gap-0.5">
        {showThermalSolidity && (
          <div className="px-1.5 py-0.5 bg-amber-800/20 rounded text-[8px] text-amber-300/80 font-mono">THERMAL</div>
        )}
        {showAfterimages && (
          <div className="px-1.5 py-0.5 bg-rose-800/20 rounded text-[8px] text-rose-300/80 font-mono">AFTERIMG</div>
        )}
        {showDirectionalPressure && (
          <div className="px-1.5 py-0.5 bg-sky-800/20 rounded text-[8px] text-sky-300/80 font-mono">PRESSURE</div>
        )}
        {enableSilence && (
          <div className="px-1.5 py-0.5 bg-slate-800/20 rounded text-[8px] text-slate-400/80 font-mono">SILENCE</div>
        )}
      </div>

      {/* Settings button */}
      {showControls && (
        <button
          onClick={() => setShowPanel(prev => !prev)}
          className="absolute top-2 right-[140px] px-2 py-1 bg-zinc-800/70 hover:bg-zinc-700/70 rounded text-[9px] text-zinc-300 transition-colors"
        >
          ⚙
        </button>
      )}

      {/* Control panel */}
      {showPanel && showControls && (
        <div className="absolute top-10 right-2 w-56 bg-zinc-900/95 border border-zinc-700/40 rounded-lg shadow-2xl p-2.5 text-[9px] z-20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-200 font-medium text-[10px]">Smoothed Simulation</span>
            <button onClick={() => setShowPanel(false)} className="text-zinc-500 hover:text-zinc-300">×</button>
          </div>

          {/* Speed info */}
          <div className="mb-2 p-2 bg-zinc-800/50 rounded">
            <div className="text-zinc-400 text-[8px] mb-1">CURRENT SPEED</div>
            <div className={`text-[10px] font-medium ${speedInfo.color.split(' ')[1]}`}>
              {speedInfo.label}
            </div>
            <div className="text-zinc-500 text-[8px]">{speedInfo.description}</div>
          </div>

          {/* Liquidity */}
          <div className="mb-2">
            <div className="text-zinc-500 uppercase text-[8px] font-medium mb-1">Liquidity</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Intensity</span>
                <input type="range" min="0.4" max="2.0" step="0.1" value={config.liquidityIntensity}
                  onChange={e => updateConfig('liquidityIntensity', parseFloat(e.target.value))}
                  className="w-16 h-1 bg-zinc-700 rounded appearance-none" />
                <span className="text-zinc-300 w-5 text-right">{config.liquidityIntensity.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Walls</span>
                <input type="range" min="0" max="0.06" step="0.002" value={config.wallProbability}
                  onChange={e => updateConfig('wallProbability', parseFloat(e.target.value))}
                  className="w-16 h-1 bg-zinc-700 rounded appearance-none" />
                <span className="text-zinc-300 w-5 text-right">{(config.wallProbability * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Trading */}
          <div className="mb-2">
            <div className="text-zinc-500 uppercase text-[8px] font-medium mb-1">Trading</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Frequency</span>
                <input type="range" min="2" max="15" step="1" value={config.tradeFrequency}
                  onChange={e => updateConfig('tradeFrequency', parseFloat(e.target.value))}
                  className="w-16 h-1 bg-zinc-700 rounded appearance-none" />
                <span className="text-zinc-300 w-5 text-right">{config.tradeFrequency}/s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Size</span>
                <input type="range" min="0.5" max="6" step="0.5" value={config.avgTradeSize}
                  onChange={e => updateConfig('avgTradeSize', parseFloat(e.target.value))}
                  className="w-16 h-1 bg-zinc-700 rounded appearance-none" />
                <span className="text-zinc-300 w-5 text-right">{config.avgTradeSize.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="mb-2">
            <div className="text-zinc-500 uppercase text-[8px] font-medium mb-1">Price</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Volatility</span>
                <input type="range" min="0.00001" max="0.0002" step="0.00001" value={config.volatility}
                  onChange={e => updateConfig('volatility', parseFloat(e.target.value))}
                  className="w-16 h-1 bg-zinc-700 rounded appearance-none" />
                <span className="text-zinc-300 w-5 text-right">{(config.volatility * 10000).toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Trend</span>
                <input type="range" min="-1" max="1" step="0.1" value={config.trendStrength}
                  onChange={e => updateConfig('trendStrength', parseFloat(e.target.value))}
                  className="w-16 h-1 bg-zinc-700 rounded appearance-none" />
                <span className="text-zinc-300 w-5 text-right">{config.trendStrength.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* Display - Core */}
          <div className="pt-2 border-t border-zinc-700/40">
            <div className="text-zinc-500 uppercase text-[8px] font-medium mb-1">Visual Features</div>
            <div className="grid grid-cols-2 gap-1">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showThermalSolidity} onChange={e => setShowThermalSolidity(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Thermal</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showAfterimages} onChange={e => setShowAfterimages(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Afterimg</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showDirectionalPressure} onChange={e => setShowDirectionalPressure(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Pressure</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={enableSilence} onChange={e => setEnableSilence(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Silence</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showContactFeedback} onChange={e => setShowContactFeedback(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Contact</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showGhostBars} onChange={e => setShowGhostBars(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Ghost</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showAbsorption} onChange={e => setShowAbsorption(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Absorb</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showTextureVariation} onChange={e => setShowTextureVariation(e.target.checked)}
                  className="w-2 h-2 rounded bg-zinc-700" />
                <span className="text-zinc-400">Texture</span>
              </label>
            </div>
          </div>

          {/* Focus Mode */}
          <div className="pt-2 border-t border-zinc-700/40">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={focusMode} onChange={e => setFocusMode(e.target.checked)}
                className="w-2.5 h-2.5 rounded bg-zinc-700" />
              <span className="text-zinc-300 text-[9px]">Focus Mode (hide bottom 50%)</span>
            </label>
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              simulationRef.current?.reset();
              historyRef.current = [];
            }}
            className="w-full mt-2 py-1 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 rounded text-[9px] transition-colors"
          >
            Reset
          </button>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="absolute bottom-10 left-2 text-[7px] text-zinc-600 pointer-events-none leading-relaxed">
        1/2/3: Speed • T: Thermal • I: Afterimg • D: Pressure • Q: Silence • F: Focus • S: Settings
      </div>
    </div>
  );
}

export default SmoothedHeatmap;
