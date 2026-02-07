/**
 * FUTURES DATA HOOK
 *
 * Hook custom qui gère :
 * - Souscription WebSocket au mark price + liquidations
 * - Polling REST toutes les 30s pour OI + Long/Short ratio
 * - Reset automatique au changement de symbole
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import { useFuturesStore } from '@/stores/useFuturesStore';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useFuturesData(symbol: string) {
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const store = useFuturesStore;

  // WebSocket subscriptions
  useEffect(() => {
    const ws = getBinanceLiveWS();

    const unsubMarkPrice = ws.onMarkPrice((update) => {
      store.getState().updateMarkPrice(update);
    });

    const unsubLiquidation = ws.onLiquidation((event) => {
      store.getState().addLiquidation(event);
    });

    return () => {
      unsubMarkPrice();
      unsubLiquidation();
    };
  }, [symbol, store]);

  // REST polling
  const fetchFuturesMetrics = useCallback(async () => {
    const upperSymbol = symbol.toUpperCase();

    try {
      store.getState().setPolling(true);

      const [oiRes, oiHistRes, lsRes, topLsRes] = await Promise.allSettled([
        fetch(`/api/binance/fapi/v1/openInterest?symbol=${upperSymbol}`),
        fetch(`/api/binance/futures/data/openInterestHist?symbol=${upperSymbol}&period=5m&limit=60`),
        fetch(`/api/binance/futures/data/globalLongShortAccountRatio?symbol=${upperSymbol}&period=5m&limit=1`),
        fetch(`/api/binance/futures/data/topLongShortAccountRatio?symbol=${upperSymbol}&period=5m&limit=1`),
      ]);

      // Open Interest
      if (oiRes.status === 'fulfilled' && oiRes.value.ok) {
        const data = await oiRes.value.json();
        store.getState().setOpenInterest(
          parseFloat(data.openInterest),
          parseFloat(data.openInterest) * (store.getState().markPrice || 0)
        );
      }

      // OI History
      if (oiHistRes.status === 'fulfilled' && oiHistRes.value.ok) {
        const data = await oiHistRes.value.json();
        if (Array.isArray(data)) {
          store.getState().setOpenInterestHistory(
            data.map((d: { timestamp: number; sumOpenInterestValue: string }) => ({
              time: d.timestamp,
              value: parseFloat(d.sumOpenInterestValue),
            }))
          );
        }
      }

      // Global Long/Short Ratio
      if (lsRes.status === 'fulfilled' && lsRes.value.ok) {
        const data = await lsRes.value.json();
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[0];
          store.getState().setGlobalLongShort({
            symbol: upperSymbol,
            longShortRatio: parseFloat(latest.longShortRatio),
            longAccount: parseFloat(latest.longAccount),
            shortAccount: parseFloat(latest.shortAccount),
            timestamp: latest.timestamp,
          });
          store.getState().addLongShortHistoryPoint({
            time: latest.timestamp,
            ratio: parseFloat(latest.longShortRatio),
          });
        }
      }

      // Top Trader Long/Short Ratio
      if (topLsRes.status === 'fulfilled' && topLsRes.value.ok) {
        const data = await topLsRes.value.json();
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[0];
          store.getState().setTopTraderLongShort({
            symbol: upperSymbol,
            longShortRatio: parseFloat(latest.longShortRatio),
            longAccount: parseFloat(latest.longAccount),
            shortAccount: parseFloat(latest.shortAccount),
            timestamp: latest.timestamp,
          });
        }
      }
    } catch (error) {
      console.error('[FuturesData] Poll error:', error);
    } finally {
      store.getState().setPolling(false);
    }
  }, [symbol, store]);

  // Start/stop polling + reset on symbol change
  useEffect(() => {
    store.getState().reset();
    fetchFuturesMetrics();

    pollTimerRef.current = setInterval(fetchFuturesMetrics, POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [symbol, fetchFuturesMetrics, store]);
}
