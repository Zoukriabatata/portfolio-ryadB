/**
 * useLiveVolumeProfile — Hook into shared VolumeProfileService
 *
 * The VP is a SINGLETON per symbol — all timeframes (M1, M5, M15...)
 * share the EXACT same VP data. This matches ATAS behavior.
 *
 * The VolumeProfileService handles:
 * - IndexedDB caching (instant reload on page refresh)
 * - Progressive aggTrades loading (real tick data, not klines)
 * - Live WebSocket updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { startVPLoad, stopVPLoad, subscribeVP, getVPData } from '@/lib/orderflow/VolumeProfileService';
import type { PriceBin, ValueArea } from '@/lib/orderflow/VolumeProfileEngine';

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

export function useLiveVolumeProfile(symbol: string, enabled: boolean = true) {
  const [data, setData] = useState<LiveVolumeProfileData>(EMPTY_DATA);
  const prevSymbolRef = useRef(symbol);

  // Reset when symbol changes
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      setData(EMPTY_DATA);
      stopVPLoad(prevSymbolRef.current);
      prevSymbolRef.current = symbol;
    }
  }, [symbol]);

  useEffect(() => {
    if (!enabled) return;

    // Subscribe to VP updates from shared service
    const unsub = subscribeVP(symbol, () => {
      const vpData = getVPData(symbol);
      if (!vpData) return;

      const maxBinVolume = vpData.bins.reduce((max, b) => Math.max(max, b.totalVolume), 0);
      const profileHigh = vpData.bins.length > 0 ? Math.max(...vpData.bins.map(b => b.price)) : 0;
      const profileLow = vpData.bins.length > 0 ? Math.min(...vpData.bins.map(b => b.price)) : 0;

      setData({
        bins: vpData.bins,
        valueArea: vpData.valueArea,
        totalVolume: vpData.totalVolume,
        totalBidVolume: vpData.bins.reduce((s, b) => s + b.bidVolume, 0),
        totalAskVolume: vpData.bins.reduce((s, b) => s + b.askVolume, 0),
        totalDelta: vpData.bins.reduce((s, b) => s + b.delta, 0),
        maxBinVolume,
        profileHigh,
        profileLow,
      });
    });

    // Start loading (no-op if already loading for this symbol)
    startVPLoad(symbol);

    return () => {
      unsub();
    };
  }, [symbol, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVPLoad(symbol);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    stopVPLoad(symbol);
    setData(EMPTY_DATA);
    if (enabled) startVPLoad(symbol);
  }, [symbol, enabled]);

  return { data, reset };
}
