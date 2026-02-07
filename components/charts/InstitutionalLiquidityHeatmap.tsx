'use client';

/**
 * INSTITUTIONAL LIQUIDITY HEATMAP
 *
 * Professional-grade liquidity visualization component.
 * Features: Wall detection, absorption tracking, spoofing detection,
 * time decay, and institutional color mapping.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useTradeStore, startTradeCleanup, stopTradeCleanup } from '@/stores/useTradeStore';
import { binanceWS } from '@/lib/websocket/BinanceWS';

import { LiquidityEngine } from '@/lib/heatmap/core/LiquidityEngine';
import { InstitutionalRenderer, RenderContext } from '@/lib/heatmap/rendering/InstitutionalRenderer';
import type { HeatmapSettings, PriceRange, Point, Trade } from '@/lib/heatmap/core/types';

interface InstitutionalLiquidityHeatmapProps {
  height?: number;
  priceRangeTicks?: number;
  settings?: Partial<HeatmapSettings>;
}

export function InstitutionalLiquidityHeatmap({
  height = 650,
  priceRangeTicks = 100,
  settings: initialSettings,
}: InstitutionalLiquidityHeatmapProps) {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LiquidityEngine | null>(null);
  const rendererRef = useRef<InstitutionalRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);

  // State
  const [mousePosition, setMousePosition] = useState<Point | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Zoom state
  const [priceZoom, setPriceZoom] = useState(1.0);
  const [priceOffset, setPriceOffset] = useState(0);
  const [autoCenter, setAutoCenter] = useState(true);

  // Settings state
  const [settings, setSettings] = useState<HeatmapSettings>({
    liquidityThreshold: 0,
    upperCutoffPercent: 97,
    lowerCutoffPercent: 5,
    decayEnabled: true,
    decayHalfLifeMs: 5000,
    colorScheme: 'bookmap',
    bidBaseColor: '#22d3ee',
    askBaseColor: '#ef4444',
    useLogScale: true,
    gamma: 1.2,
    showWalls: true,
    wallThresholdSigma: 2.5,
    showAbsorption: true,
    absorptionMinPercent: 20,
    showSpoofing: true,
    spoofingConfidenceThreshold: 0.7,
    showBids: true,
    showAsks: true,
    showTrades: true,
    tradeMinSize: 0.1,
    tradeBubbleScale: 1.0,
    priceZoom: 1.0,
    timeZoom: 1.0,
    autoCenter: true,
    updateIntervalMs: 100,
    maxHistoryColumns: 2000,
    columnWidthMs: 250,
    ...initialSettings,
  });

  // Stores
  const { bids, asks, midPrice } = useOrderbookStore();
  const { currentPrice, symbol } = useMarketStore();
  const { tradeEvents, addTrade } = useTradeStore();

  // Get tick size
  const tickSize = getTickSize(symbol);

  // Calculate price range
  const getPriceRange = useCallback((): PriceRange => {
    const center = currentPrice || midPrice || 100000;
    const baseRange = tickSize * priceRangeTicks;
    const effectiveRange = baseRange / priceZoom;
    const offset = autoCenter ? 0 : priceOffset;

    return {
      min: center + offset - effectiveRange / 2,
      max: center + offset + effectiveRange / 2,
    };
  }, [currentPrice, midPrice, tickSize, priceRangeTicks, priceZoom, priceOffset, autoCenter]);

  // Initialize engine and renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      // Create engine
      engineRef.current = new LiquidityEngine(settings);
      engineRef.current.setTickSize(tickSize);

      // Create renderer
      rendererRef.current = new InstitutionalRenderer(canvasRef.current, settings);
      rendererRef.current.setTickSize(tickSize);
      rendererRef.current.setColorScheme(settings.colorScheme);

      setIsLoading(false);
    } catch (err) {
      setError('Failed to initialize heatmap');
      console.error(err);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      engineRef.current?.destroy();
      rendererRef.current?.destroy();
    };
  }, []);

  // Subscribe to trades
  useEffect(() => {
    startTradeCleanup(5000);

    const isBinanceSymbol =
      symbol.toUpperCase().includes('USDT') ||
      symbol.toUpperCase() === 'BTCUSDT' ||
      symbol.toUpperCase() === 'ETHUSDT';

    let unsubscribe: (() => void) | null = null;
    let simulationInterval: NodeJS.Timeout | null = null;

    if (isBinanceSymbol) {
      unsubscribe = binanceWS.subscribeTrades(
        symbol.toUpperCase(),
        (trade) => {
          addTrade(trade);

          // Also add to engine
          if (engineRef.current) {
            const engineTrade: Trade = {
              id: trade.id?.toString() || Date.now().toString(),
              price: trade.price,
              quantity: trade.quantity,
              side: trade.isBuyerMaker ? 'sell' : 'buy',
              timestamp: trade.time || Date.now(),
              isBuyerMaker: trade.isBuyerMaker,
            };
            engineRef.current.addTrade(engineTrade);
          }
        },
        'futures'
      );
    } else {
      // Simulate trades for non-Binance symbols
      let lastPrice = currentPrice || midPrice || 22000;
      let trend = 0;

      simulationInterval = setInterval(() => {
        trend = trend * 0.95 + (Math.random() - 0.5) * 0.1;
        const priceMove = trend * tickSize * 2 + (Math.random() - 0.5) * tickSize * 3;
        lastPrice = lastPrice + priceMove;
        const price = Math.round(lastPrice / tickSize) * tickSize;
        const isBuy = priceMove > 0 ? Math.random() > 0.3 : Math.random() > 0.7;

        const volumeRand = Math.random();
        let volume: number;
        if (volumeRand < 0.7) {
          volume = Math.random() * 2 + 0.5;
        } else if (volumeRand < 0.95) {
          volume = Math.random() * 5 + 2;
        } else {
          volume = Math.random() * 15 + 5;
        }

        const simulatedTrade = {
          id: Date.now().toString() + Math.random(),
          price,
          quantity: volume,
          time: Date.now(),
          isBuyerMaker: !isBuy,
        };

        addTrade(simulatedTrade);

        if (engineRef.current) {
          engineRef.current.addTrade({
            id: simulatedTrade.id,
            price,
            quantity: volume,
            side: isBuy ? 'buy' : 'sell',
            timestamp: Date.now(),
            isBuyerMaker: !isBuy,
          });
        }
      }, 100 + Math.random() * 200);
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (simulationInterval) clearInterval(simulationInterval);
      stopTradeCleanup();
    };
  }, [symbol, addTrade, currentPrice, midPrice, tickSize]);

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

      if (!engineRef.current || !rendererRef.current || !canvasRef.current) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Process order book
      engineRef.current.processOrderBook(bids, asks);

      // Get state
      const state = engineRef.current.getState();
      const priceRange = getPriceRange();

      // Convert trades
      const trades: Trade[] = tradeEvents.map((t, idx) => ({
        id: `${t.timestamp}_${idx}`,
        price: t.price,
        quantity: t.volume,
        side: t.side,
        timestamp: t.timestamp,
        isBuyerMaker: t.side === 'sell',
      }));

      // Create render context
      const context: RenderContext = {
        history: state.history,
        currentBids: bids,
        currentAsks: asks,
        bestBid: state.orderBook.bestBid,
        bestAsk: state.orderBook.bestAsk,
        midPrice: currentPrice || midPrice,
        trades,
        walls: state.walls,
        spoofPatterns: state.spoofPatterns,
        absorptionEvents: state.absorptionEvents,
        mousePosition,
        settings,
      };

      // Render
      rendererRef.current.render(context, priceRange);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [bids, asks, midPrice, currentPrice, mousePosition, settings, tradeEvents, getPriceRange]);

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

    const isInPriceLadder = rendererRef.current?.isInPriceLadder(x);
    setCursorStyle(isInPriceLadder ? 'ns-resize' : 'crosshair');
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
        case 'w':
        case 'W':
          setSettings(prev => ({ ...prev, showWalls: !prev.showWalls }));
          break;
        case 'a':
        case 'A':
          setSettings(prev => ({ ...prev, showAbsorption: !prev.showAbsorption }));
          break;
        case 's':
        case 'S':
          setSettings(prev => ({ ...prev, showSpoofing: !prev.showSpoofing }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-900 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none bg-[#06080d]"
      style={{ height }}
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

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
          <div className="text-zinc-400">Initializing heatmap...</div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        {priceZoom !== 1 && (
          <div className="px-2 py-1 bg-zinc-800/90 rounded text-xs text-zinc-300 font-mono">
            {priceZoom.toFixed(1)}x
          </div>
        )}
        {autoCenter && (
          <div className="px-2 py-1 bg-blue-600/80 rounded text-xs text-white">
            Auto
          </div>
        )}
      </div>

      {/* Analytics indicators */}
      <div className="absolute top-2 left-2 flex flex-col gap-1">
        {settings.showWalls && (
          <div className="px-2 py-0.5 bg-cyan-900/60 rounded text-[10px] text-cyan-300 font-mono">
            WALLS
          </div>
        )}
        {settings.showAbsorption && (
          <div className="px-2 py-0.5 bg-orange-900/60 rounded text-[10px] text-orange-300 font-mono">
            ABSORPTION
          </div>
        )}
        {settings.showSpoofing && (
          <div className="px-2 py-0.5 bg-yellow-900/60 rounded text-[10px] text-yellow-300 font-mono">
            SPOOF DETECT
          </div>
        )}
      </div>

      {/* Help */}
      <div className="absolute bottom-14 left-2 text-[9px] text-zinc-600 pointer-events-none">
        Wheel: Zoom • R: Reset • C: Auto-center • W: Walls • A: Absorption • S: Spoofing
      </div>
    </div>
  );
}

// Helper function
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

export default InstitutionalLiquidityHeatmap;
