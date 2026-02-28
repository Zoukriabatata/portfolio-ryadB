/**
 * useLiveVolumeProfile — Tick-accurate Volume Profile for /live
 *
 * Connects to BinanceLiveWS aggTrade stream and feeds real bid/ask trades
 * into the VolumeProfileEngine singleton. Exposes bins, POC, VAH, VAL
 * for the VolumeProfilePanel renderer.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import {
  VolumeProfileEngine,
  PROFILE_CONFIGS,
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

export function useLiveVolumeProfile(symbol: string, enabled: boolean = true) {
  const [data, setData] = useState<LiveVolumeProfileData>(EMPTY_DATA);
  const engineRef = useRef<VolumeProfileEngine | null>(null);
  const updateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize engine when symbol changes
  useEffect(() => {
    if (!enabled) return;

    const tickSize = getTickSizeForSymbol(symbol);
    const config: ProfileConfig = {
      tickSize,
      valueAreaPercent: 70,
      sessionType: 'fixed',
      maxBins: 20000,
    };

    const engine = new VolumeProfileEngine(config);
    engineRef.current = engine;

    // Subscribe to tick stream
    const ws = getBinanceLiveWS();
    const unsubscribe = ws.onTick((tick) => {
      engine.processTrade({
        timestamp: tick.timestamp,
        price: tick.price,
        size: tick.quantity,
        // isBuyerMaker = true means the buyer is the maker,
        // so the sell aggressor hit the bid -> side = 'sell'
        side: tick.isBuyerMaker ? 'sell' : 'buy',
      });
    });

    // Update React state periodically (throttled to 4fps to avoid excessive re-renders)
    updateTimerRef.current = setInterval(() => {
      const eng = engineRef.current;
      if (!eng) return;

      const state = eng.getState();
      if (state.tradeCount === 0) return;

      const bins = eng.getBins();
      const valueArea = eng.calculateValueArea();
      const maxBinVolume = bins.reduce((max, b) => Math.max(max, b.totalVolume), 0);

      setData({
        bins,
        valueArea,
        totalVolume: state.totalVolume,
        totalBidVolume: state.totalBidVolume,
        totalAskVolume: state.totalAskVolume,
        totalDelta: state.totalDelta,
        maxBinVolume,
        profileHigh: state.profileHigh,
        profileLow: state.profileLow,
      });
    }, 250);

    return () => {
      unsubscribe();
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      engineRef.current = null;
    };
  }, [symbol, enabled]);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    setData(EMPTY_DATA);
  }, []);

  return { data, reset };
}
