/**
 * useLiveVolumeProfile — Tick-accurate Volume Profile for /live
 *
 * Connects to BinanceLiveWS aggTrade stream and feeds real bid/ask trades
 * into the VolumeProfileEngine. Exposes bins, POC, VAH, VAL
 * for the VolumeProfilePanel renderer.
 *
 * Architecture: Engine persists across toggle on/off (keyed on symbol only).
 * WebSocket subscription is active only when enabled. Re-enable reads
 * existing engine data instantly.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import {
  VolumeProfileEngine,
  type PriceBin,
  type ValueArea,
  type ProfileConfig,
} from '@/lib/orderflow/VolumeProfileEngine';

export interface LiveVolumeProfileData {
  bins: PriceBin[];
  valueArea: ValueArea;
  totalVolume: number;
  totalBidVolume: number;
  totalAskVolume: number;
  totalDelta: number;
  maxBinVolume: number;
  profileHigh: number;
  profileLow: number;
}

const EMPTY_DATA: LiveVolumeProfileData = {
  bins: [],
  valueArea: { poc: 0, pocVolume: 0, vah: 0, val: 0, valueAreaVolume: 0, valueAreaPercent: 0 },
  totalVolume: 0,
  totalBidVolume: 0,
  totalAskVolume: 0,
  totalDelta: 0,
  maxBinVolume: 0,
  profileHigh: 0,
  profileLow: 0,
};

/**
 * Determine tick size from symbol name
 */
function getTickSizeForSymbol(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('BTC')) return 10;    // BTC: $10 bins
  if (s.includes('ETH')) return 1;     // ETH: $1 bins
  if (s.includes('SOL')) return 0.1;   // SOL: $0.1 bins
  return 0.01;                          // Small altcoins: $0.01 bins
}

function readEngineData(eng: VolumeProfileEngine): LiveVolumeProfileData {
  const state = eng.getState();
  if (state.tradeCount === 0) return EMPTY_DATA;

  const bins = eng.getBins();
  const valueArea = eng.calculateValueArea();
  const maxBinVolume = bins.reduce((max, b) => Math.max(max, b.totalVolume), 0);

  return {
    bins,
    valueArea,
    totalVolume: state.totalVolume,
    totalBidVolume: state.totalBidVolume,
    totalAskVolume: state.totalAskVolume,
    totalDelta: state.totalDelta,
    maxBinVolume,
    profileHigh: state.profileHigh,
    profileLow: state.profileLow,
  };
}

export function useLiveVolumeProfile(symbol: string, enabled: boolean = true) {
  const [data, setData] = useState<LiveVolumeProfileData>(EMPTY_DATA);
  const engineRef = useRef<VolumeProfileEngine | null>(null);
  const vpHistoryDepth = usePreferencesStore((s) => s.vpHistoryDepth);
  const vpProfileMode = usePreferencesStore((s) => s.vpProfileMode);
  const vpCustomRangeMinutes = usePreferencesStore((s) => s.vpCustomRangeMinutes);

  // Effect 1 — Engine lifecycle (symbol only, persists across toggle)
  useEffect(() => {
    const tickSize = getTickSizeForSymbol(symbol);
    const config: ProfileConfig = {
      tickSize,
      valueAreaPercent: 70,
      sessionType: 'fixed',
      maxBins: 20000,
    };

    engineRef.current = new VolumeProfileEngine(config);
    setData(EMPTY_DATA);

    return () => {
      engineRef.current = null;
    };
  }, [symbol]);

  // Effect 2 — Historical load + live subscription (active only when enabled)
  useEffect(() => {
    if (!enabled || !engineRef.current) return;

    const engine = engineRef.current;
    let cancelled = false;

    // Reset engine when depth/mode settings change to re-fetch with new range
    engine.reset();
    setData(EMPTY_DATA);

    // Load real aggTrades progressively — updates UI every batch
    const loadHistorical = async () => {
      const endTime = Date.now();
      let startTime: number;
      if (vpProfileMode === 'daily') {
        const now = new Date();
        startTime = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      } else {
        const depthMinutes = vpProfileMode === 'custom' ? vpCustomRangeMinutes : vpHistoryDepth;
        startTime = endTime - depthMinutes * 60 * 1000;
      }

      // Load from most recent trades BACKWARDS — user sees current VP immediately
      let cursor = endTime;
      let reqCount = 0;
      const maxRequests = 200; // ~200K trades
      const batchUpdateInterval = 5; // Update UI every 5 requests

      while (cursor > startTime && !cancelled && reqCount < maxRequests) {
        try {
          // Fetch backwards: endTime = cursor, get 1000 trades before cursor
          const params = new URLSearchParams({
            symbol: symbol.toUpperCase(),
            endTime: cursor.toString(),
            limit: '1000',
          });
          const res = await fetch(`/api/binance/fapi/v1/aggTrades?${params}`);
          reqCount++;
          if (!res.ok || cancelled) break;
          const trades = await res.json();
          if (!Array.isArray(trades) || trades.length === 0) break;

          for (const t of trades) {
            engine.processTrade({
              timestamp: t.T,
              price: parseFloat(t.p),
              size: parseFloat(t.q),
              side: t.m ? 'sell' : 'buy',
            });
          }

          // Move cursor backwards
          cursor = trades[0].T - 1;

          // Progressive UI update
          if (reqCount % batchUpdateInterval === 0 && !cancelled && engineRef.current) {
            setData(readEngineData(engineRef.current));
          }

          if (trades.length < 1000) break;

          // Small delay to respect rate limits (2 req/sec safe)
          if (reqCount % 10 === 0) {
            await new Promise(r => setTimeout(r, 500));
          }
        } catch { break; }
      }

      if (!cancelled && engineRef.current) {
        setData(readEngineData(engineRef.current));
      }
    };

    loadHistorical();

    // 2. Subscribe to live tick stream (runs in parallel with historical fetch)
    const ws = getBinanceLiveWS();
    const unsubscribe = ws.onTick((tick) => {
      engine.processTrade({
        timestamp: tick.timestamp,
        price: tick.price,
        size: tick.quantity,
        side: tick.isBuyerMaker ? 'sell' : 'buy',
      });
    });

    // 3. Periodic React state update (4fps throttle)
    const timer = setInterval(() => {
      if (!engineRef.current) return;
      setData(readEngineData(engineRef.current));
    }, 250);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
      // DO NOT null out engineRef — engine persists across toggle
    };
  }, [symbol, enabled, vpHistoryDepth, vpProfileMode, vpCustomRangeMinutes]);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    setData(EMPTY_DATA);
  }, []);

  return { data, reset };
}
