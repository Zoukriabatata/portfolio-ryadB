'use client';

/**
 * SIMULATED LIQUIDITY HEATMAP
 *
 * Professional-grade liquidity visualization with high-fidelity simulation.
 * Superior to ATAS in visual clarity and realism.
 *
 * Features:
 * - Deterministic market simulation
 * - Professional visual hierarchy
 * - Trade bubbles
 * - Passive liquidity bars
 * - Wall, absorption, spoof detection
 * - User-controllable parameters
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { MarketSimulationEngine, SimulationConfig, SimulatedTrade, SimulationState } from '@/lib/heatmap/simulation/MarketSimulationEngine';
import { ProfessionalRenderer, ProfessionalRenderContext, RenderSettings, COLORS } from '@/lib/heatmap/rendering/ProfessionalRenderer';
import type { Trade, PriceRange, Point, LiquidityStats } from '@/lib/heatmap/core/types';

// ============================================================================
// COMPONENT PROPS
// ============================================================================
interface SimulatedLiquidityHeatmapProps {
  height?: number;
  priceRangeTicks?: number;
  initialConfig?: Partial<SimulationConfig>;
  showControls?: boolean;
}

// ============================================================================
// HISTORY BUFFER (for heatmap rendering)
// ============================================================================
interface HistoryColumn {
  timestamp: number;
  bids: Map<number, number>;
  asks: Map<number, number>;
  bestBid: number;
  bestAsk: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function SimulatedLiquidityHeatmap({
  height = 650,
  priceRangeTicks = 80,
  initialConfig,
  showControls = true,
}: SimulatedLiquidityHeatmapProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<MarketSimulationEngine | null>(null);
  const rendererRef = useRef<ProfessionalRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);

  // History buffer
  const historyRef = useRef<HistoryColumn[]>([]);
  const maxHistoryColumns = 500;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [mousePosition, setMousePosition] = useState<Point | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');

  // Simulation state
  const [currentPrice, setCurrentPrice] = useState<number>(100000);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [walls, setWalls] = useState<Array<{ price: number; side: 'bid' | 'ask'; size: number }>>([]);
  const [spoofPatterns, setSpoofPatterns] = useState<Array<{ price: number; side: 'bid' | 'ask'; confidence: number }>>([]);
  const [absorptionZones, setAbsorptionZones] = useState<Array<{ price: number; side: 'bid' | 'ask'; absorbed: number }>>([]);

  // Current order book
  const [currentBids, setCurrentBids] = useState<Map<number, number>>(new Map());
  const [currentAsks, setCurrentAsks] = useState<Map<number, number>>(new Map());

  // Zoom state
  const [priceZoom, setPriceZoom] = useState(1.0);
  const [priceOffset, setPriceOffset] = useState(0);
  const [autoCenter, setAutoCenter] = useState(true);

  // Control panel state
  const [showControlPanel, setShowControlPanel] = useState(false);
  const [config, setConfig] = useState<SimulationConfig>({
    tickSize: 0.5,
    basePrice: 100000,
    liquidityIntensity: 1.0,
    baseLiquidityPerLevel: 10,
    liquiditySpread: 50,
    wallProbability: 0.03,
    wallSizeMultiplier: 8,
    icebergProbability: 0.15,
    icebergHiddenRatio: 0.7,
    spoofProbability: 0.02,
    spoofLifetimeMs: 800,
    spoofSizeMultiplier: 5,
    tradeFrequency: 8,
    avgTradeSize: 2,
    tradeSizeVariance: 3,
    burstProbability: 0.05,
    burstMultiplier: 5,
    volatility: 0.0001,
    trendStrength: 0,
    meanReversionStrength: 0.3,
    liquidityDecayMs: 5000,
    ...initialConfig,
  });

  // Display toggles
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showBars, setShowBars] = useState(true);
  const [showBubbles, setShowBubbles] = useState(true);
  const [showWallsToggle, setShowWallsToggle] = useState(true);
  const [showAbsorptionToggle, setShowAbsorptionToggle] = useState(true);
  const [showSpoofingToggle, setShowSpoofingToggle] = useState(true);

  // Calculate price range
  const getPriceRange = useCallback((): PriceRange => {
    const center = currentPrice || config.basePrice;
    const baseRange = config.tickSize * priceRangeTicks;
    const effectiveRange = baseRange / priceZoom;
    const offset = autoCenter ? 0 : priceOffset;

    return {
      min: center + offset - effectiveRange / 2,
      max: center + offset + effectiveRange / 2,
    };
  }, [currentPrice, config.basePrice, config.tickSize, priceRangeTicks, priceZoom, priceOffset, autoCenter]);

  // Calculate stats for color normalization
  const calculateStats = useCallback((): LiquidityStats => {
    const allSizes: number[] = [];

    for (const column of historyRef.current) {
      for (const size of column.bids.values()) if (size > 0) allSizes.push(size);
      for (const size of column.asks.values()) if (size > 0) allSizes.push(size);
    }
    for (const size of currentBids.values()) if (size > 0) allSizes.push(size);
    for (const size of currentAsks.values()) if (size > 0) allSizes.push(size);

    if (allSizes.length === 0) {
      return { mean: 0, stdDev: 0, min: 0, max: 0, p5: 0, p25: 0, p50: 0, p75: 0, p95: 0, p97: 0 };
    }

    allSizes.sort((a, b) => a - b);
    const n = allSizes.length;
    const mean = allSizes.reduce((a, b) => a + b, 0) / n;
    const variance = allSizes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;

    return {
      mean,
      stdDev: Math.sqrt(variance),
      min: allSizes[0],
      max: allSizes[n - 1],
      p5: allSizes[Math.floor(n * 0.05)],
      p25: allSizes[Math.floor(n * 0.25)],
      p50: allSizes[Math.floor(n * 0.5)],
      p75: allSizes[Math.floor(n * 0.75)],
      p95: allSizes[Math.floor(n * 0.95)],
      p97: allSizes[Math.floor(n * 0.97)],
    };
  }, [currentBids, currentAsks]);

  // Initialize simulation and renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // Create simulation
      simulationRef.current = new MarketSimulationEngine(config);

      // Create renderer
      rendererRef.current = new ProfessionalRenderer(canvasRef.current);
      rendererRef.current.setTickSize(config.tickSize);

      // Set up simulation callbacks
      simulationRef.current.setOnOrderBookUpdate((bids, asks) => {
        setCurrentBids(new Map(bids));
        setCurrentAsks(new Map(asks));

        // Add to history
        const now = Date.now();
        historyRef.current.push({
          timestamp: now,
          bids: new Map(bids),
          asks: new Map(asks),
          bestBid: Math.max(...bids.keys()),
          bestAsk: Math.min(...asks.keys()),
        });

        // Trim history
        if (historyRef.current.length > maxHistoryColumns) {
          historyRef.current.shift();
        }
      });

      simulationRef.current.setOnTrade((trade: SimulatedTrade) => {
        const newTrade: Trade = {
          id: trade.id,
          price: trade.price,
          quantity: trade.quantity,
          side: trade.side,
          timestamp: trade.timestamp,
          isBuyerMaker: trade.side === 'sell',
        };

        setTrades(prev => {
          const updated = [...prev, newTrade];
          // Keep last 500 trades
          if (updated.length > 500) {
            return updated.slice(-500);
          }
          return updated;
        });
      });

      simulationRef.current.setOnStateUpdate((state: SimulationState) => {
        setCurrentPrice(state.currentPrice);
        setWalls(state.walls);
        setAbsorptionZones(state.absorptionZones);

        // Convert spoof orders to patterns
        setSpoofPatterns(state.spoofOrders.map(s => ({
          price: s.price,
          side: s.side,
          confidence: 0.8,
        })));
      });

      // Start simulation
      simulationRef.current.start(50);

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to initialize heatmap:', err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      simulationRef.current?.destroy();
      rendererRef.current?.destroy();
    };
  }, []);

  // Update config when changed
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.updateConfig(config);
    }
    if (rendererRef.current) {
      rendererRef.current.setTickSize(config.tickSize);
    }
  }, [config]);

  // Render loop
  useEffect(() => {
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const render = (timestamp: number) => {
      const elapsed = timestamp - lastRenderTimeRef.current;
      if (elapsed < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastRenderTimeRef.current = timestamp - (elapsed % frameInterval);

      if (!rendererRef.current || !canvasRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      const priceRange = getPriceRange();
      const stats = calculateStats();

      const bestBid = currentBids.size > 0 ? Math.max(...currentBids.keys()) : 0;
      const bestAsk = currentAsks.size > 0 ? Math.min(...currentAsks.keys()) : 0;

      const context: ProfessionalRenderContext = {
        history: historyRef.current,
        currentBids,
        currentAsks,
        bestBid,
        bestAsk,
        midPrice: currentPrice,
        trades: showBubbles ? trades : [],
        walls: showWallsToggle ? walls : [],
        spoofPatterns: showSpoofingToggle ? spoofPatterns : [],
        absorptionZones: showAbsorptionToggle ? absorptionZones : [],
        mousePosition,
        hoveredPrice: null,
        stats,
      };

      rendererRef.current.render(context, priceRange);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentBids, currentAsks, currentPrice, trades, walls, spoofPatterns, absorptionZones,
      mousePosition, getPriceRange, calculateStats, showBubbles, showWallsToggle, showAbsorptionToggle, showSpoofingToggle]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      rendererRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePosition({ x, y });

    const isInPriceAxis = rendererRef.current?.isInPriceAxis(x);
    setCursorStyle(isInPriceAxis ? 'ns-resize' : 'crosshair');
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePosition(null);
    setCursorStyle('crosshair');
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setPriceZoom(prev => Math.max(0.5, Math.min(10, prev * zoomFactor)));
  }, []);

  const handleDoubleClick = useCallback(() => {
    setPriceZoom(1.0);
    setPriceOffset(0);
    setAutoCenter(true);
  }, []);

  // Config update handler
  const updateConfigValue = useCallback((key: keyof SimulationConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }

      switch (e.key) {
        case 'r':
        case 'R':
          setPriceZoom(1.0);
          setPriceOffset(0);
          setAutoCenter(true);
          break;
        case '+':
        case '=':
          setPriceZoom(prev => Math.min(10, prev * 1.2));
          break;
        case '-':
          setPriceZoom(prev => Math.max(0.5, prev * 0.8));
          break;
        case 'c':
        case 'C':
          setAutoCenter(prev => !prev);
          break;
        case 'h':
        case 'H':
          setShowHeatmap(prev => !prev);
          break;
        case 'b':
        case 'B':
          setShowBars(prev => !prev);
          break;
        case 't':
        case 'T':
          setShowBubbles(prev => !prev);
          break;
        case 's':
        case 'S':
          setShowControlPanel(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: COLORS.background }}
      tabIndex={0}
    >
      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block', cursor: cursorStyle }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
          <div className="text-zinc-400">Initializing simulation...</div>
        </div>
      )}

      {/* Top-right status indicators */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        {priceZoom !== 1 && (
          <div className="px-2 py-1 bg-zinc-800/90 rounded text-xs text-zinc-300 font-mono">
            {priceZoom.toFixed(1)}x
          </div>
        )}
        {autoCenter && (
          <div className="px-2 py-1 bg-blue-600/60 rounded text-xs text-white">
            Auto
          </div>
        )}
        <div className="px-2 py-1 bg-emerald-600/60 rounded text-xs text-white">
          SIM
        </div>
      </div>

      {/* Top-left feature toggles */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        {showWallsToggle && (
          <div className="px-2 py-0.5 bg-cyan-900/40 rounded text-[10px] text-cyan-300 font-mono">
            WALLS
          </div>
        )}
        {showAbsorptionToggle && (
          <div className="px-2 py-0.5 bg-orange-900/40 rounded text-[10px] text-orange-300 font-mono">
            ABSORPTION
          </div>
        )}
        {showSpoofingToggle && (
          <div className="px-2 py-0.5 bg-purple-900/40 rounded text-[10px] text-purple-300 font-mono">
            SPOOF
          </div>
        )}
      </div>

      {/* Settings button */}
      {showControls && (
        <button
          onClick={() => setShowControlPanel(prev => !prev)}
          className="absolute top-2 left-24 px-2 py-1 bg-zinc-800/90 hover:bg-zinc-700/90 rounded text-xs text-zinc-300 transition-colors"
        >
          ⚙️ Settings
        </button>
      )}

      {/* Control panel */}
      {showControlPanel && showControls && (
        <div className="absolute top-10 left-2 w-64 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl p-3 text-xs z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-300 font-medium">Simulation Controls</span>
            <button
              onClick={() => setShowControlPanel(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          </div>

          {/* Liquidity controls */}
          <div className="space-y-2 mb-3">
            <div className="text-zinc-500 uppercase text-[10px] font-medium">Liquidity</div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Intensity</span>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={config.liquidityIntensity}
                onChange={(e) => updateConfigValue('liquidityIntensity', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{config.liquidityIntensity.toFixed(1)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Wall Prob</span>
              <input
                type="range"
                min="0"
                max="0.15"
                step="0.01"
                value={config.wallProbability}
                onChange={(e) => updateConfigValue('wallProbability', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{(config.wallProbability * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Trading controls */}
          <div className="space-y-2 mb-3">
            <div className="text-zinc-500 uppercase text-[10px] font-medium">Trading</div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Trade Freq</span>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={config.tradeFrequency}
                onChange={(e) => updateConfigValue('tradeFrequency', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{config.tradeFrequency}/s</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Avg Size</span>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={config.avgTradeSize}
                onChange={(e) => updateConfigValue('avgTradeSize', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{config.avgTradeSize.toFixed(1)}</span>
            </div>
          </div>

          {/* Spoof controls */}
          <div className="space-y-2 mb-3">
            <div className="text-zinc-500 uppercase text-[10px] font-medium">Spoofing</div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Spoof Prob</span>
              <input
                type="range"
                min="0"
                max="0.1"
                step="0.005"
                value={config.spoofProbability}
                onChange={(e) => updateConfigValue('spoofProbability', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{(config.spoofProbability * 100).toFixed(1)}%</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Lifetime</span>
              <input
                type="range"
                min="200"
                max="2000"
                step="100"
                value={config.spoofLifetimeMs}
                onChange={(e) => updateConfigValue('spoofLifetimeMs', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{config.spoofLifetimeMs}ms</span>
            </div>
          </div>

          {/* Price dynamics */}
          <div className="space-y-2 mb-3">
            <div className="text-zinc-500 uppercase text-[10px] font-medium">Price Dynamics</div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Volatility</span>
              <input
                type="range"
                min="0.00001"
                max="0.001"
                step="0.00001"
                value={config.volatility}
                onChange={(e) => updateConfigValue('volatility', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{(config.volatility * 10000).toFixed(1)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Trend</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={config.trendStrength}
                onChange={(e) => updateConfigValue('trendStrength', parseFloat(e.target.value))}
                className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-zinc-300 w-8 text-right">{config.trendStrength.toFixed(1)}</span>
            </div>
          </div>

          {/* Display toggles */}
          <div className="space-y-1 pt-2 border-t border-zinc-700">
            <div className="text-zinc-500 uppercase text-[10px] font-medium mb-1">Display</div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showBubbles}
                onChange={(e) => setShowBubbles(e.target.checked)}
                className="w-3 h-3 rounded bg-zinc-700 border-zinc-600"
              />
              <span className="text-zinc-400">Trade Bubbles</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showWallsToggle}
                onChange={(e) => setShowWallsToggle(e.target.checked)}
                className="w-3 h-3 rounded bg-zinc-700 border-zinc-600"
              />
              <span className="text-zinc-400">Wall Markers</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAbsorptionToggle}
                onChange={(e) => setShowAbsorptionToggle(e.target.checked)}
                className="w-3 h-3 rounded bg-zinc-700 border-zinc-600"
              />
              <span className="text-zinc-400">Absorption</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSpoofingToggle}
                onChange={(e) => setShowSpoofingToggle(e.target.checked)}
                className="w-3 h-3 rounded bg-zinc-700 border-zinc-600"
              />
              <span className="text-zinc-400">Spoof Detection</span>
            </label>
          </div>

          {/* Reset button */}
          <button
            onClick={() => {
              simulationRef.current?.reset();
              historyRef.current = [];
              setTrades([]);
            }}
            className="w-full mt-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
          >
            Reset Simulation
          </button>
        </div>
      )}

      {/* Keyboard shortcuts help */}
      <div className="absolute bottom-14 left-2 text-[9px] text-zinc-600 pointer-events-none">
        Wheel: Zoom • R: Reset • C: Auto-center • S: Settings • T: Bubbles • H: Heatmap • B: Bars
      </div>
    </div>
  );
}

export default SimulatedLiquidityHeatmap;
