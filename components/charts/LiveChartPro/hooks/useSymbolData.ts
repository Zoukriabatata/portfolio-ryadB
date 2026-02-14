import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import {
  getAggregator,
  resetAggregator,
  type LiveCandle,
  type TimeframeSeconds,
} from '@/lib/live/HierarchicalAggregator';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { getIBLiveWS } from '@/lib/live/IBLiveWS';
import { isCMESymbol } from '@/lib/utils/symbolUtils';
import { useAlertsStore } from '@/stores/useAlertsStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { type AssetCategory, SYMBOL_CATEGORIES_BY_ASSET } from '../constants/symbols';
import { TF_TO_BINANCE } from '../constants/timeframes';
import { subdivideCandles } from '../utils/candles';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs } from './types';

interface UseSymbolDataParams {
  refs: SharedRefs;
  theme: ChartTheme;
  updatePricePositionIndicator: () => void;
  onSymbolChange?: (symbol: string) => void;
}

export function useSymbolData({ refs, theme, updatePricePositionIndicator, onSymbolChange }: UseSymbolDataParams) {
  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(60);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [loadingPhase, setLoadingPhase] = useState<'fetching' | 'rendering' | 'connecting' | null>('fetching');
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('crypto');
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [viewportState, setViewportState] = useState({ priceMin: 0, priceMax: 100, chartHeight: 400 });

  const { checkAlerts, notifications, dismissNotification } = useAlertsStore();
  const { updatePositionPrices } = useTradingStore();

  // Auto-dismiss alert notifications after 5s
  useEffect(() => {
    if (notifications.length === 0) return;
    const timer = setTimeout(() => {
      dismissNotification(notifications[0].id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notifications, dismissNotification]);

  /**
   * Load history from Binance API (CME requires IB Gateway)
   */
  const loadHistory = useCallback(async (sym: string, tf: TimeframeSeconds) => {
    console.log('[useSymbolData] loadHistory START:', { sym, tf });
    setLoadingPhase('fetching');
    try {
      if (isCMESymbol(sym)) {
        // CME historical data requires IB Gateway connection
        // IB live WS will provide real-time candles once connected
        console.log('[useSymbolData] CME symbol detected - history requires IB Gateway');
        return [];
      }

      const binanceInterval = TF_TO_BINANCE[tf] || '1m';
      const limit = 500;

      console.log('[useSymbolData] Fetching Binance klines:', { sym, binanceInterval, limit });
      // Call via proxy (klines is a public endpoint, no auth required)
      const response = await fetch(
        `/api/binance/api/v3/klines?symbol=${sym.toUpperCase()}&interval=${binanceInterval}&limit=${limit}`,
        { headers: { 'x-market': 'spot' } }
      );

      console.log('[useSymbolData] Response status:', response.status, response.ok);
      const data = await response.json();
      console.log('[useSymbolData] Response data:', Array.isArray(data) ? `Array(${data.length})` : data);

      if (!Array.isArray(data)) {
        console.error('[useSymbolData] Invalid Binance response - not an array:', data);
        return [];
      }

      const candles: LiveCandle[] = data.map((k: (string | number)[]) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        buyVolume: 0,
        sellVolume: 0,
        trades: Number(k[8]),
      }));

      if (tf < 60) {
        console.log('[useSymbolData] Subdividing candles for tf < 60s');
        const subdivided = subdivideCandles(candles, tf);
        console.log('[useSymbolData] Subdivided candles:', subdivided.length);
        return subdivided;
      }

      console.log('[useSymbolData] Returning candles:', candles.length);
      return candles;
    } catch (error) {
      console.error('[useSymbolData] Failed to load history:', error);
      return [];
    } finally {
      console.log('[useSymbolData] Setting loadingPhase to rendering');
      setLoadingPhase('rendering');
      requestAnimationFrame(() => {
        setTimeout(() => {
          setLoadingPhase(prev => prev === 'rendering' ? 'connecting' : prev);
          setTimeout(() => setLoadingPhase(null), 600);
        }, 300);
      });
    }
  }, []);

  /**
   * Get current symbol categories based on asset type
   */
  const currentSymbolCategories = useMemo(() => {
    return SYMBOL_CATEGORIES_BY_ASSET[assetCategory] || SYMBOL_CATEGORIES_BY_ASSET.crypto;
  }, [assetCategory]);

  /**
   * Filter symbols by search query
   */
  const filteredSymbols = useMemo(() => {
    if (!symbolSearchQuery.trim()) return currentSymbolCategories;

    const query = symbolSearchQuery.toLowerCase();
    const filtered: Record<string, { value: string; label: string; exchange?: string }[]> = {};

    Object.entries(currentSymbolCategories).forEach(([category, symbols]) => {
      const matches = symbols.filter(
        s => s.label.toLowerCase().includes(query) || s.value.toLowerCase().includes(query)
      );
      if (matches.length > 0) {
        filtered[category] = matches;
      }
    });

    return filtered;
  }, [symbolSearchQuery, currentSymbolCategories]);

  /**
   * Update chart with data
   */
  const updateChartData = useCallback((candles: LiveCandle[]) => {
    if (!refs.chartEngine.current || candles.length === 0) return;

    const chartCandles: ChartCandle[] = candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    refs.chartEngine.current.setCandles(chartCandles);
    refs.candles.current = chartCandles;

    // Store candle data for magnet snapping
    refs.candleData.current.clear();
    candles.forEach(c => {
      refs.candleData.current.set(c.time, {
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    });

    // Store the last historical timestamp
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      refs.lastHistoryTime.current = lastCandle.time;
    }

    // Update price
    if (lastCandle && refs.price.current) {
      refs.currentPrice.current = lastCandle.close;
      refs.price.current.textContent = `$${lastCandle.close.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }

    // Update session high/low for price position indicator
    if (candles.length > 0) {
      let high = candles[0].high;
      let low = candles[0].low;
      for (let i = 1; i < candles.length; i++) {
        if (candles[i].high > high) high = candles[i].high;
        if (candles[i].low < low) low = candles[i].low;
      }
      refs.sessionHigh.current = high;
      refs.sessionLow.current = low;
      updatePricePositionIndicator();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load history and connect WebSocket
   */
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // Clean up previous subscriptions
      refs.unsubscribers.current.forEach(unsub => unsub());
      refs.unsubscribers.current = [];

      // Reset aggregator for fresh start
      resetAggregator();
      refs.lastHistoryTime.current = 0;

      // Load history
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      if (history.length > 0) {
        updateChartData(history);
      }

      // Connect WebSocket (IB for CME, Binance for crypto)
      const isCME = isCMESymbol(symbol);
      const ws = isCME ? getIBLiveWS() : getBinanceLiveWS();
      const aggregator = getAggregator();

      const unsubStatus = ws.onStatus((s) => {
        if (!isMounted) return;
        setStatus(s);
        if (refs.statusDot.current) {
          refs.statusDot.current.style.backgroundColor =
            s === 'connected' ? theme.colors.success :
            s === 'connecting' ? theme.colors.warning :
            theme.colors.error;
        }
      });
      refs.unsubscribers.current.push(unsubStatus);

      // Update price and chart without React re-renders
      const unsubCandle = aggregator.on('candle:update', (candle, tf) => {
        if (tf !== timeframe || !isMounted) return;

        // Update price directly in DOM
        if (refs.price.current) {
          refs.currentPrice.current = candle.close;
          refs.price.current.textContent = `$${candle.close.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
        }

        // Check price alerts + update positions + viewport (throttled)
        const now = Date.now();
        if (now - refs.lastAlertCheck.current > 1000) {
          refs.lastAlertCheck.current = now;
          checkAlerts(symbol, candle.close);
          updatePositionPrices(symbol.toUpperCase(), candle.close);
          if (refs.chartEngine.current) {
            const vp = refs.chartEngine.current.getViewport();
            setViewportState({ priceMin: vp.priceMin, priceMax: vp.priceMax, chartHeight: vp.chartHeight });
          }
        }

        // Update session high/low
        if (candle.high > refs.sessionHigh.current) {
          refs.sessionHigh.current = candle.high;
        }
        if (candle.low < refs.sessionLow.current) {
          refs.sessionLow.current = candle.low;
        }
        updatePricePositionIndicator();

        // Only update chart if candle time >= last history time
        if (candle.time >= refs.lastHistoryTime.current) {
          refs.candleData.current.set(candle.time, {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });

          if (refs.chartEngine.current) {
            const chartCandle: ChartCandle = {
              time: candle.time,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
            };
            refs.chartEngine.current.updateCandle(chartCandle);

            const existingIndex = refs.candles.current.findIndex(c => c.time === candle.time);
            if (existingIndex >= 0) {
              refs.candles.current[existingIndex] = chartCandle;
            } else {
              refs.candles.current.push(chartCandle);
            }
          }
        }
      });
      refs.unsubscribers.current.push(unsubCandle);

      // Tick counter (throttled)
      let tickUpdateTimer: ReturnType<typeof setTimeout> | null = null;
      const unsubTick = ws.onTick(() => {
        if (!tickUpdateTimer) {
          tickUpdateTimer = setTimeout(() => {
            if (refs.tickCount.current) {
              refs.tickCount.current.textContent = ws.getTickCount().toLocaleString();
            }
            tickUpdateTimer = null;
          }, 500);
        }
      });
      refs.unsubscribers.current.push(unsubTick);
      refs.unsubscribers.current.push(() => {
        if (tickUpdateTimer) clearTimeout(tickUpdateTimer);
      });

      await ws.connect(symbol);
    };

    init();

    return () => {
      isMounted = false;
      refs.unsubscribers.current.forEach(unsub => unsub());
      refs.unsubscribers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe]);

  /**
   * Change symbol
   */
  const handleSymbolChange = useCallback((newSymbol: string) => {
    if (newSymbol === symbol) return;
    setSymbol(newSymbol);
    getBinanceLiveWS().changeSymbol(newSymbol);
    onSymbolChange?.(newSymbol);
  }, [symbol, onSymbolChange]);

  /**
   * Change timeframe
   */
  const handleTimeframeChange = useCallback(async (newTf: TimeframeSeconds) => {
    if (newTf === timeframe) return;
    setTimeframe(newTf);

    const history = await loadHistory(symbol, newTf);
    if (history.length > 0) {
      updateChartData(history);
    }
  }, [timeframe, symbol, loadHistory, updateChartData]);

  // Keep ref in sync
  refs.handleTimeframeChange.current = handleTimeframeChange;

  // Selected symbol label
  const allSymbols = Object.values(currentSymbolCategories).flat();
  const selectedSymbolLabel = allSymbols.find(s => s.value === symbol)?.label || symbol.toUpperCase();

  return {
    symbol,
    timeframe,
    status,
    loadingPhase,
    assetCategory,
    setAssetCategory,
    showSymbolSearch,
    setShowSymbolSearch,
    symbolSearchQuery,
    setSymbolSearchQuery,
    currentSymbolCategories,
    filteredSymbols,
    handleSymbolChange,
    handleTimeframeChange,
    selectedSymbolLabel,
    viewportState,
    notifications,
    dismissNotification,
  };
}
