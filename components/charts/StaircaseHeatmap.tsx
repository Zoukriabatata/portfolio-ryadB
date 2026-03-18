'use client';

/**
 * STAIRCASE HEATMAP - Main React component
 *
 * Features:
 * - Bid/ask staircase line
 * - Trade bubbles
 * - Passive orders heatmap
 * - Zoom/pan navigation
 * - Interactive crosshair
 * - Simulation or Live (Binance) mode
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import { SimulationEngine } from '@/lib/heatmap-v2/SimulationEngine';
import { LiveDataEngine, resetLiveDataEngine } from '@/lib/heatmap-v2/LiveDataEngine';
import { HeatmapRenderer } from '@/lib/heatmap-v2/HeatmapRenderer';
import { MarketState, SimulationConfig, DrawingType, TradeFlowSettings as RendererTradeFlowSettings } from '@/lib/heatmap-v2/types';
import { HybridRenderer, adaptMarketState } from '@/lib/heatmap-webgl';
import { getVWAPEngine, type VWAPEngine } from '@/lib/orderflow/VWAPEngine';
import { getTradeAbsorptionEngine, type TradeAbsorptionEngine } from '@/lib/orderflow/TradeAbsorptionEngine';
import type { AbsorptionResult } from '@/types/passive-liquidity';
import type { KeyLevel } from '@/lib/heatmap-webgl/commands/KeyLevelsCommand';
import { detectImbalance } from '@/lib/calculations/imbalance';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import LiquidityAdvancedSettings from '@/components/settings/LiquidityAdvancedSettings';
import type { TimeSalesTrade } from '@/components/trading';

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
  zoomY: number;           // Vertical zoom (price)
  zoomX: number;           // Zoom horizontal (temps)
  // Pan offset
  panY: number;            // Vertical offset in price
  panX: number;            // Horizontal offset in time
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

const StaircaseHeatmapInner = React.memo(function StaircaseHeatmap({ height = 600, config, symbol = 'btcusdt', initialMode = 'simulation' }: StaircaseHeatmapProps) {
  const isActive = usePageActive();
  const canvas2DRef = useRef<HTMLCanvasElement>(null);
  const canvasWebGLRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webglContainerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<SimulationEngine | null>(null);
  const liveEngineRef = useRef<LiveDataEngine | null>(null);
  const rendererRef = useRef<HeatmapRenderer | null>(null);
  const webglRendererRef = useRef<HybridRenderer | null>(null);
  const animationRef = useRef<number>(0);
  const vwapEngineRef = useRef<VWAPEngine | null>(null);
  const absorptionEngineRef = useRef<TradeAbsorptionEngine | null>(null);
  const absorptionAlertsRef = useRef<{ price: number; volume: number; side: 'bid' | 'ask'; timestamp: number }[]>([]);
  const lastProcessedTradeCountRef = useRef<number>(0);

  // === PERF: Cached refs to avoid per-frame allocations ===
  // Fix 1: Imbalance throttle
  const imbalanceCacheRef = useRef<{ price: number; direction: 'bullish' | 'bearish'; ratio: number; isStrong: boolean }[]>([]);
  const lastImbalanceComputeRef = useRef<number>(0);
  // Fix 2: Incremental CVD
  const cvdPointsRef = useRef<{ time: number; delta: number }[]>([]);
  const cvdRunningDeltaRef = useRef<number>(0);
  const cvdLastTradeCountRef = useRef<number>(0);
  // Fix 3: VWAP cache
  const vwapKeyLevelsCacheRef = useRef<{ levels: KeyLevel[]; settings: { vwapColor: string; vwapBand1Color: string; vwapBand2Color: string; opacity: number } } | null>(null);
  const lastVwapPriceRef = useRef<number>(0);
  // Fix 4: Session stats key levels cache (POC, VAH, VAL, Session High/Low)
  const sessionKeyLevelsCacheRef = useRef<KeyLevel[]>([]);
  const lastSessionStatsPocRef = useRef<number>(0);
  // Fix 5: Absorption mapped cache
  const absorptionMappedRef = useRef<{ price: number; volume: number; side: 'bid' | 'ask'; timestamp: number; age: number }[]>([]);
  const lastAbsorptionFilterRef = useRef<number>(0);

  // Auto-follow animation
  const recenterAnimRef = useRef<{ startPanY: number; startTime: number } | null>(null);

  const [state, setState] = useState<MarketState | null>(null);
  const stateRef = useRef<MarketState | null>(null);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 800, height: 600 });
  const lastAdaptedStateRef = useRef<MarketState | null>(null);
  const cachedRenderDataRef = useRef<ReturnType<typeof adaptMarketState> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>(initialMode);
  const [activeDrawingTool, setActiveDrawingTool] = useState<DrawingType | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Track actual rendering mode (may differ from preference if WebGL fails)
  const [actuallyUsingWebGL, setActuallyUsingWebGL] = useState(false);

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
    useWebGL,
    setUseWebGL,
    contrast,
    upperCutoffPercent,
    bestBidColor,
    bestAskColor,
    colorScheme,
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
    staircaseLine,
    grid: gridSettings,
    passiveOrders: passiveOrderSettings,
    timeSales: timeSalesSettings,
    deltaProfile: deltaProfileSettings,
    keyLevels: keyLevelsSettings,
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

  // Convert MarketState trades to TimeSalesPanel format
  const timeSalesTrades = useMemo<TimeSalesTrade[]>(() => {
    if (!state) return [];
    return state.trades.map((trade, index) => ({
      id: `${trade.timestamp}-${index}`,
      timestamp: trade.timestamp,
      price: trade.price,
      size: trade.size,
      side: trade.side,
    }));
  }, [state?.trades]);

  const [crosshair, setCrosshair] = useState<CrosshairInfo>({
    x: 0,
    y: 0,
    price: 0,
    timeIndex: 0,
    bidVolume: 0,
    askVolume: 0,
    visible: false,
  });
  // PERF: Ref for render loop (avoids re-render on mouse move)
  const crosshairRef = useRef<CrosshairInfo>(crosshair);
  const lastCrosshairUpdateRef = useRef<number>(0);
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
  // Keep a ref in sync so the render loop can access panX without re-creating
  const navRef = useRef(nav);
  navRef.current = nav;

  // Price range
  const priceAxisWidth = 60;
  const deltaProfileWidth = showDeltaProfile ? 80 : 0;
  const volumeProfileWidth = showVolumeProfile ? 60 : 0;
  const lastPriceRangeKeyRef = useRef<string>('');

  const getPriceRange = useCallback(() => {
    const tickSize = config?.tickSize || 0.5;
    const depth = config?.orderBookDepth || 30;
    // Default range shows 3x the orderbook depth for wider view
    const defaultRange = depth * tickSize * 3;
    const range = defaultRange / nav.zoomY;

    if (!state) {
      const fallbackCenter = config?.basePrice || 100;
      return { min: fallbackCenter - range / 2, max: fallbackCenter + range / 2 };
    }

    // Animated re-center: ease-out 300ms panY → 0
    let effectivePanY = autoCenter ? 0 : nav.panY;
    if (autoCenter && recenterAnimRef.current) {
      const elapsed = performance.now() - recenterAnimRef.current.startTime;
      const duration = 300;
      if (elapsed >= duration) {
        recenterAnimRef.current = null;
        effectivePanY = 0;
      } else {
        const t = elapsed / duration;
        const easeOut = 1 - Math.pow(1 - t, 3); // Cubic ease-out
        effectivePanY = recenterAnimRef.current.startPanY * (1 - easeOut);
      }
    }
    const center = state.midPrice + effectivePanY;

    return {
      min: center - range / 2,
      max: center + range / 2,
    };
  }, [state, nav.zoomY, nav.panY, autoCenter, config?.tickSize, config?.basePrice, config?.orderBookDepth]);

  // Initialisation - based on dataMode
  useEffect(() => {
    if (!containerRef.current) return;

    // Cleanup previous engines
    simulationRef.current?.destroy();
    liveEngineRef.current?.destroy();
    simulationRef.current = null;
    liveEngineRef.current = null;

    // Initialize VWAP engine
    vwapEngineRef.current = getVWAPEngine();
    vwapEngineRef.current.reset();
    lastProcessedTradeCountRef.current = 0;

    // Initialize absorption engine
    absorptionEngineRef.current = getTradeAbsorptionEngine();
    absorptionAlertsRef.current = [];

    let usingWebGL = false;

    try {
      // Create the appropriate renderer
      if (useWebGL && canvasWebGLRef.current && webglContainerRef.current) {
        // ═══════════════════════════════════════════════════════════════
        // MODE WEBGL (tentative)
        // ═══════════════════════════════════════════════════════════════
        try {
          if (!webglRendererRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            webglRendererRef.current = new HybridRenderer({
              canvas: canvasWebGLRef.current,
              container: webglContainerRef.current,
              width: rect.width,
              height: rect.height,
              priceAxisWidth: priceAxisWidth,
              deltaProfileWidth: deltaProfileWidth,
              volumeProfileWidth: volumeProfileWidth,
            });
          }
          // Verify WebGL actually initialized
          if (webglRendererRef.current.isWebGL) {
            usingWebGL = true;
          } else {
            throw new Error('WebGL not available in HybridRenderer');
          }
        } catch (webglError) {
          // Destroy failed WebGL renderer
          webglRendererRef.current?.destroy();
          webglRendererRef.current = null;
          usingWebGL = false;
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // MODE CANVAS 2D (fallback or explicit)
      // ═══════════════════════════════════════════════════════════════
      if (!usingWebGL && canvas2DRef.current) {
        if (!rendererRef.current) {
          rendererRef.current = new HeatmapRenderer(canvas2DRef.current);
        }
        rendererRef.current.setTickSize(config?.tickSize || 0.5);
      }

      setActuallyUsingWebGL(usingWebGL);

      if (dataMode === 'simulation') {
        // ═══════════════════════════════════════════════════════════════
        // MODE SIMULATION
        // ═══════════════════════════════════════════════════════════════
        simulationRef.current = new SimulationEngine(config);
        simulationRef.current.setOnUpdate((newState) => {
          stateRef.current = newState;
          setState(newState);
        });
        simulationRef.current.start();

      } else {
        // ═══════════════════════════════════════════════════════════════
        // MODE LIVE (Binance)
        // ═══════════════════════════════════════════════════════════════
        resetLiveDataEngine(); // Reset singleton to apply new config
        liveEngineRef.current = new LiveDataEngine({
          ...config,
          symbol,
          basePrice: config?.basePrice || 100,
          tickSize: config?.tickSize || 0.5,
        });
        liveEngineRef.current.setOnUpdate((newState) => {
          stateRef.current = newState;
          setState(newState);
        });
        liveEngineRef.current.start();
      }

      setIsReady(true);

    } catch {
      // Initialization failed silently - fallback UI will show
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      simulationRef.current?.destroy();
      liveEngineRef.current?.destroy();
      rendererRef.current?.destroy();
      webglRendererRef.current?.destroy();
      rendererRef.current = null;
      webglRendererRef.current = null;
    };
  }, [dataMode, symbol, useWebGL, priceAxisWidth, deltaProfileWidth, volumeProfileWidth, config?.tickSize, config?.basePrice]);

  // Pause/resume simulation engine when page visibility changes
  useEffect(() => {
    if (isActive) {
      simulationRef.current?.start();
      liveEngineRef.current?.start();
    } else {
      simulationRef.current?.stop();
    }
  }, [isActive]);

  // PERF: Cache container size (updated on resize only, not every frame)
  // Uses ResizeObserver to detect container size changes (layout shifts, height prop changes)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      containerSizeRef.current = { width: rect.width, height: rect.height };
      // Also resize the WebGL renderer when container size changes
      if (actuallyUsingWebGL && webglRendererRef.current) {
        webglRendererRef.current.resize(rect.width, rect.height);
      }
    };

    updateSize();

    const ro = new ResizeObserver(updateSize);
    ro.observe(el);

    return () => ro.disconnect();
  }, [actuallyUsingWebGL]);

  // Render loop (decoupled from React state via stateRef)
  useEffect(() => {
    if (!isActive) return;
    const render = () => {
      const currentState = stateRef.current;
      if (currentState) {
        const priceRange = getPriceRange();

        if (actuallyUsingWebGL && webglRendererRef.current) {
          // ═══════════════════════════════════════════════════════════════
          // WEBGL RENDERING
          // ═══════════════════════════════════════════════════════════════

          // Recompute adaptMarketState when state, priceRange, or panX changes
          const currentPanX = navRef.current.panX;
          const cacheKey = `${priceRange.min.toFixed(2)}_${priceRange.max.toFixed(2)}_${currentPanX.toFixed(0)}`;
          if (currentState !== lastAdaptedStateRef.current || cacheKey !== lastPriceRangeKeyRef.current) {
            lastAdaptedStateRef.current = currentState;
            lastPriceRangeKeyRef.current = cacheKey;
            cachedRenderDataRef.current = adaptMarketState(currentState, priceRange, {
              width: containerSizeRef.current.width,
              height: containerSizeRef.current.height,
              tickSize: config?.tickSize || 0.5,
              contrast: contrast,
              upperCutoff: upperCutoffPercent / 100,
              colors: {
                bidColor: bestBidColor,
                askColor: bestAskColor,
                buyColor: tradeFlowSettings.buyColor,
                sellColor: tradeFlowSettings.sellColor,
                gridColor: 'rgba(255, 255, 255, 0.05)',
              },
              showGrid: true,
              gridStep: (config?.tickSize || 0.5) * 10,
              showDeltaProfile,
              showVolumeProfile,
              deltaProfileMode: deltaProfileSettings?.mode,
              priceAxisWidth,
              deltaProfileWidth,
              volumeProfileWidth,
              panX: currentPanX,
            });
          }

          if (!cachedRenderDataRef.current) {
            animationRef.current = requestAnimationFrame(render);
            return;
          }

          const renderData = cachedRenderDataRef.current;

          // Add staircase line settings
          if (staircaseLine) {
            renderData.staircaseSettings = staircaseLine;
          }

          // Add grid settings
          if (gridSettings) {
            renderData.gridSettings = gridSettings;
          }

          // Add passive order settings
          if (passiveOrderSettings) {
            renderData.passiveOrderSettings = passiveOrderSettings;
          }

          // Add trade bubble settings
          renderData.tradeBubbleSettings = {
            showBorder: (tradeFlowSettings.bubbleBorderWidth ?? 1.5) > 0,
            borderWidth: (tradeFlowSettings.bubbleBorderWidth ?? 1.5) / 100, // Normalize for shader
            borderColor: tradeFlowSettings.bubbleBorderColor === 'auto'
              ? 'rgba(255, 255, 255, 0.5)'
              : tradeFlowSettings.bubbleBorderColor,
            glowEnabled: tradeFlowSettings.glowEnabled ?? true,
            glowIntensity: tradeFlowSettings.glowIntensity ?? 0.6,
            showGradient: tradeFlowSettings.showGradient ?? true,
            rippleEnabled: tradeFlowSettings.rippleEnabled ?? true,
            largeTradeThreshold: tradeFlowSettings.largeTradeThreshold ?? 2.0,
            sizeScaling: tradeFlowSettings.sizeScaling ?? 'sqrt',
            popInAnimation: tradeFlowSettings.popInAnimation ?? true,
            bubbleOpacity: tradeFlowSettings.bubbleOpacity ?? 0.7,
            maxSize: (tradeFlowSettings.bubbleSize ?? 0.6) * 80, // Base max size scaled
            minSize: 8,
          };

          // Add delta profile settings to render data
          if (renderData.deltaProfile && deltaProfileSettings) {
            renderData.deltaProfile.settings = {
              mode: deltaProfileSettings.mode,
              opacity: deltaProfileSettings.opacity,
              bidColor: deltaProfileSettings.bidColor || undefined,
              askColor: deltaProfileSettings.askColor || undefined,
              highlightPOC: deltaProfileSettings.highlightPOC,
              showCenterLine: deltaProfileSettings.showCenterLine,
              showLabels: deltaProfileSettings.showLabels,
            };
          }

          // Add session stats for stats bar (delta, trades/s)
          {
            const ss = currentState.sessionStats;
            const elapsed = (Date.now() - ss.sessionStart) / 1000;
            renderData.sessionStats = {
              delta: ss.delta,
              deltaPercent: ss.deltaPercent,
              totalTrades: ss.totalTrades,
              tradesPerSecond: elapsed > 0 ? ss.totalTrades / elapsed : 0,
            };
          }

          // Add crosshair data (read from ref to avoid re-renders)
          const ch = crosshairRef.current;
          if (ch.visible) {
            renderData.crosshair = {
              x: ch.x,
              y: ch.y,
              price: ch.price,
              visible: true,
            };
          }

          // ═══════════════════════════════════════════════════════════════
          // VWAP BANDS - Feed trades to VWAPEngine, generate key levels
          // ═══════════════════════════════════════════════════════════════
          if (showVWAP && vwapEngineRef.current && currentState.trades.length > 0) {
            // Feed new trades since last frame
            const newTradeCount = currentState.trades.length;
            if (newTradeCount > lastProcessedTradeCountRef.current) {
              // Process new trades by index (no .slice() allocation)
              for (let i = lastProcessedTradeCountRef.current; i < newTradeCount; i++) {
                const trade = currentState.trades[i];
                vwapEngineRef.current.processTrade({
                  timestamp: trade.timestamp,
                  price: trade.price,
                  size: trade.size,
                  side: trade.side,
                });
              }
              lastProcessedTradeCountRef.current = newTradeCount;
            }

            const vwapPrice = vwapEngineRef.current.getVWAP();
            if (vwapPrice > 0) {
              // Only rebuild if VWAP price changed (avoid per-frame allocations)
              if (vwapPrice !== lastVwapPriceRef.current) {
                lastVwapPriceRef.current = vwapPrice;
                const bands = vwapEngineRef.current.getBands([1, 2]);
                const levels: KeyLevel[] = [
                  { price: vwapPrice, type: 'vwap', label: 'VWAP' },
                ];
                if (bands.length >= 1 && bands[0].upperBand > 0) {
                  levels.push(
                    { price: bands[0].upperBand, type: 'vwapBand1', label: '+1σ' },
                    { price: bands[0].lowerBand, type: 'vwapBand1', label: '-1σ' },
                  );
                }
                if (bands.length >= 2 && bands[1].upperBand > 0) {
                  levels.push(
                    { price: bands[1].upperBand, type: 'vwapBand2', label: '+2σ' },
                    { price: bands[1].lowerBand, type: 'vwapBand2', label: '-2σ' },
                  );
                }
                vwapKeyLevelsCacheRef.current = {
                  levels,
                  settings: {
                    vwapColor: '#06b6d4',
                    vwapBand1Color: '#0891b2',
                    vwapBand2Color: '#0e7490',
                    opacity: 0.8,
                  },
                };
              }
              // VWAP levels are merged with session levels below
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // SESSION KEY LEVELS - POC, VAH, VAL, Session High/Low
          // ═══════════════════════════════════════════════════════════════
          {
            const ss = currentState.sessionStats;
            // Only rebuild when POC changes (throttle per-frame allocations)
            if (ss.poc !== lastSessionStatsPocRef.current) {
              lastSessionStatsPocRef.current = ss.poc;
              const levels: KeyLevel[] = [];
              if (keyLevelsSettings.showPOC && ss.poc > 0) {
                levels.push({ price: ss.poc, type: 'poc', label: 'POC' });
              }
              if (keyLevelsSettings.showVAH && ss.vah > 0) {
                levels.push({ price: ss.vah, type: 'vah', label: 'VAH' });
              }
              if (keyLevelsSettings.showVAL && ss.val > 0) {
                levels.push({ price: ss.val, type: 'val', label: 'VAL' });
              }
              if (keyLevelsSettings.showSessionHighLow) {
                if (ss.sessionHigh > 0) levels.push({ price: ss.sessionHigh, type: 'sessionHigh', label: 'High' });
                if (ss.sessionLow < Infinity) levels.push({ price: ss.sessionLow, type: 'sessionLow', label: 'Low' });
              }
              sessionKeyLevelsCacheRef.current = levels;
            }

            // Merge session key levels with VWAP key levels
            const allLevels: KeyLevel[] = [...sessionKeyLevelsCacheRef.current];
            if (vwapKeyLevelsCacheRef.current) {
              allLevels.push(...vwapKeyLevelsCacheRef.current.levels);
            }
            if (allLevels.length > 0) {
              renderData.keyLevels = {
                levels: allLevels,
                settings: {
                  pocColor: '#f59e0b',
                  vahColor: '#8b5cf6',
                  valColor: '#8b5cf6',
                  vwapColor: '#06b6d4',
                  vwapBand1Color: '#0891b2',
                  vwapBand2Color: '#0e7490',
                  sessionHighColor: '#22d3ee',
                  sessionLowColor: '#fb7185',
                  roundNumberColor: '#fbbf24',
                  opacity: 0.8,
                },
              };
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // IMBALANCE MARKERS - Detect bid/ask imbalances (throttled 500ms)
          // ═══════════════════════════════════════════════════════════════
          if (showImbalances) {
            const now = performance.now();
            if (now - lastImbalanceComputeRef.current > 500) {
              lastImbalanceComputeRef.current = now;
              const tickSize = config?.tickSize || 0.5;
              const priceRange = getPriceRange();

              // Pre-build price->volume Maps: O(m) instead of O(n*m)
              const bidByPrice = new Map<number, number>();
              for (const [orderPrice, order] of currentState.bids) {
                const snapped = Math.round(orderPrice / tickSize) * tickSize;
                bidByPrice.set(snapped, (bidByPrice.get(snapped) || 0) + order.displaySize);
              }
              const askByPrice = new Map<number, number>();
              for (const [orderPrice, order] of currentState.asks) {
                const snapped = Math.round(orderPrice / tickSize) * tickSize;
                askByPrice.set(snapped, (askByPrice.get(snapped) || 0) + order.displaySize);
              }

              const markers: typeof imbalanceCacheRef.current = [];
              for (let price = Math.floor(priceRange.min / tickSize) * tickSize; price <= priceRange.max; price += tickSize) {
                const bidVol = bidByPrice.get(price) || 0;
                const askVol = askByPrice.get(price) || 0;
                if (bidVol > 0 || askVol > 0) {
                  const result = detectImbalance(bidVol, askVol, 3.0);
                  if (result.isStrong) {
                    markers.push({ price, direction: result.direction as 'bullish' | 'bearish', ratio: result.ratio, isStrong: true });
                  }
                }
              }
              imbalanceCacheRef.current = markers;
            }
            if (imbalanceCacheRef.current.length > 0) {
              renderData.imbalanceMarkers = imbalanceCacheRef.current;
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // CVD - Cumulative Volume Delta (incremental)
          // ═══════════════════════════════════════════════════════════════
          if (showCumulativeDelta && currentState.trades.length > 0) {
            const currentCount = currentState.trades.length;

            // Detect if trades array was trimmed/reset (LiveDataEngine filters old trades)
            if (currentCount < cvdLastTradeCountRef.current) {
              cvdRunningDeltaRef.current = 0;
              cvdPointsRef.current = [];
              cvdLastTradeCountRef.current = 0;
            }

            // Only process new trades (same pattern as VWAP)
            if (currentCount > cvdLastTradeCountRef.current) {
              for (let i = cvdLastTradeCountRef.current; i < currentCount; i++) {
                const trade = currentState.trades[i];
                cvdRunningDeltaRef.current += trade.side === 'buy' ? trade.size : -trade.size;
                cvdPointsRef.current.push({ time: trade.timestamp, delta: cvdRunningDeltaRef.current });
              }
              cvdLastTradeCountRef.current = currentCount;

              // Trim old points (keep last 30s) - splice instead of shift loop to avoid O(n²)
              const cutoff = Date.now() - 30000;
              let trimCount = 0;
              while (trimCount < cvdPointsRef.current.length && cvdPointsRef.current[trimCount].time < cutoff) {
                trimCount++;
              }
              if (trimCount > 0) {
                cvdPointsRef.current.splice(0, trimCount);
              }
            }

            if (cvdPointsRef.current.length > 0) {
              renderData.cvdData = { points: cvdPointsRef.current };
            }
          }

          // ═══════════════════════════════════════════════════════════════
          // ABSORPTION ALERTS - Show recent absorption events (throttled)
          // ═══════════════════════════════════════════════════════════════
          if (showAbsorption) {
            const now = Date.now();
            // Only filter expired every 500ms (avoid per-frame array allocation)
            if (now - lastAbsorptionFilterRef.current > 500) {
              lastAbsorptionFilterRef.current = now;
              absorptionAlertsRef.current = absorptionAlertsRef.current.filter(a => now - a.timestamp < 5000);
            }
            if (absorptionAlertsRef.current.length > 0) {
              // Update age in-place, reuse array
              const mapped = absorptionMappedRef.current;
              mapped.length = absorptionAlertsRef.current.length;
              for (let i = 0; i < absorptionAlertsRef.current.length; i++) {
                const a = absorptionAlertsRef.current[i];
                if (mapped[i]) {
                  mapped[i].price = a.price;
                  mapped[i].volume = a.volume;
                  mapped[i].side = a.side;
                  mapped[i].timestamp = a.timestamp;
                  mapped[i].age = (now - a.timestamp) / 5000;
                } else {
                  mapped[i] = { price: a.price, volume: a.volume, side: a.side, timestamp: a.timestamp, age: (now - a.timestamp) / 5000 };
                }
              }
              renderData.absorptionAlerts = mapped;
            }
          }

          webglRendererRef.current.render(renderData);
        } else if (rendererRef.current) {
          // ═══════════════════════════════════════════════════════════════
          // CANVAS 2D RENDERING
          // ═══════════════════════════════════════════════════════════════
          const ch2d = crosshairRef.current;
          rendererRef.current.render(
            currentState,
            priceRange,
            ch2d.visible ? ch2d : null,
            rendererTradeFlowSettings
          );
        }
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, getPriceRange, rendererTradeFlowSettings, actuallyUsingWebGL, contrast, upperCutoffPercent, bestBidColor, bestAskColor, tradeFlowSettings.buyColor, tradeFlowSettings.sellColor, config?.tickSize, showDeltaProfile, showVolumeProfile]);

  // Resize — on window resize AND when height prop changes
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (actuallyUsingWebGL && webglRendererRef.current) {
          webglRendererRef.current.resize(rect.width, rect.height);
        } else {
          rendererRef.current?.resize();
        }
        containerSizeRef.current = { width: rect.width, height: rect.height };
      }
    };

    // Resize immediately when height prop changes
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [actuallyUsingWebGL, height]);

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

  // Animate re-center when autoCenter is toggled on
  useEffect(() => {
    if (autoCenter && nav.panY !== 0) {
      recenterAnimRef.current = { startPanY: nav.panY, startTime: performance.now() };
    }
  }, [autoCenter]);

  // Update color theme when colorScheme changes
  useEffect(() => {
    if (webglRendererRef.current) {
      webglRendererRef.current.setTheme(colorScheme);
    }
  }, [colorScheme]);

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

  // Subscribe to absorption events for WebGL overlay alerts
  useEffect(() => {
    if (!showAbsorption || !absorptionEngineRef.current) return;
    const unsubscribe = absorptionEngineRef.current.onAbsorption((result: AbsorptionResult) => {
      if (result.volumeAbsorbed > 0 && result.affectedLevel) {
        absorptionAlertsRef.current.push({
          price: result.affectedLevel.price,
          volume: result.volumeAbsorbed,
          side: result.affectedLevel.side,
          timestamp: Date.now(),
        });
        // Cap at 20 active alerts
        if (absorptionAlertsRef.current.length > 20) {
          absorptionAlertsRef.current = absorptionAlertsRef.current.slice(-20);
        }
      }
    });
    return () => unsubscribe();
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

      // Toggle shortcuts overlay
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      // Escape - cancel drawing, deselect, or close shortcuts
      if (e.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
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

      // Navigation shortcuts
      if (e.key === ' ') {
        e.preventDefault();
        setAutoCenter(!autoCenter);
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setNav(prev => ({ ...prev, zoomY: Math.min(10, prev.zoomY * 1.2) }));
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        setNav(prev => ({ ...prev, zoomY: Math.max(0.1, prev.zoomY / 1.2) }));
        return;
      }
      if (e.key === 'Home' || e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setNav(prev => ({ ...prev, zoomY: 1, zoomX: 1, panY: 0, panX: 0 }));
        setAutoCenter(true);
        return;
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
  }, [isDrawing, state, autoCenter, setAutoCenter, showShortcuts]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;

    // Ctrl/Cmd + scroll = horizontal zoom (time)
    if (e.ctrlKey || e.metaKey) {
      setNav(prev => ({
        ...prev,
        zoomX: Math.max(0.1, Math.min(10, prev.zoomX * factor)),
      }));
    } else {
      // Vertical zoom (price)
      setNav(prev => ({
        ...prev,
        zoomY: Math.max(0.1, Math.min(10, prev.zoomY * factor)),
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
  }, [setAutoCenter]);

  // Mouse down - start drag or drawing
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current || !state) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const heatmapEndX = rect.width - priceAxisWidth - volumeProfileWidth;

    // Drawing tools only available in Canvas 2D mode
    if (!actuallyUsingWebGL && rendererRef.current) {
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
    }

    // Click on price axis or volume profile = drag to zoom
    if (x > heatmapEndX) {
      setNav(prev => ({
        ...prev,
        isAxisDragging: true,
        axisStartY: e.clientY,
        axisStartZoom: prev.zoomY,
      }));
    } else {
      // Click on chart = pan
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
    if (!containerRef.current || !state) return;

    const rect = containerRef.current.getBoundingClientRect();
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
      const newZoom = Math.max(0.1, Math.min(10, nav.axisStartZoom * zoomFactor));
      setNav(prev => ({ ...prev, zoomY: newZoom }));
      return;
    }

    // Handle chart dragging (pan X + Y)
    if (nav.isDragging) {
      const priceRange = getPriceRange();
      const pricePerPixel = (priceRange.max - priceRange.min) / rect.height;

      const deltaY = e.clientY - nav.dragStartY;
      const deltaPriceY = deltaY * pricePerPixel;

      const deltaX = e.clientX - nav.dragStartX;

      setNav(prev => ({
        ...prev,
        panY: prev.dragStartPanY + deltaPriceY,
        panX: prev.dragStartPanX + deltaX,
      }));
      return;
    }

    // Ignore crosshair on price axis or delta profile
    if (x > heatmapEndX || x < heatmapStartX) {
      crosshairRef.current = { ...crosshairRef.current, visible: false };
      setCrosshair(prev => ({ ...prev, visible: false }));
      return;
    }

    // Calculate price at this Y position
    const priceRange = getPriceRange();
    const priceRangeSpan = priceRange.max - priceRange.min;
    const price = priceRange.max - (y / rect.height) * priceRangeSpan;

    // Calculate time index at this X position (relative to heatmap area)
    const heatmapX = x - heatmapStartX;
    const visiblePoints = Math.min(state.priceHistory.length, 200);
    const startIdx = state.priceHistory.length - visiblePoints;
    const pointWidth = actualHeatmapWidth / visiblePoints;
    const timeIndex = Math.floor(heatmapX / pointWidth) + startIdx;

    // Find bid/ask volumes near this price
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

    // PERF: Update ref immediately (for render loop), throttle React state (for tooltip)
    const newCrosshair: CrosshairInfo = {
      x,
      y,
      price: roundedPrice,
      timeIndex,
      bidVolume,
      askVolume,
      visible: true,
    };
    crosshairRef.current = newCrosshair;

    // Throttle React state updates to ~16ms (60fps)
    const now = performance.now();
    if (now - lastCrosshairUpdateRef.current > 16) {
      lastCrosshairUpdateRef.current = now;
      setCrosshair(newCrosshair);
    }
  }, [state, getPriceRange, config?.tickSize, nav.isDragging, nav.isAxisDragging, nav.dragStartY, nav.dragStartPanY, nav.axisStartY, nav.axisStartZoom, deltaProfileWidth, volumeProfileWidth, isDrawing]);

  // Mouse leave - hide crosshair
  const handleMouseLeave = useCallback(() => {
    crosshairRef.current = { ...crosshairRef.current, visible: false };
    setCrosshair(prev => ({ ...prev, visible: false }));
  }, []);

  const canvasCursor = activeDrawingTool
    ? 'crosshair'
    : nav.isDragging
    ? 'grabbing'
    : nav.isAxisDragging
    ? 'ns-resize'
    : 'crosshair';

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height, background: '#050510' }}
    >
      {/* Canvas 2D (visible when not using WebGL) */}
      <canvas
        ref={canvas2DRef}
        className="absolute inset-0 w-full h-full block"
        style={{
          cursor: canvasCursor,
          display: actuallyUsingWebGL ? 'none' : 'block',
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

      {/* Canvas WebGL (visible when using WebGL) */}
      <canvas
        ref={canvasWebGLRef}
        className="absolute inset-0 w-full h-full block"
        style={{
          cursor: canvasCursor,
          display: actuallyUsingWebGL ? 'block' : 'none',
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

      {/* WebGL overlay container (for Canvas2DOverlay text) */}
      <div
        ref={webglContainerRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: actuallyUsingWebGL ? 2 : -1 }}
      />


      {/* Loading skeleton */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-1.5">
              {Array.from({ length: 10 }, (_, i) => (
                <div
                  key={i}
                  className="w-10 rounded animate-pulse"
                  style={{
                    height: `${80 + Math.sin(i * 0.8) * 40}px`,
                    background: `linear-gradient(to top, rgba(6,182,212,0.15), rgba(34,197,94,0.2), rgba(245,158,11,0.1))`,
                    animationDelay: `${i * 80}ms`,
                    animationDuration: '1.5s',
                  }}
                />
              ))}
            </div>
            <div className="text-zinc-500 text-xs font-mono animate-pulse">
              {dataMode === 'live' ? `Connecting to ${symbol.toUpperCase()}...` : 'Initializing simulation...'}
            </div>
          </div>
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
        {(nav.zoomY !== 1 || nav.zoomX !== 1) && (
          <button
            onClick={() => setNav(prev => ({ ...prev, zoomY: 1, zoomX: 1 }))}
            className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-300 font-mono transition-colors cursor-pointer"
            title="Click to reset zoom"
          >
            {nav.zoomY !== 1 && <span>Y:{nav.zoomY.toFixed(1)}x</span>}
            {nav.zoomY !== 1 && nav.zoomX !== 1 && <span className="mx-0.5 text-zinc-500">|</span>}
            {nav.zoomX !== 1 && <span>X:{nav.zoomX.toFixed(1)}x</span>}
          </button>
        )}
        {!autoCenter && (
          <button
            onClick={() => setAutoCenter(true)}
            className="px-2 py-1 bg-amber-600/80 hover:bg-amber-500/80 rounded text-[10px] text-white font-mono transition-colors"
          >
            Re-center
          </button>
        )}
        {(nav.zoomY !== 1 || nav.zoomX !== 1 || nav.panY !== 0 || nav.panX !== 0) && (
          <button
            onClick={() => {
              setNav(prev => ({ ...prev, zoomY: 1, zoomX: 1, panY: 0, panX: 0 }));
              setAutoCenter(true);
            }}
            className="px-2 py-1 bg-blue-600/80 hover:bg-blue-500/80 rounded text-[10px] text-white font-mono transition-colors"
          >
            Reset View
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            openSettingsPanel({ x: 100, y: 100 });
          }}
          className="px-2 py-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded text-[10px] text-zinc-300 font-mono transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </button>

        {/* WebGL Toggle */}
        <button
          onClick={() => setUseWebGL(!useWebGL)}
          className={`px-2 py-1 rounded text-[10px] font-bold font-mono transition-all flex items-center gap-1 ${
            actuallyUsingWebGL
              ? 'bg-purple-600/90 text-white border border-purple-500 shadow-lg shadow-purple-500/20'
              : 'bg-zinc-700/80 text-zinc-400 border border-zinc-600'
          }`}
          title={actuallyUsingWebGL
            ? 'WebGL active - Click for Canvas 2D'
            : useWebGL && !actuallyUsingWebGL
              ? 'WebGL requested but unavailable (Canvas 2D fallback)'
              : 'Canvas 2D active - Click for WebGL'
          }
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12,2 2,7 12,12 22,7" />
            <polyline points="2,17 12,22 22,17" />
            <polyline points="2,12 12,17 22,12" />
          </svg>
          {actuallyUsingWebGL ? 'WebGL' : '2D'}
          {useWebGL && !actuallyUsingWebGL && <span className="text-amber-400">!</span>}
        </button>

        {/* Data Mode Toggle */}
        <button
          onClick={() => setDataMode(m => m === 'simulation' ? 'live' : 'simulation')}
          className={`px-3 py-1 rounded text-[10px] font-bold font-mono transition-all ${
            dataMode === 'live'
              ? 'bg-emerald-600/90 text-white border border-emerald-500 shadow-lg shadow-emerald-500/20'
              : 'bg-amber-600/80 text-white border border-amber-500'
          }`}
          title={dataMode === 'live' ? 'LIVE Binance - Click for Simulation' : 'Simulation - Click for LIVE Binance'}
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
            {/* Price */}
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

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex flex-col items-end gap-1">
        {/* Controls */}
        <div className="flex items-center gap-2 text-[9px] text-zinc-500">
          <span>Scroll: Zoom</span>
          <span>|</span>
          <span>Ctrl+Scroll: Zoom X</span>
          <span>|</span>
          <span>Drag: Pan</span>
          <span>|</span>
          <span>DblClick: Reset</span>
          <span>|</span>
          <button onClick={() => setShowShortcuts(true)} className="hover:text-zinc-300 transition-colors">
            ? Shortcuts
          </button>
        </div>

        {/* State legend */}
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

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowShortcuts(false)}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-400 hover:text-white text-lg leading-none">&times;</button>
            </div>
            <div className="space-y-1.5 text-sm">
              {[
                ['Space', 'Toggle auto-center'],
                ['+  /  -', 'Zoom in / out'],
                ['F  /  Home', 'Reset view'],
                ['V', 'Select tool'],
                ['H', 'Horizontal line'],
                ['T', 'Trendline'],
                ['R', 'Rectangle'],
                ['X', 'Text annotation'],
                ['Esc', 'Cancel / deselect'],
                ['Del', 'Delete selected'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 min-w-[70px] text-center">{key}</kbd>
                  <span className="text-zinc-400 text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Time & Sales rendered by Canvas2D renderer (HeatmapRenderer.renderTimeSales) */}
    </div>
  );
});

export { StaircaseHeatmapInner as StaircaseHeatmap };
export default StaircaseHeatmapInner;
