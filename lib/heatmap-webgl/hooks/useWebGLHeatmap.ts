/**
 * React Hook for WebGL Heatmap Rendering
 * Manages lifecycle and provides a clean API for React components
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { HybridRenderer, type HybridRendererConfig, type RenderData } from '../HybridRenderer';

export interface UseWebGLHeatmapOptions {
  width: number;
  height: number;
  priceAxisWidth?: number;
  deltaProfileWidth?: number;
  volumeProfileWidth?: number;
}

export interface UseWebGLHeatmapReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  render: (data: RenderData) => void;
  isWebGL: boolean;
  isReady: boolean;
  resize: (width: number, height: number) => void;
}

export function useWebGLHeatmap(options: UseWebGLHeatmapOptions): UseWebGLHeatmapReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HybridRenderer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isWebGL, setIsWebGL] = useState(false);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    // Clean up existing renderer
    if (rendererRef.current) {
      rendererRef.current.destroy();
    }

    // Create new renderer
    try {
      const renderer = new HybridRenderer({
        canvas,
        container,
        width: options.width,
        height: options.height,
        priceAxisWidth: options.priceAxisWidth ?? 60,
        deltaProfileWidth: options.deltaProfileWidth ?? 80,
        volumeProfileWidth: options.volumeProfileWidth ?? 60,
      });

      rendererRef.current = renderer;
      setIsWebGL(renderer.isWebGL);
      setIsReady(renderer.isInitialized);

      console.debug('[useWebGLHeatmap] Renderer initialized, WebGL:', renderer.isWebGL);
    } catch (error) {
      console.error('[useWebGLHeatmap] Failed to initialize renderer:', error);
      setIsReady(false);
      setIsWebGL(false);
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Handle resize
  const resize = useCallback((width: number, height: number) => {
    if (rendererRef.current) {
      rendererRef.current.resize(width, height);
    }
  }, []);

  // Effect for size changes
  useEffect(() => {
    resize(options.width, options.height);
  }, [options.width, options.height, resize]);

  // Render function
  const render = useCallback((data: RenderData) => {
    if (rendererRef.current && rendererRef.current.isInitialized) {
      rendererRef.current.render(data);
    }
  }, []);

  return {
    canvasRef,
    containerRef,
    render,
    isWebGL,
    isReady,
    resize,
  };
}

/**
 * Convert orderbook data to PassiveOrderData format
 */
export function convertOrderbookToPassiveOrders(
  bids: { price: number; size: number }[],
  asks: { price: number; size: number }[],
  maxSize: number,
  getXPosition: (price: number) => number
): { price: number; size: number; side: 'bid' | 'ask'; intensity: number; x: number }[] {
  const orders: { price: number; size: number; side: 'bid' | 'ask'; intensity: number; x: number }[] = [];

  for (const bid of bids) {
    orders.push({
      price: bid.price,
      size: bid.size,
      side: 'bid',
      intensity: Math.min(1, bid.size / maxSize),
      x: getXPosition(bid.price),
    });
  }

  for (const ask of asks) {
    orders.push({
      price: ask.price,
      size: ask.size,
      side: 'ask',
      intensity: Math.min(1, ask.size / maxSize),
      x: getXPosition(ask.price),
    });
  }

  return orders;
}

/**
 * Convert trades to TradeData format
 */
export function convertTradesToTradeData(
  trades: { price: number; size: number; side: 'buy' | 'sell'; timestamp: number }[],
  getXPosition: (timestamp: number) => number,
  currentTime: number,
  maxAge: number = 60000 // 1 minute
): { price: number; size: number; side: 'buy' | 'sell'; x: number; buyRatio: number; age: number }[] {
  return trades.map((trade) => ({
    price: trade.price,
    size: trade.size,
    side: trade.side,
    x: getXPosition(trade.timestamp),
    buyRatio: trade.side === 'buy' ? 1 : 0,
    age: Math.min(1, (currentTime - trade.timestamp) / maxAge),
  }));
}
