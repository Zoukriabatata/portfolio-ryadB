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
import { usePageActive } from '@/hooks/usePageActive';
import { throttledFetch } from '@/lib/api/throttledFetch';

const POLL_INTERVAL = 30_000; // 30 seconds

// Only subscribe for crypto symbols (lowercase, ends with usdt/busd/btc)
function isCryptoSymbol(sym: string): boolean {
  const lower = sym.toLowerCase();
  return lower.endsWith('usdt') || lower.endsWith('busd') || lower.endsWith('btc') || lower.endsWith('eth');
}

export function useFuturesData(symbol: string) {
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);
  const store = useFuturesStore;
  const isCrypto = isCryptoSymbol(symbol);
  const isActive = usePageActive();

  // WebSocket subscriptions — only when page is active
  useEffect(() => {
    if (!isCrypto || !isActive) return;
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
  }, [symbol, isCrypto, isActive]);

  // REST polling
  const fetchFuturesMetrics = useCallback(async () => {
    if (!isCrypto) return;
    const upperSymbol = symbol.toUpperCase();

    try {
      store.getState().setPolling(true);

      const [oiRes, oiHistRes, lsRes, topLsRes] = await Promise.allSettled([
        throttledFetch(`/api/binance/fapi/v1/openInterest?symbol=${upperSymbol}`),
        throttledFetch(`/api/binance/futures/data/openInterestHist?symbol=${upperSymbol}&period=5m&limit=60`),
        throttledFetch(`/api/binance/futures/data/globalLongShortAccountRatio?symbol=${upperSymbol}&period=5m&limit=1`),
        throttledFetch(`/api/binance/futures/data/topLongShortAccountRatio?symbol=${upperSymbol}&period=5m&limit=1`),
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
      // Track consecutive failures for error state
      const allFailed = [oiRes, oiHistRes, lsRes, topLsRes].every(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
      );
      if (allFailed) {
        failCountRef.current++;
        if (failCountRef.current >= 2) {
          store.getState().setMetricsError(true);
        }
      } else {
        failCountRef.current = 0;
        if (store.getState().metricsError) {
          store.getState().setMetricsError(false);
        }
      }
    } catch (error) {
      console.error('[FuturesData] Poll error:', error);
      failCountRef.current++;
      if (failCountRef.current >= 2) {
        store.getState().setMetricsError(true);
      }
    } finally {
      store.getState().setPolling(false);
    }
  }, [symbol, isCrypto]);

  // Start/stop polling + reset on symbol change — only when page is active
  useEffect(() => {
    if (!isCrypto || !isActive) return;
    failCountRef.current = 0;
    store.getState().reset();
    fetchFuturesMetrics();

    pollTimerRef.current = setInterval(fetchFuturesMetrics, POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [symbol, isActive, fetchFuturesMetrics]);
}
