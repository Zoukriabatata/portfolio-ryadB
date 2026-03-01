/**
 * useLiveFootprint — Tick-accurate Footprint Cluster data for /live
 *
 * Creates its own OrderflowEngine instance, subscribes to BinanceLiveWS ticks,
 * and maintains a Map of FootprintCandle keyed by candle time.
 * The ClusterRenderer queries this map via getFootprintForTime().
 */

import { useEffect, useRef, useCallback } from 'react';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import {
  OrderflowEngine,
  type FootprintCandle,
} from '@/lib/orderflow/OrderflowEngine';
import type { TimeframeSeconds } from '@/lib/live/HierarchicalAggregator';

interface UseLiveFootprintParams {
  symbol: string;
  timeframe: TimeframeSeconds;
  enabled: boolean;
}

function getTickSizeForSymbol(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('BTC')) return 10;
  if (s.includes('ETH')) return 1;
  if (s.includes('SOL')) return 0.1;
  return 0.01;
}

export function useLiveFootprint({ symbol, timeframe, enabled }: UseLiveFootprintParams) {
  const engineRef = useRef<OrderflowEngine | null>(null);
  const footprintMapRef = useRef<Map<number, FootprintCandle>>(new Map());

  useEffect(() => {
    if (!enabled) {
      engineRef.current = null;
      return;
    }

    const tickSize = getTickSizeForSymbol(symbol);
    const engine = new OrderflowEngine({ tickSize });
    engineRef.current = engine;
    footprintMapRef.current.clear();

    const ws = getBinanceLiveWS();

    // Subscribe to ticks and feed to engine
    const unsubTick = ws.onTick((tick) => {
      engine.processTick(tick);
    });

    // Listen for footprint updates on the selected timeframe
    const onUpdate = (candle: FootprintCandle, tf: TimeframeSeconds) => {
      if (tf !== timeframe) return;
      footprintMapRef.current.set(candle.time, candle);
    };

    const onClose = (candle: FootprintCandle, tf: TimeframeSeconds) => {
      if (tf !== timeframe) return;
      footprintMapRef.current.set(candle.time, candle);
      // Cap stored candles to prevent memory growth
      if (footprintMapRef.current.size > 600) {
        const oldest = footprintMapRef.current.keys().next().value;
        if (oldest !== undefined) footprintMapRef.current.delete(oldest);
      }
    };

    const unsubUpdate = engine.on('footprint:update', onUpdate);
    const unsubClose = engine.on('footprint:close', onClose);

    return () => {
      unsubTick();
      unsubUpdate();
      unsubClose();
      engineRef.current = null;
    };
  }, [symbol, timeframe, enabled]);

  const getFootprintForTime = useCallback((time: number): FootprintCandle | undefined => {
    return footprintMapRef.current.get(time);
  }, []);

  return { getFootprintForTime };
}
