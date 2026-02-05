'use client';

/**
 * STAIRCASE HEATMAP - Composant React principal
 *
 * Features:
 * - Ligne staircase bid/ask
 * - Bulles de trades visibles
 * - Heatmap ordres passifs
 * - Navigation zoom/pan
 * - Crosshair interactif
 * - Mode Simulation ou Live (Binance)
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { SimulationEngine } from '@/lib/heatmap-v2/SimulationEngine';
import { LiveDataEngine, resetLiveDataEngine } from '@/lib/heatmap-v2/LiveDataEngine';
import { HeatmapRenderer } from '@/lib/heatmap-v2/HeatmapRenderer';
import { MarketState, SimulationConfig, DrawingType, TradeFlowSettings as RendererTradeFlowSettings } from '@/lib/heatmap-v2/types';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import LiquidityAdvancedSettings from '@/components/settings/LiquidityAdvancedSettings';

export type DataMode = 'simulation' | 'live';

interface StaircaseHeatmapProps {
  height?: number;
  config?: Partial<SimulationConfig>;
  symbol?: string;
  initialMode?: DataMode;
}

interface CrosshairInfo {
  x: number;
  y: number;
  price: number;
  timeIndex: number;
  bidVolume: number;
  askVolume: number;
  visible: boolean;
}

interface NavigationState {
  // Zoom
  zoomY: number;           // Zoom vertical (prix)
  zoomX: number;           // Zoom horizontal (temps)
  // Pan offset
  panY: number;            // Décalage vertical en prix
  panX: number;            // Décalage horizontal en temps
  // Drag state
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  dragStartPanX: number;
  dragStartPanY: number;
  // Axis drag (zoom)
  isAxisDragging: boolean;
  axisStartY: number;
  axisStartZoom: number;
}

export function StaircaseHeatmap({ height = 600, config, symbol = 'btcusdt', initialMode = 'simulation' }: StaircaseHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<SimulationEngine | null>(null);
  const liveEngineRef = useRef<LiveDataEngine | null>(null);
  const rendererRef = useRef<HeatmapRenderer | null>(null);
  const animationRef = useRef<number>(0);

  const [state, setState] = useState<MarketState | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>(initialMode);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingType | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Use Zustand store for all settings
  const store = useHeatmapSettingsStore();
  const {
    isSettingsPanelOpen,
    openSettingsPanel,
    closeSettingsPanel,
    tradeFlow: tradeFlowSettings,
    displayFeatures,
    autoCenter,
    setAutoCenter,
  } = store;

  // Destructure display features for convenience
  const {
    showDeltaProfile,
    showVolumeProfile,
    showVWAP,
    showImbalances,
    showAbsorption,
    showIcebergs,
    showFootprintNumbers,
    footprintStyle,
    showTimeSales,
    showCumulativeDelta,
    showDOMLadder,
    showTapeVelocity,
    showLargeTradeAlerts,
    showPressureMeter,
    showSessionStats,
    showDrawings,
    passiveThickness,
  } = displayFeatures;

  // Create renderer-compatible trade flow settings
  const rendererTradeFlowSettings = useMemo<RendererTradeFlowSettings>(() => ({
    enabled: tradeFlowSettings.enabled,
    bubbleShape: tradeFlowSettings.bubbleShape,
    cumulativeMode: tradeFlowSettings.cumulativeMode,
    filterThreshold: tradeFlowSettings.filterThreshold,
    showTextLabels: tradeFlowSettings.showTextLabels,
    buyColor: tradeFlowSettings.buyColor,
    sellColor: tradeFlowSettings.sellColor,
    passiveThickness,
  }), [tradeFlowSettings, passiveThickness]);

  const [crosshair, setCrosshair] = useState<CrosshairInfo>({
    x: 0,
    y: 0,
    price: 0,
    timeIndex: 0,
    bidVolume: 0,
    askVolume: 0,
    visible: false,
  });
  const [nav, setNav] = useState<NavigationState>({
    zoomY: 1,
    zoomX: 1,
    panY: 0,
    panX: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartPanX: 0,
    dragStartPanY: 0,
    isAxisDragging: false,
    axisStartY: 0,
    axisStartZoom: 1,
  });

  // Range de prix
  const basePriceRangeTicks = 50;
  const priceAxisWidth = 60;
  const deltaProfileWidth = showDeltaProfile ? 80 : 0;
  const volumeProfileWidth = showVolumeProfile ? 60 : 0;

  const getPriceRange = useCallback(() => {
    if (!state) return { min: 4980, max: 5020 };

    const tickSize = config?.tickSize || 0.5;
    const baseRange = tickSize * basePriceRangeTicks;
    const range = baseRange / nav.zoomY;

    // Centre: soit auto-center sur midPrice, soit position manuelle
    const center = autoCenter ? state.midPrice : state.midPrice + nav.panY;

    return {
      min: center - range / 2,
      max: center + range / 2,
    };
  }, [state, nav.zoomY, nav.panY, autoCenter, config?.tickSize]);

  // Initialisation - based on dataMode
  useEffect(() => {
    if (!canvasRef.current) return;

    // Cleanup previous engines
    simulationRef.current?.destroy();
    liveEngineRef.current?.destroy();
    simulationRef.current = null;
    liveEngineRef.current = null;

    try {
      // Créer le renderer
      if (!rendererRef.current) {
        rendererRef.current = new HeatmapRenderer(canvasRef.current);
      }
      rendererRef.current.setTickSize(config?.tickSize || 0.5);

      if (dataMode === 'simulation') {
        // ═══════════════════════════════════════════════════════════════
        // MODE SIMULATION
        // ═══════════════════════════════════════════════════════════════
        simulationRef.current = new SimulationEngine(config);
        simulationRef.current.setOnUpdate((newState) => {
          setState(newState);
        });
        simulationRef.current.start();
        console.log('[StaircaseHeatmap] Started in SIMULATION mode');

      } else {
        // ═══════════════════════════════════════════════════════════════
        // MODE LIVE (Binance)
        // ═══════════════════════════════════════════════════════════════
        resetLiveDataEngine(); // Reset singleton to apply new config
        liveEngineRef.current = new LiveDataEngine({
          ...config,
          symbol,
          basePrice: config?.basePrice || 100000, // BTC typical price
          tickSize: config?.tickSize || 10, // BTC tick size
        });
        liveEngineRef.current.setOnUpdate((newState) => {
          setState(newState);
        });
        liveEngineRef.current.start();
        console.log(`[StaircaseHeatmap] Started in LIVE mode for ${symbol.toUpperCase()}`);
      }

      setIsReady(true);

    } catch (err) {
      console.error('Erreur initialisation:', err);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      simulationRef.current?.destroy();
      liveEngineRef.current?.destroy();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [dataMode, symbol]);

  // Boucle de rendu
  useEffect(() => {
    const render = () => {
      if (rendererRef.current && state) {
        const priceRange = getPriceRange();
        rendererRef.current.render(
          state,
          priceRange,
          crosshair.visible ? crosshair : null,
          rendererTradeFlowSettings
        );
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [state, getPriceRange, crosshair, rendererTradeFlowSettings]);

  // Resize
  useEffect(() => {
    const handleResize = () => {
      rendererRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update passive thickness in renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setPassiveThickness(passiveThickness);
    }
  }, [passiveThickness]);

  // Update delta profile visibility in renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowDeltaProfile(showDeltaProfile);
    }
  }, [showDeltaProfile]);

  // Update volume profile visibility in renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowVolumeProfile(showVolumeProfile);
    }
  }, [showVolumeProfile]);

  // Update advanced features visibility
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowVWAP(showVWAP);
    }
  }, [showVWAP]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowImbalances(showImbalances);
    }
  }, [showImbalances]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowAbsorption(showAbsorption);
    }
  }, [showAbsorption]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowIcebergs(showIcebergs);
    }
  }, [showIcebergs]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowFootprintNumbers(showFootprintNumbers);
    }
  }, [showFootprintNumbers]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setFootprintStyle(footprintStyle);
    }
  }, [footprintStyle]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowTimeSales(showTimeSales);
    }
  }, [showTimeSales]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowCumulativeDelta(showCumulativeDelta);
    }
  }, [showCumulativeDelta]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowDOMLadder(showDOMLadder);
    }
  }, [showDOMLadder]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowTapeVelocity(showTapeVelocity);
    }
  }, [showTapeVelocity]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowLargeTradeAlerts(showLargeTradeAlerts);
    }
  }, [showLargeTradeAlerts]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowPressureMeter(showPressureMeter);
    }
  }, [showPressureMeter]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowSessionStats(showSessionStats);
    }
  }, [showSessionStats]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowDrawings(showDrawings);
    }
  }, [showDrawings]);

  // Sync active drawing tool with renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setActiveDrawingTool(activeDrawingTool);
    }
  }, [activeDrawingTool]);

  // Keyboard handlers for drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape - cancel drawing or deselect
      if (e.key === 'Escape') {
        if (isDrawing && rendererRef.current) {
          rendererRef.current.cancelDrawing();
          setIsDrawing(false);
        }
        setActiveDrawingTool(null);
        if (rendererRef.current) {
          rendererRef.current.setActiveDrawingTool(null);
        }
      }

      // Delete - remove selected drawing
      if ((e.key === 'Delete' || e.key === 'Backspace') && state && rendererRef.current) {
        const deleted = rendererRef.current.deleteSelectedDrawing(state);
        if (deleted) {
          e.preventDefault();
        }
      }

      // Tool shortcuts
      const key = e.key.toLowerCase();
      if (key === 'v') {
        setActiveDrawingTool(null);
        if (rendererRef.current) rendererRef.current.setActiveDrawingTool(null);
      } else if (key === 'h') {
        setActiveDrawingTool('hline');
      } else if (key === 't') {
        setActiveDrawingTool('trendline');
      } else if (key === 'r') {
        setActiveDrawingTool('rect');
      } else if (key === 'x') {
        setActiveDrawingTool('text');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing, state]);

  // Zoom avec molette
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;

    // Shift + scroll = zoom horizontal (temps)
    if (e.shiftKey) {
      setNav(prev => ({
        ...prev,
        zoomX: Math.max(0.5, Math.min(5, prev.zoomX * factor)),
      }));
    } else {
      // Zoom vertical (prix)
      setNav(prev => ({
        ...prev,
        zoomY: Math.max(0.3, Math.min(8, prev.zoomY * factor)),
      }));
    }
  }, []);

  // Double-click reset
  const handleDoubleClick = useCallback(() => {
    setNav(prev => ({
      ...prev,
      zoomY: 1,
      zoomX: 1,
      panY: 0,
      panX: 0,
    }));
    setAutoCenter(true);
  }, []);

  // Mouse down - start drag or drawing
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !rendererRef.current || !state) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const heatmapEndX = rect.width - priceAxisWidth - volumeProfileWidth;

    // If active drawing tool, start drawing
    if (activeDrawingTool && x <= heatmapEndX && x >= deltaProfileWidth) {
      const priceRange = getPriceRange();
      const newDrawing = rendererRef.current.startDrawing(x, y, priceRange, state);

      if (newDrawing) {
        // Instant drawing (hline, text) - add immediately
        if (state.drawings) {
          state.drawings.drawings.push(newDrawing);
        }
        // Reset tool after creating hline
        if (activeDrawingTool === 'hline' || activeDrawingTool === 'text') {
          setActiveDrawingTool(null);
          rendererRef.current.setActiveDrawingTool(null);
        }
      } else if (activeDrawingTool === 'rect' || activeDrawingTool === 'trendline') {
        // Multi-point drawing - start
        setIsDrawing(true);
      }
      return;
    }

    // Check for selection/drag on existing drawing
    if (!activeDrawingTool && x <= heatmapEndX && x >= deltaProfileWidth) {
      const priceRange = getPriceRange();
      const hitDrawing = rendererRef.current.hitTestDrawings(x, y, priceRange, state);
      if (hitDrawing) {
        // Start selection/drag - handled by renderer
        rendererRef.current.startDrawing(x, y, priceRange, state);
        setIsDrawing(true);
        return;
      }
    }

    // Click sur l'axe des prix ou volume profile = zoom par drag
    if (x > heatmapEndX) {
      setNav(prev => ({
        ...prev,
        isAxisDragging: true,
        axisStartY: e.clientY,
        axisStartZoom: prev.zoomY,
      }));
    } else {
      // Click sur le chart = pan
      setAutoCenter(false);
      setNav(prev => ({
        ...prev,
        isDragging: true,
        dragStartX: e.clientX,
        dragStartY: e.clientY,
        dragStartPanX: prev.panX,
        dragStartPanY: prev.panY,
      }));
    }
  }, [activeDrawingTool, state, getPriceRange, deltaProfileWidth, volumeProfileWidth]);

  // Mouse up - stop drag or finish drawing
  const handleMouseUp = useCallback(() => {
    // Finish drawing if in progress
    if (isDrawing && rendererRef.current && state) {
      const completed = rendererRef.current.finishDrawing();
      if (completed && state.drawings) {
        state.drawings.drawings.push(completed);
      }
      setIsDrawing(false);
    }

    setNav(prev => ({
      ...prev,
      isDragging: false,
      isAxisDragging: false,
    }));
  }, [isDrawing, state]);

  // Mouse move - crosshair tracking + drag handling + drawing
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !state) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const heatmapStartX = deltaProfileWidth;
    const heatmapEndX = rect.width - priceAxisWidth - volumeProfileWidth;
    const actualHeatmapWidth = heatmapEndX - heatmapStartX;

    // Handle drawing in progress
    if (isDrawing && rendererRef.current) {
      const priceRange = getPriceRange();
      rendererRef.current.updateDrawing(x, y, priceRange, state);
      return;
    }

    // Handle axis dragging (zoom)
    if (nav.isAxisDragging) {
      const deltaY = nav.axisStartY - e.clientY;
      const zoomFactor = 1 + deltaY * 0.005;
      const newZoom = Math.max(0.3, Math.min(8, nav.axisStartZoom * zoomFactor));
      setNav(prev => ({ ...prev, zoomY: newZoom }));
      return;
    }

    // Handle chart dragging (pan)
    if (nav.isDragging) {
      const priceRange = getPriceRange();
      const pricePerPixel = (priceRange.max - priceRange.min) / rect.height;

      const deltaY = e.clientY - nav.dragStartY;
      const deltaPriceY = deltaY * pricePerPixel;

      setNav(prev => ({
        ...prev,
        panY: prev.dragStartPanY + deltaPriceY,
      }));
      return;
    }

    // Ignorer crosshair si on est sur l'axe des prix ou delta profile
    if (x > heatmapEndX || x < heatmapStartX) {
      setCrosshair(prev => ({ ...prev, visible: false }));
      return;
    }

    // Calculer le prix à cette position Y
    const priceRange = getPriceRange();
    const priceRangeSpan = priceRange.max - priceRange.min;
    const price = priceRange.max - (y / rect.height) * priceRangeSpan;

    // Calculer l'index temporel à cette position X (relative to heatmap area)
    const heatmapX = x - heatmapStartX;
    const visiblePoints = Math.min(state.priceHistory.length, 200);
    const startIdx = state.priceHistory.length - visiblePoints;
    const pointWidth = actualHeatmapWidth / visiblePoints;
    const timeIndex = Math.floor(heatmapX / pointWidth) + startIdx;

    // Trouver les volumes bid/ask proches de ce prix
    const tickSize = config?.tickSize || 0.5;
    const roundedPrice = Math.round(price / tickSize) * tickSize;

    let bidVolume = 0;
    let askVolume = 0;

    for (const [orderPrice, order] of state.bids) {
      if (Math.abs(orderPrice - roundedPrice) < tickSize * 2) {
        bidVolume += order.displaySize;
      }
    }

    for (const [orderPrice, order] of state.asks) {
      if (Math.abs(orderPrice - roundedPrice) < tickSize * 2) {
        askVolume += order.displaySize;
      }
    }

    setCrosshair({
      x,
      y,
      price: roundedPrice,
      timeIndex,
      bidVolume,
      askVolume,
      visible: true,
    });
  }, [state, getPriceRange, config?.tickSize, nav.isDragging, nav.isAxisDragging, nav.dragStartY, nav.dragStartPanY, nav.axisStartY, nav.axisStartZoom, deltaProfileWidth, volumeProfileWidth, isDrawing]);

  // Mouse leave - hide crosshair
  const handleMouseLeave = useCallback(() => {
    setCrosshair(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: '#0a0c10' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{
          cursor: activeDrawingTool
            ? 'crosshair'
            : nav.isDragging
            ? 'grabbing'
            : nav.isAxisDragging
            ? 'ns-resize'
            : 'crosshair'
        }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={(e) => {
          handleMouseLeave();
          handleMouseUp();
        }}
      />


      {/* Loading */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90">
          <div className="text-zinc-400 text-sm">Chargement...</div>
        </div>
      )}

      {/* Info overlay */}
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <div className={`px-2 py-1 rounded text-[10px] font-mono ${
          dataMode === 'live'
            ? 'bg-emerald-900/80 text-emerald-300'
            : 'bg-amber-900/80 text-amber-300'
        }`}>
          {dataMode === 'live' ? `LIVE ${symbol.toUpperCase()}` : 'SIMULATION'}
        </div>
        {nav.zoomY !== 1 && (
          <div className="px-2 py-1 bg-zinc-800/80 rounded text-[10px] text-zinc-300 font-mono">
            {nav.zoomY.toFixed(1)}x
          </div>
        )}
        {!autoCenter && (
          <button
            onClick={() => setAutoCenter(true)}
            className="px-2 py-1 bg-amber-600/80 hover:bg-amber-500/80 rounded text-[10px] text-white font-mono transition-colors"
          >
            Re-center
          </button>
        )}
        <button
          onClick={() => openSettingsPanel({ x: 100, y: 100 })}
          className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-300 font-mono transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>

        {/* Data Mode Toggle */}
        <button
          onClick={() => setDataMode(m => m === 'simulation' ? 'live' : 'simulation')}
          className={`px-3 py-1 rounded text-[10px] font-bold font-mono transition-all ${
            dataMode === 'live'
              ? 'bg-emerald-600/90 text-white border border-emerald-500 shadow-lg shadow-emerald-500/20'
              : 'bg-amber-600/80 text-white border border-amber-500'
          }`}
          title={dataMode === 'live' ? 'Mode LIVE Binance - Cliquer pour Simulation' : 'Mode Simulation - Cliquer pour LIVE Binance'}
        >
          {dataMode === 'live' ? '● LIVE' : '◯ SIM'}
        </button>
      </div>

      {/* Advanced Settings Panel */}
      <LiquidityAdvancedSettings
        isOpen={isSettingsPanelOpen}
        onClose={closeSettingsPanel}
        initialPosition={{ x: 100, y: 100 }}
      />

      {/* Stats */}
      {state && (
        <div className="absolute bottom-12 left-2 flex items-center gap-2 text-[10px] font-mono">
          <div className="px-2 py-1 bg-cyan-900/50 rounded text-cyan-300">
            BID: {state.currentBid.toFixed(1)}
          </div>
          <div className="px-2 py-1 bg-red-900/50 rounded text-red-300">
            ASK: {state.currentAsk.toFixed(1)}
          </div>
          <div className="px-2 py-1 bg-emerald-900/50 rounded text-emerald-300">
            Buys: {state.trades.filter(t => t.side === 'buy').length}
          </div>
          <div className="px-2 py-1 bg-rose-900/50 rounded text-rose-300">
            Sells: {state.trades.filter(t => t.side === 'sell').length}
          </div>
          <div className="px-2 py-1 bg-amber-900/50 rounded text-amber-300">
            Zones: {state.interestZones?.size || 0}
          </div>
          <div className="px-2 py-1 bg-zinc-800/80 rounded text-zinc-400">
            Orders: {state.bids.size + state.asks.size}
          </div>
        </div>
      )}

      {/* Crosshair Info Panel */}
      {crosshair.visible && state && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(crosshair.x + 12, (containerRef.current?.offsetWidth || 0) - 160),
            top: Math.max(crosshair.y - 80, 10),
          }}
        >
          <div className="bg-zinc-900/95 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm">
            {/* Prix */}
            <div className="text-white font-mono text-sm font-semibold mb-1">
              {crosshair.price.toFixed(2)}
            </div>

            {/* Volumes */}
            <div className="flex items-center gap-3 text-[10px]">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-cyan-300">
                  {crosshair.bidVolume.toFixed(0)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-300">
                  {crosshair.askVolume.toFixed(0)}
                </span>
              </div>
            </div>

            {/* Delta */}
            {(crosshair.bidVolume > 0 || crosshair.askVolume > 0) && (
              <div className="mt-1 text-[9px] text-zinc-400">
                Delta:{' '}
                <span className={crosshair.bidVolume > crosshair.askVolume ? 'text-cyan-400' : 'text-red-400'}>
                  {(crosshair.bidVolume - crosshair.askVolume).toFixed(0)}
                </span>
              </div>
            )}

            {/* Distance from current price */}
            <div className="mt-1 text-[9px] text-zinc-500">
              {crosshair.price > state.currentAsk ? (
                <span>+{(crosshair.price - state.currentAsk).toFixed(1)} from ask</span>
              ) : crosshair.price < state.currentBid ? (
                <span>{(crosshair.price - state.currentBid).toFixed(1)} from bid</span>
              ) : (
                <span className="text-amber-400">In spread</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Légende */}
      <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1">
        {/* Contrôles */}
        <div className="flex items-center gap-2 text-[9px] text-zinc-500">
          <span>Scroll: Zoom Y</span>
          <span>|</span>
          <span>Shift+Scroll: Zoom X</span>
          <span>|</span>
          <span>Drag: Pan</span>
          <span>|</span>
          <span>Drag Price Axis: Zoom</span>
        </div>

        {/* Légende des états */}
        <div className="flex items-center gap-3 text-[8px]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-cyan-400 rounded" />
            <span className="text-cyan-400">Bid</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-red-400 rounded" />
            <span className="text-red-400">Ask</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-amber-400 rounded" />
            <span className="text-amber-400">Absorbed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-emerald-400 rounded" />
            <span className="text-emerald-400">Continuation</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-zinc-500 rounded" />
            <span className="text-zinc-500">Fading</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaircaseHeatmap;
