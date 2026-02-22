/**
 * USE HISTORICAL DATA HOOK
 *
 * Custom hook for loading and managing historical candle data
 * Integrates with the market store and provides loading functions
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useMarketStore } from '@/stores/useMarketStore';
import {
  fetchInitialHistory,
  loadMoreHistory,
  clearHistoryCache,
} from '@/lib/api/historicalData';

interface UseHistoricalDataOptions {
  autoLoad?: boolean;
  initialLimit?: number;
  exchange?: 'binance' | 'bybit';
}

export function useHistoricalData(options: UseHistoricalDataOptions = {}) {
  const {
    autoLoad = true,
    initialLimit = 500,
    exchange = 'binance',
  } = options;

  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const candles = useMarketStore((s) => s.candles);
  const isLoadingHistory = useMarketStore((s) => s.isLoadingHistory);
  const historyError = useMarketStore((s) => s.historyError);
  const oldestLoadedTime = useMarketStore((s) => s.oldestLoadedTime);
  const hasMoreHistory = useMarketStore((s) => s.hasMoreHistory);
  const setCandles = useMarketStore((s) => s.setCandles);
  const prependCandles = useMarketStore((s) => s.prependCandles);
  const setLoadingHistory = useMarketStore((s) => s.setLoadingHistory);
  const setHistoryError = useMarketStore((s) => s.setHistoryError);
  const setHasMoreHistory = useMarketStore((s) => s.setHasMoreHistory);

  const loadingRef = useRef(false);
  const lastLoadedRef = useRef<string>('');

  /**
   * Load initial historical data
   */
  const loadInitialHistory = useCallback(async () => {
    const loadKey = `${symbol}_${timeframe}`;

    // Prevent duplicate loads
    if (loadingRef.current || lastLoadedRef.current === loadKey) {
      return;
    }

    loadingRef.current = true;
    lastLoadedRef.current = loadKey;
    setLoadingHistory(true);
    setHistoryError(null);

    try {
      const historicalCandles = await fetchInitialHistory(
        symbol,
        timeframe,
        initialLimit,
        exchange
      );

      if (historicalCandles.length > 0) {
        setCandles(historicalCandles);
        setHasMoreHistory(historicalCandles.length >= initialLimit);
      } else {
        setHasMoreHistory(false);
      }
    } catch (error) {
      console.error('Error loading initial history:', error);
      setHistoryError(error instanceof Error ? error.message : 'Failed to load history');
    } finally {
      setLoadingHistory(false);
      loadingRef.current = false;
    }
  }, [symbol, timeframe, initialLimit, exchange, setCandles, setLoadingHistory, setHistoryError, setHasMoreHistory]);

  /**
   * Load more history (older candles)
   */
  const loadMore = useCallback(async (limit: number = 500) => {
    if (loadingRef.current || !hasMoreHistory || !oldestLoadedTime) {
      return;
    }

    loadingRef.current = true;
    setLoadingHistory(true);
    setHistoryError(null);

    try {
      const olderCandles = await loadMoreHistory(
        symbol,
        timeframe,
        oldestLoadedTime,
        limit,
        exchange
      );

      if (olderCandles.length > 0) {
        prependCandles(olderCandles);
      } else {
        setHasMoreHistory(false);
      }
    } catch (error) {
      console.error('Error loading more history:', error);
      setHistoryError(error instanceof Error ? error.message : 'Failed to load more history');
    } finally {
      setLoadingHistory(false);
      loadingRef.current = false;
    }
  }, [symbol, timeframe, oldestLoadedTime, hasMoreHistory, exchange, prependCandles, setLoadingHistory, setHistoryError, setHasMoreHistory]);

  /**
   * Clear cache and reload
   */
  const refresh = useCallback(async () => {
    clearHistoryCache(symbol, timeframe);
    lastLoadedRef.current = '';
    await loadInitialHistory();
  }, [symbol, timeframe, loadInitialHistory]);

  // Auto-load on mount and when symbol/timeframe changes
  useEffect(() => {
    if (autoLoad) {
      loadInitialHistory();
    }
  }, [autoLoad, loadInitialHistory]);

  // Reset on symbol/timeframe change
  useEffect(() => {
    lastLoadedRef.current = '';
  }, [symbol, timeframe]);

  return {
    candles,
    isLoading: isLoadingHistory,
    error: historyError,
    hasMoreHistory,
    oldestLoadedTime,
    loadInitialHistory,
    loadMore,
    refresh,
  };
}

/**
 * Hook for infinite scroll / pan-to-load behavior
 */
export function useInfiniteHistory(options: {
  threshold?: number; // Time threshold to trigger load
  loadLimit?: number;
  exchange?: 'binance' | 'bybit';
} = {}) {
  const { threshold = 50, loadLimit = 300, exchange = 'binance' } = options;

  const symbol = useMarketStore((s) => s.symbol);
  const timeframe = useMarketStore((s) => s.timeframe);
  const candles = useMarketStore((s) => s.candles);
  const oldestLoadedTime = useMarketStore((s) => s.oldestLoadedTime);
  const hasMoreHistory = useMarketStore((s) => s.hasMoreHistory);
  const isLoadingHistory = useMarketStore((s) => s.isLoadingHistory);
  const prependCandles = useMarketStore((s) => s.prependCandles);
  const setLoadingHistory = useMarketStore((s) => s.setLoadingHistory);
  const setHasMoreHistory = useMarketStore((s) => s.setHasMoreHistory);

  const loadingRef = useRef(false);
  const lastTriggerRef = useRef(0);

  /**
   * Check if we should load more based on visible time range
   */
  const checkAndLoadMore = useCallback(async (visibleStartTime: number) => {
    if (!oldestLoadedTime || !hasMoreHistory || loadingRef.current || isLoadingHistory) {
      return;
    }

    // Calculate how close we are to the oldest loaded time
    const candlesBeforeVisible = candles.filter(c => c.time < visibleStartTime).length;

    // If we're within threshold candles of the start, load more
    if (candlesBeforeVisible < threshold) {
      // Debounce
      const now = Date.now();
      if (now - lastTriggerRef.current < 2000) return;
      lastTriggerRef.current = now;

      loadingRef.current = true;
      setLoadingHistory(true);

      try {
        const olderCandles = await loadMoreHistory(
          symbol,
          timeframe,
          oldestLoadedTime,
          loadLimit,
          exchange
        );

        if (olderCandles.length > 0) {
          prependCandles(olderCandles);
        } else {
          setHasMoreHistory(false);
        }
      } catch (error) {
        console.error('Error loading more history:', error);
      } finally {
        setLoadingHistory(false);
        loadingRef.current = false;
      }
    }
  }, [
    symbol,
    timeframe,
    candles,
    oldestLoadedTime,
    hasMoreHistory,
    isLoadingHistory,
    threshold,
    loadLimit,
    exchange,
    prependCandles,
    setLoadingHistory,
    setHasMoreHistory,
  ]);

  return {
    checkAndLoadMore,
    isLoading: isLoadingHistory,
    hasMoreHistory,
  };
}
