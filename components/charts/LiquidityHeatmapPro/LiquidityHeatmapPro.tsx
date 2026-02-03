'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
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
import type { HeatmapStats, PriceRange } from '@/types/heatmap';
import type { Point, ContextMenuState, OrderbookSnapshot } from './types';
import { DEFAULT_RENDER_CONFIG } from './types';

interface LiquidityHeatmapProProps {
  height?: number;
  priceRangeTicks?: number;
}

export function LiquidityHeatmapPro({
  height = 600,
  priceRangeTicks = 100,
}: LiquidityHeatmapProProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HeatmapRenderer | null>(null);
  const zoomControllerRef = useRef<HeatmapZoomController | null>(null);
  const tradeFlowRendererRef = useRef<TradeFlowRenderer | null>(null);
  const animationFrameRef = useRef<number>(0);

  // State
  const [mousePosition, setMousePosition] = useState<Point | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');
  const [isOverPriceAxis, setIsOverPriceAxis] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    priceAtCursor: null,
  });

  // Stores
  const settings = useHeatmapSettingsStore();
  const { bids, asks, midPrice, heatmapHistory } = useOrderbookStore();
  const { currentPrice, symbol } = useMarketStore();
  const { tradeEvents, addTrade } = useTradeStore();

  // Calculate best bid/ask
  const bestBid = bids.size > 0 ? Math.max(...bids.keys()) : 0;
  const bestAsk = asks.size > 0 ? Math.min(...asks.keys()) : 0;

  // Get tick size from symbol
  const tickSize = getTickSize(symbol);

  // Calculate price range based on mid price and zoom
  const getPriceRange = useCallback((): PriceRange => {
    const center = currentPrice || midPrice || 100000;
    const baseRange = tickSize * priceRangeTicks;
    const effectiveRange = baseRange / settings.zoomLevel;
    const offset = settings.autoCenter ? 0 : settings.priceOffset;

    return {
      min: center + offset - effectiveRange / 2,
      max: center + offset + effectiveRange / 2,
    };
  }, [currentPrice, midPrice, tickSize, priceRangeTicks, settings.zoomLevel, settings.priceOffset, settings.autoCenter]);

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
        bestBid: snapshot.bestBid || (bidMap.size > 0 ? Math.max(...bidMap.keys()) : 0),
        bestAsk: snapshot.bestAsk || (askMap.size > 0 ? Math.min(...askMap.keys()) : 0),
      };
    });
  }, [heatmapHistory]);

  // Initialize renderer and zoom controller
  useEffect(() => {
    if (!canvasRef.current) return;

    const config = {
      ...DEFAULT_RENDER_CONFIG,
      settings: {
        autoCenter: settings.autoCenter,
        colorScheme: settings.colorScheme,
        upperCutoffPercent: settings.upperCutoffPercent,
        contrast: settings.contrast,
        smoothing: settings.smoothing,
        smoothingValue: settings.smoothingValue,
        useTransparency: settings.useTransparency,
        bestBidAskPixelSize: settings.bestBidAskPixelSize,
        bestBidColor: settings.bestBidColor,
        bestAskColor: settings.bestAskColor,
        domColors: settings.domColors,
        maxVolumePixelSize: settings.maxVolumePixelSize,
        tradeFlow: settings.tradeFlow,
        zoomLevel: settings.zoomLevel,
        priceOffset: settings.priceOffset,
      },
    };

    rendererRef.current = new HeatmapRenderer(canvasRef.current, config);

    zoomControllerRef.current = new HeatmapZoomController(
      (state) => {
        settings.setZoomLevel(state.zoomLevel);
        settings.setPriceOffset(state.priceOffset);
      },
      {
        smoothing: true,
        smoothingFactor: 0.2,
      }
    );

    // Initialize auto-center state
    zoomControllerRef.current.setAutoCenter(settings.autoCenter);

    tradeFlowRendererRef.current = new TradeFlowRenderer(settings.tradeFlow);

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
    zoomControllerRef.current?.setAutoCenter(settings.autoCenter);
  }, [settings.autoCenter]);

  // Subscribe to trades (Binance only for crypto symbols)
  // For CME symbols, generate simulated trades
  useEffect(() => {
    // Start trade cleanup interval
    startTradeCleanup(5000);

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
          addTrade(trade);
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

        addTrade(simulatedTrade);
      }, 80 + Math.random() * 150); // Every 80-230ms (faster)
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (simulationInterval) {
        clearInterval(simulationInterval);
      }
      stopTradeCleanup();
    };
  }, [symbol, addTrade, currentPrice, midPrice, tickSize]);

  // Update renderer settings
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.applySettings({
        autoCenter: settings.autoCenter,
        colorScheme: settings.colorScheme,
        upperCutoffPercent: settings.upperCutoffPercent,
        contrast: settings.contrast,
        smoothing: settings.smoothing,
        smoothingValue: settings.smoothingValue,
        useTransparency: settings.useTransparency,
        bestBidAskPixelSize: settings.bestBidAskPixelSize,
        bestBidColor: settings.bestBidColor,
        bestAskColor: settings.bestAskColor,
        domColors: settings.domColors,
        maxVolumePixelSize: settings.maxVolumePixelSize,
        tradeFlow: settings.tradeFlow,
        zoomLevel: settings.zoomLevel,
        priceOffset: settings.priceOffset,
      });
    }

    if (tradeFlowRendererRef.current) {
      tradeFlowRendererRef.current.updateSettings(settings.tradeFlow);
    }
  }, [settings]);

  // Render loop
  useEffect(() => {
    const render = () => {
      if (!rendererRef.current || !canvasRef.current) return;

      const priceRange = getPriceRange();
      const stats = getStats();
      const history = getSnapshots();

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
      });

      // Render trade flow on top
      if (tradeFlowRendererRef.current && settings.tradeFlow.enabled) {
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
            60000, // 60 seconds window
            layout.heatmapArea.x
          );
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [bids, asks, midPrice, currentPrice, mousePosition, getPriceRange, getStats, getSnapshots, bestBid, bestAsk, tickSize, settings.tradeFlow.enabled, tradeEvents]);

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
          settings.resetZoom();
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
          settings.setAutoCenter(!settings.autoCenter);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePosition({ x, y });

    // Update cursor based on position
    const onPriceAxis = rendererRef.current.isInPriceAxis(x);
    setIsOverPriceAxis(onPriceAxis);

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
  }, [getPriceRange, height]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rendererRef.current || !zoomControllerRef.current) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (rendererRef.current.isInPriceAxis(x)) {
      zoomControllerRef.current.startPriceAxisDrag(y);
      setCursorStyle('ns-resize');
    } else {
      zoomControllerRef.current.startPan(y);
      setCursorStyle('grabbing');
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    zoomControllerRef.current?.endDrag();
    setCursorStyle(isOverPriceAxis ? 'ns-resize' : 'crosshair');
  }, [isOverPriceAxis]);

  const handleMouseLeave = useCallback(() => {
    setMousePosition(null);
    zoomControllerRef.current?.endDrag();
    setCursorStyle('crosshair');
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!zoomControllerRef.current || !mousePosition || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const priceRange = getPriceRange();
    const price = rendererRef.current?.getPriceAtY(mousePosition.y) || midPrice;

    zoomControllerRef.current.handleWheel(
      e.deltaY,
      mousePosition.y,
      price,
      rect.height - 45, // Height minus stats bar
      priceRange
    );
  }, [mousePosition, getPriceRange, midPrice]);

  const handleDoubleClick = useCallback(() => {
    zoomControllerRef.current?.handleDoubleClick();
    settings.setAutoCenter(true);
    settings.resetZoom();
  }, [settings]);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

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
  }, []);

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
        settings.resetZoom();
        zoomControllerRef.current?.reset();
        closeContextMenu();
      },
    },
    {
      id: 'auto-center',
      label: settings.autoCenter ? 'Disable Auto-Center' : 'Enable Auto-Center',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      shortcut: 'C',
      onClick: () => {
        settings.setAutoCenter(!settings.autoCenter);
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
        settings.openSettingsPanel({ x: panelX, y: panelY });
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
        isOpen={settings.isSettingsPanelOpen}
        onClose={settings.closeSettingsPanel}
        initialPosition={settings.settingsPanelPosition}
      />

      {/* Zoom indicator */}
      {settings.zoomLevel !== 1 && (
        <div className="absolute top-2 right-24 px-2 py-1 bg-zinc-800/90 rounded text-xs text-zinc-300 font-mono">
          {settings.zoomLevel.toFixed(1)}x
        </div>
      )}

      {/* Auto-center indicator */}
      {settings.autoCenter && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-blue-600/80 rounded text-xs text-white">
          Auto
        </div>
      )}

      {/* Trade Flow indicator */}
      {settings.tradeFlow.enabled && tradeEvents.length > 0 && (
        <div className="absolute top-2 left-2 px-2 py-1 bg-zinc-800/90 rounded text-xs text-zinc-300 font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>{tradeEvents.length} trades</span>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-12 left-2 text-[10px] text-zinc-600 pointer-events-none">
        Drag price axis to zoom • Double-click to reset • R: Reset • C: Auto-center
      </div>
    </div>
  );
}

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
