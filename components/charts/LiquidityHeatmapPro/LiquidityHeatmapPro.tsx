'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { usePageActive } from '@/hooks/usePageActive';
import { useHeatmapSettingsStore } from '@/stores/useHeatmapSettingsStore';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useTradeStore, startTradeCleanup, stopTradeCleanup } from '@/stores/useTradeStore';
import { binanceWS } from '@/lib/websocket/BinanceWS';
import { HeatmapRenderer } from '@/lib/heatmap/HeatmapRenderer';
import { HeatmapZoomController } from '@/lib/heatmap/HeatmapZoomController';
import { TradeFlowRenderer } from './TradeFlowRenderer';
import { HeatmapSettingsPanel } from './HeatmapSettingsPanel';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { PassiveLiquiditySimulator } from '@/lib/orderflow/PassiveLiquiditySimulator';
import { TapeVelocityEngine } from '@/lib/heatmap/analytics/TapeVelocityEngine';
import { TapeSpeedMeter, StopRunAlert } from '@/components/widgets/TapeSpeedMeter';
import type { TapeVelocityStats } from '@/lib/heatmap/analytics/TapeVelocityEngine';
import type { PassiveOrderLevel, AbsorptionResult, PassiveOrderSide } from '@/types/passive-liquidity';
import type { AbsorptionLevelEvent } from '@/lib/heatmap/rendering/AbsorptionLevelMarker';
import type { HeatmapStats, PriceRange } from '@/types/heatmap';
import type { Point, ContextMenuState, OrderbookSnapshot } from './types';
import { DEFAULT_RENDER_CONFIG } from './types';

interface LiquidityHeatmapProProps {
  height?: number;
  priceRangeTicks?: number;
}

