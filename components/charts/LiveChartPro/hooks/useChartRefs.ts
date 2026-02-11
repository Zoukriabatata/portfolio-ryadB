/**
 * CONSOLIDATED CHART REFS HOOK
 *
 * Centralized ref management for LiveChartPro to:
 * - Reduce ref proliferation (was 20+ individual refs)
 * - Improve performance with stable ref object
 * - Simplify cleanup logic
 * - Better TypeScript inference
 */

import { useRef, useMemo } from 'react';
import type { ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import type { InteractionController } from '@/lib/tools/InteractionController';
import type { ToolsEngine } from '@/lib/tools/ToolsEngine';
import type { ToolsRenderer } from '@/lib/tools/ToolsRenderer';

export interface ChartRefs {
  // Core chart elements
  chartEngine: React.RefObject<any>;
  chartContainer: React.RefObject<HTMLDivElement | null>;
  chartCanvas: React.RefObject<HTMLCanvasElement | null>;
  drawingCanvas: React.RefObject<HTMLCanvasElement | null>;

  // Data refs
  candles: React.MutableRefObject<ChartCandle[]>;
  candleData: React.MutableRefObject<Map<any, any>>;
  currentPrice: React.MutableRefObject<number>;

  // UI element refs
  price: React.RefObject<HTMLSpanElement | null>;
  tickCount: React.RefObject<HTMLSpanElement | null>;
  statusDot: React.RefObject<HTMLDivElement | null>;
  pricePosition: React.RefObject<HTMLDivElement | null>;
  pricePositionBar: React.RefObject<HTMLDivElement | null>;

  // Tool system refs
  interactionController: React.MutableRefObject<InteractionController>;
  toolsEngine: React.MutableRefObject<ToolsEngine>;
  toolsRenderer: React.MutableRefObject<ToolsRenderer>;

  // Session tracking
  sessionHigh: React.MutableRefObject<number>;
  sessionLow: React.MutableRefObject<number>;
  lastHistoryTime: React.MutableRefObject<number>;
  lastAlertCheck: React.MutableRefObject<number>;

  // Lifecycle refs
  unsubscribers: React.MutableRefObject<Array<() => void>>;
  handleTimeframeChange: React.MutableRefObject<() => void>;

  // Cleanup utility
  cleanup: () => void;
}

/**
 * Creates and manages all chart refs in a centralized way
 *
 * @example
 * ```tsx
 * const refs = useChartRefs();
 *
 * // Access refs
 * refs.chartCanvas.current?.getContext('2d');
 * refs.currentPrice.current = 50000;
 *
 * // Cleanup on unmount
 * useEffect(() => refs.cleanup, []);
 * ```
 */
export function useChartRefs(): ChartRefs {
  // Core chart elements
  const chartEngineRef = useRef(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Data refs
  const candlesRef = useRef<ChartCandle[]>([]);
  const candleDataRef = useRef(new Map());
  const currentPriceRef = useRef(0);

  // UI element refs
  const priceRef = useRef<HTMLSpanElement>(null);
  const tickCountRef = useRef<HTMLSpanElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);
  const pricePositionRef = useRef<HTMLDivElement>(null);
  const pricePositionBarRef = useRef<HTMLDivElement>(null);

  // Tool system refs
  const interactionControllerRef = useRef<InteractionController>(
    null as any // Initialized by component
  );
  const toolsEngineRef = useRef<ToolsEngine>(null as any);
  const toolsRendererRef = useRef<ToolsRenderer>(null as any);

  // Session tracking
  const sessionHighRef = useRef(0);
  const sessionLowRef = useRef(Infinity);
  const lastHistoryTimeRef = useRef(0);
  const lastAlertCheckRef = useRef(0);

  // Lifecycle refs
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const handleTimeframeChangeRef = useRef(() => {});

  // Cleanup function
  const cleanup = () => {
    // Unsubscribe all listeners
    unsubscribersRef.current.forEach((unsub) => {
      try {
        unsub();
      } catch (error) {
        console.error('[ChartRefs] Cleanup error:', error);
      }
    });
    unsubscribersRef.current = [];

    // Clear data refs
    candlesRef.current = [];
    candleDataRef.current.clear();
    currentPriceRef.current = 0;
    sessionHighRef.current = 0;
    sessionLowRef.current = Infinity;
    lastHistoryTimeRef.current = 0;
    lastAlertCheckRef.current = 0;
  };

  // Return stable refs object (memoized to prevent re-creation)
  return useMemo<ChartRefs>(
    () => ({
      // Core chart elements
      chartEngine: chartEngineRef,
      chartContainer: chartContainerRef,
      chartCanvas: chartCanvasRef,
      drawingCanvas: drawingCanvasRef,

      // Data refs
      candles: candlesRef,
      candleData: candleDataRef,
      currentPrice: currentPriceRef,

      // UI element refs
      price: priceRef,
      tickCount: tickCountRef,
      statusDot: statusDotRef,
      pricePosition: pricePositionRef,
      pricePositionBar: pricePositionBarRef,

      // Tool system refs
      interactionController: interactionControllerRef,
      toolsEngine: toolsEngineRef,
      toolsRenderer: toolsRendererRef,

      // Session tracking
      sessionHigh: sessionHighRef,
      sessionLow: sessionLowRef,
      lastHistoryTime: lastHistoryTimeRef,
      lastAlertCheck: lastAlertCheckRef,

      // Lifecycle refs
      unsubscribers: unsubscribersRef,
      handleTimeframeChange: handleTimeframeChangeRef,

      // Cleanup
      cleanup,
    }),
    [] // Empty deps - refs are stable
  );
}

/**
 * Type guard to check if refs are initialized
 */
export function areRefsInitialized(refs: ChartRefs): boolean {
  return !!(
    refs.chartCanvas.current &&
    refs.drawingCanvas.current &&
    refs.chartContainer.current
  );
}

/**
 * Gets current price with fallback
 */
export function getCurrentPrice(refs: ChartRefs, fallback: number = 0): number {
  return refs.currentPrice.current || fallback;
}

/**
 * Updates session high/low
 */
export function updateSessionBounds(refs: ChartRefs, price: number): void {
  if (price > refs.sessionHigh.current) {
    refs.sessionHigh.current = price;
  }
  if (price < refs.sessionLow.current) {
    refs.sessionLow.current = price;
  }
}

/**
 * Resets session tracking
 */
export function resetSession(refs: ChartRefs): void {
  refs.sessionHigh.current = 0;
  refs.sessionLow.current = Infinity;
  refs.lastHistoryTime.current = 0;
  refs.lastAlertCheck.current = 0;
}