export const LiquidityHeatmapPro = React.memo(function LiquidityHeatmapPro({
  height = 600,
  priceRangeTicks = 100,
}: LiquidityHeatmapProProps) {
  const isActive = usePageActive();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HeatmapRenderer | null>(null);
  const zoomControllerRef = useRef<HeatmapZoomController | null>(null);
  const tradeFlowRendererRef = useRef<TradeFlowRenderer | null>(null);
  const passiveSimulatorRef = useRef<PassiveLiquiditySimulator | null>(null);
  const tapeVelocityRef = useRef<TapeVelocityEngine | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const targetFPS = 60; // 60 FPS
  const frameInterval = 1000 / targetFPS;

  // State
  const [mousePosition, setMousePosition] = useState<Point | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');
  const [isOverPriceAxis, setIsOverPriceAxis] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    priceAtCursor: null,
  });

  // Right-click pan state
  const [isRightDragging, setIsRightDragging] = useState(false);
  const [rightDragStart, setRightDragStart] = useState<{ x: number; y: number; priceOffset: number; timeOffset: number } | null>(null);

  // Time zoom state
  const [timeZoom, setTimeZoom] = useState(1);
  const [timeOffset, setTimeOffset] = useState(0);

  // Hover info state for bubbles
  const [hoveredTrade, setHoveredTrade] = useState<{
    x: number;
    y: number;
    buyVolume: number;
    sellVolume: number;
    price: number;
    totalVolume: number;
  } | null>(null);

  // Tape velocity stats for UI
  const [tapeStats, setTapeStats] = useState<TapeVelocityStats>({
    tradesPerSecond: 0,
    buyPressure: 0.5,
    sellPressure: 0.5,
    velocity: 'slow',
    momentum: 'neutral',
    stopRunDetected: false,
    recentTrades: 0,
    recentBuyVolume: 0,
    recentSellVolume: 0,
  });

  // Absorption levels for rendering - single state object to avoid triple re-renders
  const [absorptionState, setAbsorptionState] = useState<{
    levels: Map<string, PassiveOrderLevel>;
    maxBidVolume: number;
    maxAskVolume: number;
  }>({ levels: new Map(), maxBidVolume: 100, maxAskVolume: 100 });
  const absorptionLevels = absorptionState.levels;
  const maxBidVolume = absorptionState.maxBidVolume;
  const maxAskVolume = absorptionState.maxAskVolume;

  // Stores - granular selectors to avoid re-renders on unrelated settings changes
  const autoCenter = useHeatmapSettingsStore((s) => s.autoCenter);
  const colorScheme = useHeatmapSettingsStore((s) => s.colorScheme);
  const upperCutoffPercent = useHeatmapSettingsStore((s) => s.upperCutoffPercent);
  const contrast = useHeatmapSettingsStore((s) => s.contrast);
  const smoothing = useHeatmapSettingsStore((s) => s.smoothing);
  const smoothingValue = useHeatmapSettingsStore((s) => s.smoothingValue);
  const useTransparency = useHeatmapSettingsStore((s) => s.useTransparency);
  const bestBidAskPixelSize = useHeatmapSettingsStore((s) => s.bestBidAskPixelSize);
  const bestBidColor = useHeatmapSettingsStore((s) => s.bestBidColor);
  const bestAskColor = useHeatmapSettingsStore((s) => s.bestAskColor);
  const domColors = useHeatmapSettingsStore((s) => s.domColors);
  const maxVolumePixelSize = useHeatmapSettingsStore((s) => s.maxVolumePixelSize);
  const tradeFlow = useHeatmapSettingsStore((s) => s.tradeFlow);
  const zoomLevel = useHeatmapSettingsStore((s) => s.zoomLevel);
  const priceOffset = useHeatmapSettingsStore((s) => s.priceOffset);
  const displayFeatures = useHeatmapSettingsStore((s) => s.displayFeatures);
  const isSettingsPanelOpen = useHeatmapSettingsStore((s) => s.isSettingsPanelOpen);
  const settingsPanelPosition = useHeatmapSettingsStore((s) => s.settingsPanelPosition);
  // Actions - stable references, never cause re-renders
  const setZoomLevel = useHeatmapSettingsStore((s) => s.setZoomLevel);
  const setPriceOffset = useHeatmapSettingsStore((s) => s.setPriceOffset);
  const setAutoCenter = useHeatmapSettingsStore((s) => s.setAutoCenter);
  const resetZoom = useHeatmapSettingsStore((s) => s.resetZoom);
  const openSettingsPanel = useHeatmapSettingsStore((s) => s.openSettingsPanel);
  const closeSettingsPanel = useHeatmapSettingsStore((s) => s.closeSettingsPanel);
  const { bids, asks, midPrice, heatmapHistory } = useOrderbookStore();
  const currentPrice = useMarketStore((s) => s.currentPrice);
  const symbol = useMarketStore((s) => s.symbol);
  const { tradeEvents, addTrade } = useTradeStore();

  // Calculate best bid/ask (optimized - avoid spread on large Maps)
  const bestBid = React.useMemo(() => {
    if (bids.size === 0) return 0;
    let max = -Infinity;
    for (const key of bids.keys()) {
      if (key > max) max = key;
    }
    return max;
  }, [bids]);

  const bestAsk = React.useMemo(() => {
    if (asks.size === 0) return 0;
    let min = Infinity;
    for (const key of asks.keys()) {
      if (key < min) min = key;
    }
    return min;
  }, [asks]);

  // Get tick size from symbol
  const tickSize = getTickSize(symbol);

  // Calculate price range based on mid price and zoom
  const getPriceRange = useCallback((): PriceRange => {
    const center = currentPrice || midPrice || 100000;
    const baseRange = tickSize * priceRangeTicks;
    const effectiveRange = baseRange / zoomLevel;
    const offset = autoCenter ? 0 : priceOffset;

    return {
      min: center + offset - effectiveRange / 2,
      max: center + offset + effectiveRange / 2,
    };
  }, [currentPrice, midPrice, tickSize, priceRangeTicks, zoomLevel, priceOffset, autoCenter]);

  // Calculate stats
  const getStats = useCallback((): HeatmapStats => {
    let askTotal = 0;
    let bidTotal = 0;

    for (const [, qty] of asks) askTotal += qty;
    for (const [, qty] of bids) bidTotal += qty;

    return {
      askTotal,
      bidTotal,
      delta: bidTotal - askTotal,
      volume: askTotal + bidTotal,
    };
  }, [asks, bids]);

  // Convert heatmap history to snapshots
  const getSnapshots = useCallback((): OrderbookSnapshot[] => {
    return heatmapHistory.map((snapshot: any) => {
      const bidMap = new Map<number, number>();
      const askMap = new Map<number, number>();

      if (Array.isArray(snapshot.bids)) {
        snapshot.bids.forEach(([price, qty]: [number, number]) => {
          bidMap.set(price, qty);
        });
      } else if (snapshot.bids instanceof Map) {
        snapshot.bids.forEach((qty: number, price: number) => {
          bidMap.set(price, qty);
        });
      }

      if (Array.isArray(snapshot.asks)) {
        snapshot.asks.forEach(([price, qty]: [number, number]) => {
          askMap.set(price, qty);
        });
      } else if (snapshot.asks instanceof Map) {
        snapshot.asks.forEach((qty: number, price: number) => {
          askMap.set(price, qty);
        });
      }

      return {
        timestamp: snapshot.timestamp,
        bids: bidMap,
        asks: askMap,
        bestBid: snapshot.bestBid || (() => { if (bidMap.size === 0) return 0; let max = -Infinity; for (const k of bidMap.keys()) { if (k > max) max = k; } return max; })(),
        bestAsk: snapshot.bestAsk || (() => { if (askMap.size === 0) return 0; let min = Infinity; for (const k of askMap.keys()) { if (k < min) min = k; } return min; })(),
      };
    });
  }, [heatmapHistory]);

  // Initialize renderer and zoom controller
  useEffect(() => {
    if (!canvasRef.current) return;

    const config = {
      ...DEFAULT_RENDER_CONFIG,
      settings: {
        autoCenter: autoCenter,
        colorScheme: colorScheme,
        upperCutoffPercent: upperCutoffPercent,
        contrast: contrast,
        smoothing: smoothing,
        smoothingValue: smoothingValue,
        useTransparency: useTransparency,
        bestBidAskPixelSize: bestBidAskPixelSize,
        bestBidColor: bestBidColor,
        bestAskColor: bestAskColor,
        domColors: domColors,
        maxVolumePixelSize: maxVolumePixelSize,
        tradeFlow: tradeFlow,
        zoomLevel: zoomLevel,
        priceOffset: priceOffset,
        displayFeatures: displayFeatures,
      },
    };

    rendererRef.current = new HeatmapRenderer(canvasRef.current, config);

    zoomControllerRef.current = new HeatmapZoomController(
      (state) => {
        setZoomLevel(state.zoomLevel);
        setPriceOffset(state.priceOffset);
      },
      {
        smoothing: true,
        smoothingFactor: 0.2,
      }
    );

    // Initialize auto-center state
    zoomControllerRef.current.setAutoCenter(autoCenter);

    tradeFlowRendererRef.current = new TradeFlowRenderer(tradeFlow);

    // Initialize passive liquidity simulator
    passiveSimulatorRef.current = new PassiveLiquiditySimulator({
      tickSize: tickSize,
      baseLiquidity: 20,
      wallProbability: 0.1,
      wallMultiplier: 5,
      icebergEnabled: true,
      icebergProbability: 0.08,
    });

    // Initialize tape velocity engine
    tapeVelocityRef.current = new TapeVelocityEngine();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      rendererRef.current?.destroy();
      zoomControllerRef.current?.destroy();
    };
  }, []);

  // Update auto-center state
  useEffect(() => {
    zoomControllerRef.current?.setAutoCenter(autoCenter);
  }, [autoCenter]);

  // Subscribe to trades (Binance only for crypto symbols)
  // For CME symbols, generate simulated trades
  // Paused when page is hidden (keep-alive optimization)
  useEffect(() => {
    if (!isActive) return;
    // Start trade cleanup interval
    startTradeCleanup(5000);

    // Process trade through absorption and tape velocity
    const processTrade = (trade: { price: number; quantity: number; isBuyerMaker: boolean; time?: number }) => {
      // Add to trade store
      addTrade(trade as any);

      // Process through passive liquidity simulator
      if (passiveSimulatorRef.current) {
        const result = passiveSimulatorRef.current.processTrade({
          price: trade.price,
          quantity: trade.quantity,
          timestamp: trade.time || Date.now(),
          isBuyerMaker: trade.isBuyerMaker,
        });

        // Handle iceberg refill
        if (result.icebergRefilled && result.affectedLevel && rendererRef.current) {
          const levelKey = `${result.affectedLevel.price}_${result.affectedLevel.side}`;
          rendererRef.current.markIcebergRefill(levelKey);
        }

        // Record level events for visualization
        if (result.affectedLevel && rendererRef.current) {
          const level = result.affectedLevel;

          if (result.levelExecuted) {
            // Level was broken through - record BROKE event
            rendererRef.current.recordAbsorptionEvent({
              price: level.price,
              side: level.side,
              type: 'broke',
              timestamp: trade.time || Date.now(),
              volumeAbsorbed: level.absorbedVolume,
            });
          } else if (level.status === 'absorbing' && level.displayWidth < 0.5 && level.displayWidth > 0.1) {
            // Level is absorbing significant volume - record ABSORBING event
            rendererRef.current.recordAbsorptionEvent({
              price: level.price,
              side: level.side,
              type: 'absorbing',
              timestamp: trade.time || Date.now(),
              volumeAbsorbed: level.absorbedVolume,
            });
          } else if (level.status === 'active' && level.absorbedVolume > 0 && level.displayWidth > 0.7) {
            // Level absorbed and bounced - record HELD event
            rendererRef.current.recordAbsorptionEvent({
              price: level.price,
              side: level.side,
              type: 'held',
              timestamp: trade.time || Date.now(),
              volumeAbsorbed: level.absorbedVolume,
            });
          }
        }

        // Record level break for stop run detection
        if (result.levelExecuted && result.affectedLevel && tapeVelocityRef.current) {
          tapeVelocityRef.current.recordLevelBreak(
            result.affectedLevel.price,
            trade.isBuyerMaker ? 'sell' : 'buy'
          );
        }
      }

      // Record in tape velocity engine
      if (tapeVelocityRef.current) {
        tapeVelocityRef.current.recordTrade(
          trade.price,
          trade.quantity,
          !trade.isBuyerMaker // isBuy = !isBuyerMaker
        );
      }
    };

    // Only subscribe if it's a Binance symbol (crypto)
    const isBinanceSymbol = symbol.toUpperCase().includes('USDT') ||
                            symbol.toUpperCase() === 'BTCUSDT' ||
                            symbol.toUpperCase() === 'ETHUSDT';

    let unsubscribe: (() => void) | null = null;
    let simulationInterval: NodeJS.Timeout | null = null;

    if (isBinanceSymbol) {
      unsubscribe = binanceWS.subscribeTrades(
        symbol.toUpperCase(),
        (trade) => {
          processTrade(trade);
        },
        'futures'
      );
    } else {
      // Simulate trades for CME symbols - more realistic simulation
      let lastPrice = currentPrice || midPrice || 22000;
      let trend = 0; // Momentum

      simulationInterval = setInterval(() => {
        // Add some trend/momentum to price movement
        trend = trend * 0.95 + (Math.random() - 0.5) * 0.1;
        const priceMove = trend * tickSize * 2 + (Math.random() - 0.5) * tickSize * 3;
        lastPrice = lastPrice + priceMove;

        // Round to tick size
        const price = Math.round(lastPrice / tickSize) * tickSize;

        // More realistic buy/sell distribution based on price movement
        const isBuy = priceMove > 0 ? Math.random() > 0.3 : Math.random() > 0.7;

        // Volume distribution: mostly small, occasionally large
        const volumeRand = Math.random();
        let volume: number;
        if (volumeRand < 0.7) {
          volume = Math.random() * 2 + 0.5; // Small: 0.5-2.5
        } else if (volumeRand < 0.95) {
          volume = Math.random() * 5 + 2; // Medium: 2-7
        } else {
          volume = Math.random() * 15 + 5; // Large: 5-20
        }

        const simulatedTrade = {
          id: Date.now().toString() + Math.random(),
          price,
          quantity: volume,
          time: Date.now(),
          isBuyerMaker: !isBuy,
        };

        processTrade(simulatedTrade);
      }, 80 + Math.random() * 150); // Every 80-230ms (faster)
    }

    // Update tape stats and absorption levels periodically
    const statsInterval = setInterval(() => {
      // Update tape velocity stats
      if (tapeVelocityRef.current) {
        setTapeStats(tapeVelocityRef.current.getStats());
      }

      // Update absorption levels from simulator - single state update
      if (passiveSimulatorRef.current) {
        const snapshot = passiveSimulatorRef.current.getCoherentSnapshot();
        setAbsorptionState({
          levels: new Map(snapshot.levels),
          maxBidVolume: snapshot.maxBidVolume || 100,
          maxAskVolume: snapshot.maxAskVolume || 100,
        });
      }
    }, 500); // Update 2x per second

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (simulationInterval) {
        clearInterval(simulationInterval);
      }
      if (statsInterval) {
        clearInterval(statsInterval);
      }
      stopTradeCleanup();
    };
  }, [symbol, isActive, addTrade, currentPrice, midPrice, tickSize]);

  // Update renderer settings
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.applySettings({
        autoCenter: autoCenter,
        colorScheme: colorScheme,
        upperCutoffPercent: upperCutoffPercent,
        contrast: contrast,
        smoothing: smoothing,
        smoothingValue: smoothingValue,
        useTransparency: useTransparency,
        bestBidAskPixelSize: bestBidAskPixelSize,
        bestBidColor: bestBidColor,
        bestAskColor: bestAskColor,
        domColors: domColors,
        maxVolumePixelSize: maxVolumePixelSize,
        tradeFlow: tradeFlow,
        zoomLevel: zoomLevel,
        priceOffset: priceOffset,
        displayFeatures: displayFeatures,
      });
    }

    if (tradeFlowRendererRef.current) {
      tradeFlowRendererRef.current.updateSettings(tradeFlow);
    }
  }, [autoCenter, colorScheme, upperCutoffPercent, contrast, smoothing, smoothingValue, useTransparency, bestBidAskPixelSize, bestBidColor, bestAskColor, domColors, maxVolumePixelSize, tradeFlow, zoomLevel, priceOffset, displayFeatures]);

  // Render loop - optimized for 60 FPS, paused when page is hidden
  useEffect(() => {
    if (!isActive) return;
    const render = (timestamp: number) => {
      // Throttle to target FPS
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
      const stats = getStats();
      const history = getSnapshots();

      // Update visible range on passive simulator
      if (passiveSimulatorRef.current) {
        passiveSimulatorRef.current.setVisibleRange(priceRange.min, priceRange.max);
        passiveSimulatorRef.current.setConfig({
          basePrice: currentPrice || midPrice,
          tickSize,
        });
      }

      rendererRef.current.render({
        history,
        currentBids: bids,
        currentAsks: asks,
        bestBid,
        bestAsk,
        midPrice: currentPrice || midPrice,
        trades: tradeEvents,
        priceRange,
        tickSize,
        mousePosition,
        stats,
        // Pass absorption data for visualization
        passiveLevels: absorptionLevels,
        maxBidVolume,
        maxAskVolume,
      });

      // DÉSACTIVÉ: Trade flow bubbles (rectangles cyan/rouge) - retirées car dérangent
      // Si vous voulez les réactiver, décommentez le code ci-dessous
      /*
      // Render trade flow on top (only if enabled and has trades)
      if (tradeFlowRendererRef.current && tradeFlow.enabled && tradeEvents.length > 0) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const layout = rendererRef.current.getLayout();
          tradeFlowRendererRef.current.render(
            ctx,
            tradeEvents,
            priceRange,
            layout.heatmapArea.width,
            layout.heatmapArea.height,
            tickSize,
            30000, // 30 seconds window (reduced for performance)
            layout.heatmapArea.x
          );
        }
      }
      */

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, bids, asks, midPrice, currentPrice, mousePosition, getPriceRange, getStats, getSnapshots, bestBid, bestAsk, tickSize, tradeFlow.enabled, tradeEvents, frameInterval, absorptionLevels, maxBidVolume, maxAskVolume]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      rendererRef.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
          resetZoom();
          zoomControllerRef.current?.reset();
          break;
        case '+':
        case '=':
          zoomControllerRef.current?.zoomIn();
          break;
        case '-':
          zoomControllerRef.current?.zoomOut();
          break;
        case 'c':
        case 'C':
          setAutoCenter(!autoCenter);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [autoCenter, resetZoom, setAutoCenter]);

  // Check if mouse is over a trade bubble
  const checkTradeHover = useCallback((mouseX: number, mouseY: number) => {
    if (!tradeFlowRendererRef.current || !tradeFlow.enabled) {
      setHoveredTrade(null);
      return;
    }

    const priceRange = getPriceRange();
    const layout = rendererRef.current?.getLayout();
    if (!layout) return;

    // Check each trade for hover
    for (const trade of tradeEvents) {
      const now = Date.now();
      const windowStart = now - 60000;
      if (trade.timestamp < windowStart) continue;
      if (trade.price < priceRange.min || trade.price > priceRange.max) continue;

      // Calculate trade position
      const ratio = (trade.timestamp - windowStart) / (now - windowStart);
      const tradeX = layout.heatmapArea.x + ratio * layout.heatmapArea.width;
      const priceRatio = (trade.price - priceRange.min) / (priceRange.max - priceRange.min);
      const tradeY = layout.heatmapArea.height * (1 - priceRatio);

      // Calculate radius (simplified)
      const maxVolume = Math.max(...tradeEvents.map(t => t.volume), 1);
      const radius = 5 + Math.sqrt(trade.volume / maxVolume) * 30;

      // Check if mouse is within bubble
      const distance = Math.sqrt(Math.pow(mouseX - tradeX, 2) + Math.pow(mouseY - tradeY, 2));
      if (distance <= radius + 5) {
        setHoveredTrade({
          x: tradeX,
          y: tradeY,
          buyVolume: trade.side === 'buy' ? trade.volume : 0,
          sellVolume: trade.side === 'sell' ? trade.volume : 0,
          price: trade.price,
          totalVolume: trade.volume,
        });
        return;
      }
    }

    setHoveredTrade(null);
  }, [getPriceRange, tradeEvents, tradeFlow.enabled]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePosition({ x, y });

    // Check for trade bubble hover
    checkTradeHover(x, y);

    // Update cursor based on position
    const onPriceAxis = rendererRef.current.isInPriceAxis(x);
    setIsOverPriceAxis(onPriceAxis);

    // Handle right-click pan (free movement)
    if (isRightDragging && rightDragStart) {
      const deltaX = x - rightDragStart.x;
      const deltaY = y - rightDragStart.y;

      const priceRange = getPriceRange();
      const pricePerPixel = (priceRange.max - priceRange.min) / height;

      // Vertical: adjust price offset
      const newPriceOffset = rightDragStart.priceOffset + deltaY * pricePerPixel;
      setPriceOffset(newPriceOffset);
      setAutoCenter(false);

      // Horizontal: adjust time offset
      const timePerPixel = 0.5 / timeZoom; // Adjust sensitivity
      const newTimeOffset = rightDragStart.timeOffset - deltaX * timePerPixel;
      setTimeOffset(newTimeOffset);
      rendererRef.current?.setTimeOffset?.(newTimeOffset);

      setCursorStyle('grabbing');
      return;
    }

    if (zoomControllerRef.current?.getIsDragging()) {
      const dragType = zoomControllerRef.current.getDragType();
      setCursorStyle(dragType === 'zoom' ? 'ns-resize' : 'grabbing');

      if (dragType === 'zoom') {
        zoomControllerRef.current.updatePriceAxisDrag(y);
      } else if (dragType === 'pan') {
        const priceRange = getPriceRange();
        const pricePerPixel = (priceRange.max - priceRange.min) / height;
        zoomControllerRef.current.updatePan(y, pricePerPixel);
      }
    } else {
      setCursorStyle(onPriceAxis ? 'ns-resize' : 'crosshair');
    }
  }, [getPriceRange, height, isRightDragging, rightDragStart, setPriceOffset, setAutoCenter, timeZoom, checkTradeHover]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Right click - start free pan
    if (e.button === 2) {
      e.preventDefault();
      setIsRightDragging(true);
      setRightDragStart({
        x,
        y,
        priceOffset: priceOffset,
        timeOffset: timeOffset,
      });
      setCursorStyle('grabbing');
      return;
    }

    // Left click
    if (e.button !== 0) return;
    if (!zoomControllerRef.current) return;

    if (rendererRef.current.isInPriceAxis(x)) {
      zoomControllerRef.current.startPriceAxisDrag(y);
      setCursorStyle('ns-resize');
    } else {
      zoomControllerRef.current.startPan(y);
      setCursorStyle('grabbing');
    }
  }, [priceOffset, timeOffset]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // End right-click drag
    if (e.button === 2) {
      setIsRightDragging(false);
      setRightDragStart(null);
    }

    zoomControllerRef.current?.endDrag();
    setCursorStyle(isOverPriceAxis ? 'ns-resize' : 'crosshair');
  }, [isOverPriceAxis]);

  const handleMouseLeave = useCallback(() => {
    setMousePosition(null);
    setIsRightDragging(false);
    setRightDragStart(null);
    zoomControllerRef.current?.endDrag();
    setCursorStyle('crosshair');
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!mousePosition || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();

    // Shift + wheel = horizontal time zoom (0.1x to 10x like price zoom)
    if (e.shiftKey) {
      const zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
      const newTimeZoom = Math.max(0.1, Math.min(10, timeZoom * zoomFactor));
      setTimeZoom(newTimeZoom);
      rendererRef.current?.setTimeZoom?.(newTimeZoom);
      return;
    }

    // Regular wheel = price zoom
    if (!zoomControllerRef.current) return;

    const priceRange = getPriceRange();
    const price = rendererRef.current?.getPriceAtY(mousePosition.y) || midPrice;

    zoomControllerRef.current.handleWheel(
      e.deltaY,
      mousePosition.y,
      price,
      rect.height - 45, // Height minus stats bar
      priceRange
    );
  }, [mousePosition, getPriceRange, midPrice, timeZoom]);

  const handleDoubleClick = useCallback(() => {
    zoomControllerRef.current?.handleDoubleClick();
    setAutoCenter(true);
    resetZoom();
  }, [setAutoCenter, resetZoom]);

  // Context menu - only open if not dragging
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // Don't open context menu if we were panning
    if (isRightDragging) {
      setIsRightDragging(false);
      setRightDragStart(null);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const price = rendererRef.current.getPriceAtY(y);

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      priceAtCursor: price,
    });
  }, [isRightDragging]);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Context menu items
  const contextMenuItems: ContextMenuItem[] = [
    {
      id: 'reset-view',
      label: 'Reset View',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      shortcut: 'R',
      onClick: () => {
        resetZoom();
        zoomControllerRef.current?.reset();
        closeContextMenu();
      },
    },
    {
      id: 'auto-center',
      label: autoCenter ? 'Disable Auto-Center' : 'Enable Auto-Center',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      shortcut: 'C',
      onClick: () => {
        setAutoCenter(!autoCenter);
        closeContextMenu();
      },
    },
    { id: 'divider1', label: '', divider: true },
    {
      id: 'copy-price',
      label: `Copy Price (${contextMenu.priceAtCursor?.toFixed(2) || '---'})`,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      shortcut: 'Ctrl+C',
      onClick: () => {
        if (contextMenu.priceAtCursor) {
          navigator.clipboard.writeText(contextMenu.priceAtCursor.toFixed(2));
          toast.success('Price copied');
        }
        closeContextMenu();
      },
    },
    { id: 'divider2', label: '', divider: true },
    {
      id: 'settings',
      label: 'Settings...',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      onClick: () => {
        // Open settings panel at a fixed position (top-right of container)
        const containerRect = containerRef.current?.getBoundingClientRect();
        const panelX = containerRect ? containerRect.right - 380 : 100;
        const panelY = containerRect ? containerRect.top + 50 : 100;
        openSettingsPanel({ x: panelX, y: panelY });
        closeContextMenu();
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      style={{ height }}
      tabIndex={0}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block', cursor: cursorStyle }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <ContextMenu
          items={contextMenuItems}
          x={contextMenu.position.x}
          y={contextMenu.position.y}
          onClose={closeContextMenu}
        />
      )}

      {/* Settings Panel */}
      <HeatmapSettingsPanel
        isOpen={isSettingsPanelOpen}
        onClose={closeSettingsPanel}
        initialPosition={settingsPanelPosition}
      />

      {/* Zoom indicators */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        {/* Time zoom indicator */}
        {timeZoom !== 1 && (
          <div className="px-2 py-1 bg-zinc-800/90 rounded text-xs text-zinc-300 font-mono">
            T:{timeZoom.toFixed(1)}x
          </div>
        )}

        {/* Price zoom indicator */}
        {zoomLevel !== 1 && (
          <div className="px-2 py-1 bg-zinc-800/90 rounded text-xs text-zinc-300 font-mono">
            P:{zoomLevel.toFixed(1)}x
          </div>
        )}

        {/* Auto-center indicator */}
        {autoCenter && (
          <div className="px-2 py-1 bg-blue-600/80 rounded text-xs text-white">
            Auto
          </div>
        )}
      </div>

      {/* Tape Speed Meter - Orderflow Panel */}
      <div className="absolute top-2 left-2">
        <TapeSpeedMeter stats={tapeStats} />
      </div>

      {/* Stop Run Alert */}
      <StopRunAlert
        detected={tapeStats.stopRunDetected}
        side={tapeStats.stopRunSide}
      />

      {/* Controls hint */}
      <div className="absolute bottom-12 left-2 text-[10px] text-zinc-600 pointer-events-none">
        Drag price axis to zoom • Right-click drag to pan • Shift+Wheel: Time zoom • R: Reset • C: Auto-center
      </div>

      {/* Trade hover tooltip */}
      {hoveredTrade && (
        <div
          className="absolute pointer-events-none z-50"
          style={{
            left: Math.min(hoveredTrade.x + 15, containerRef.current?.clientWidth || 0 - 150),
            top: hoveredTrade.y - 50,
          }}
        >
          <div className="bg-zinc-900/95 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm">
            <div className="text-xs text-zinc-400 mb-1">
              @ {hoveredTrade.price.toFixed(2)}
            </div>
            <div className="flex items-center gap-3">
              {/* Buy bar */}
              <div className="flex items-center gap-1.5">
                <div
                  className="h-3 bg-green-500 rounded-sm"
                  style={{ width: Math.max(4, hoveredTrade.buyVolume * 3) }}
                />
                <span className="text-xs text-green-400 font-mono">
                  {hoveredTrade.buyVolume.toFixed(1)}
                </span>
              </div>
              {/* Sell bar */}
              <div className="flex items-center gap-1.5">
                <div
                  className="h-3 bg-red-500 rounded-sm"
                  style={{ width: Math.max(4, hoveredTrade.sellVolume * 3) }}
                />
                <span className="text-xs text-red-400 font-mono">
                  {hoveredTrade.sellVolume.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">
              Total: {hoveredTrade.totalVolume.toFixed(2)} contracts
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Helper function to get tick size based on symbol
function getTickSize(symbol: string): number {
  const tickSizes: Record<string, number> = {
    BTCUSDT: 0.1,
    ETHUSDT: 0.01,
    MNQH5: 0.25,
    MESH5: 0.25,
    NQH5: 0.25,
    ESH5: 0.25,
    GCJ5: 0.1,
    MGCJ5: 0.1,
  };
  return tickSizes[symbol] || 0.01;
}
