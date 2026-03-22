import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ChartCandle } from '@/lib/rendering/CanvasChartEngine';
import {
  getAggregator,
  resetAggregator,
  type LiveCandle,
  type TimeframeSeconds,
} from '@/lib/live/HierarchicalAggregator';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { getCMELiveAdapter } from '@/lib/live/getCMELiveAdapter';
import { isCMESymbol } from '@/lib/utils/symbolUtils';
import { useAlertsStore } from '@/stores/useAlertsStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { type AssetCategory, SYMBOL_CATEGORIES_BY_ASSET } from '../constants/symbols';
import { TF_TO_BINANCE } from '../constants/timeframes';
import { fetchRealSubCandles } from '../utils/candles';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import type { SharedRefs } from './types';

// Cached formatter to avoid creating options object on every candle update
const priceFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatVolumeCompact(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(1);
}

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
  const [noData, setNoData] = useState(false);
  const [assetCategory, setAssetCategory] = useState<AssetCategory>('crypto');
  const [showSymbolSearch, _setShowSymbolSearch] = useState(false);
  const [searchOpenedAt, setSearchOpenedAt] = useState(0);
  const setShowSymbolSearch = useCallback((v: boolean) => {
    _setShowSymbolSearch(v);
    if (v) setSearchOpenedAt(Date.now());
  }, []);
  const [symbolSearchQuery, setSymbolSearchQuery] = useState('');
  const [viewportState, setViewportState] = useState({ priceMin: 0, priceMax: 100, chartHeight: 400 });

  const checkAlerts = useAlertsStore((s) => s.checkAlerts);
  const notifications = useAlertsStore((s) => s.notifications);
  const dismissNotification = useAlertsStore((s) => s.dismissNotification);
  const updatePositionPrices = useTradingStore((s) => s.updatePositionPrices);

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
    setLoadingPhase('fetching');
    try {
      if (isCMESymbol(sym)) {
        // Load history from Tradovate (md/getChart) — OHLCV with bid/ask volume split
        return await new Promise<LiveCandle[]>(async (resolve) => {
          const intervalMin = Math.max(1, Math.floor(tf / 60));
          let resolved = false;
          const timer = setTimeout(() => { if (!resolved) { resolved = true; resolve([]); } }, 12_000);

          await getCMELiveAdapter().connect(sym).catch(() => {});

          const { tradovateWS } = await import('@/lib/websocket/TradovateWS');
          await tradovateWS.subscribeChart(sym, intervalMin, () => {}, (candles) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            resolve(candles.map(c => ({
              time:       c.time,
              open:       c.open,
              high:       c.high,
              low:        c.low,
              close:      c.close,
              volume:     c.volume,
              buyVolume:  c.volume * 0.5,   // approximate — no level-by-level split in OHLCV
              sellVolume: c.volume * 0.5,
              trades:     0,
            })));
          });
        });
      }

      // Sub-minute: fetch real 1s klines and aggregate into 15s/30s
      if (tf < 60) {
        return await fetchRealSubCandles(sym, tf, 300, AbortSignal.timeout(30_000));
      }

      const binanceInterval = TF_TO_BINANCE[tf] || '1m';
      const limit = 500;

      const response = await fetch(
        `/api/binance/api/v3/klines?symbol=${sym.toUpperCase()}&interval=${binanceInterval}&limit=${limit}`,
        { headers: { 'x-market': 'spot' }, signal: AbortSignal.timeout(15_000) }
      );

      const data = await response.json();

      if (!Array.isArray(data)) {
        return [];
      }

      return data.map((k: (string | number)[]) => {
        const totalVolume = parseFloat(k[5] as string);
        // k[9] = Taker buy base asset volume (from Binance klines API)
        const takerBuyVolume = k[9] != null ? parseFloat(k[9] as string) : 0;
        const takerSellVolume = totalVolume - takerBuyVolume;
        return {
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1] as string),
          high: parseFloat(k[2] as string),
          low: parseFloat(k[3] as string),
          close: parseFloat(k[4] as string),
          volume: totalVolume,
          buyVolume: takerBuyVolume,
          sellVolume: Math.max(0, takerSellVolume),
          trades: Number(k[8]),
        };
      }) as LiveCandle[];
    } catch {
      return [];
    } finally {
      setLoadingPhase('rendering');
      requestAnimationFrame(() => {
        setLoadingPhase(null);
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
      buyVolume: c.buyVolume || 0,
      sellVolume: c.sellVolume || 0,
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
      refs.price.current.textContent = `$${priceFormatter.format(lastCandle.close)}`;
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
      setNoData(false);

      // Load history
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      if (history.length > 0) {
        updateChartData(history);
      } else {
        // No history — wait 10s for live data before showing "no data"
        const noDataTimer = setTimeout(() => {
          if (isMounted && refs.candles.current.length === 0) {
            setNoData(true);
          }
        }, 10_000);
        refs.unsubscribers.current.push(() => clearTimeout(noDataTimer));
      }

      // Connect WebSocket (Tradovate for CME, Binance for crypto)
      const isCME = isCMESymbol(symbol);
      const ws = isCME ? getCMELiveAdapter() : getBinanceLiveWS();
      const aggregator = getAggregator();

      // Disconnect previous WebSocket to ensure clean reconnect with new symbol
      ws.disconnect();

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

        // Clear "no data" state on first live candle
        if (refs.candles.current.length === 0) {
          setNoData(false);
        }

        // Update price directly in DOM
        if (refs.price.current) {
          refs.currentPrice.current = candle.close;
          refs.price.current.textContent = `$${priceFormatter.format(candle.close)}`;
        }

        // Update OHLC + volume directly in DOM (no re-render)
        if (refs.ohlcOpen?.current) refs.ohlcOpen.current.textContent = priceFormatter.format(candle.open);
        if (refs.ohlcHigh?.current) refs.ohlcHigh.current.textContent = priceFormatter.format(candle.high);
        if (refs.ohlcLow?.current) refs.ohlcLow.current.textContent = priceFormatter.format(candle.low);
        if (refs.ohlcClose?.current) refs.ohlcClose.current.textContent = priceFormatter.format(candle.close);
        if (refs.footerVolume?.current) refs.footerVolume.current.textContent = formatVolumeCompact(candle.volume);

        // Check price alerts + update positions + viewport (throttled)
        const now = Date.now();
        if (now - refs.lastAlertCheck.current > 250) {
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
              buyVolume: candle.buyVolume,
              sellVolume: candle.sellVolume,
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
          }, 150);
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
  }, [symbol, timeframe]);

  /**
   * Change symbol
   */
  const handleSymbolChange = useCallback((newSymbol: string) => {
    if (newSymbol === symbol) return;
    // Clear chart immediately for visual feedback
    if (refs.chartEngine.current) {
      refs.candles.current = [];
      refs.candleData.current.clear();
    }
    // State update triggers the main effect which handles:
    // cleanup old subscriptions → load history → connect WebSocket
    // Do NOT call getBinanceLiveWS().changeSymbol() here — it desynchs
    setSymbol(newSymbol);
    onSymbolChange?.(newSymbol);
  }, [symbol, refs, onSymbolChange]);

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

  // Sync viewport state immediately on scroll/zoom (for VP panel sync)
  useEffect(() => {
    const engine = refs.chartEngine.current;
    if (!engine) return;
    const updateViewport = () => {
      const vp = engine.getViewport();
      setViewportState({ priceMin: vp.priceMin, priceMax: vp.priceMax, chartHeight: vp.chartHeight });
    };
    engine.addViewportChangeListener(updateViewport);
    return () => engine.removeViewportChangeListener(updateViewport);
  }, [refs]);

  // Selected symbol label
  const allSymbols = Object.values(currentSymbolCategories).flat();
  const selectedSymbolLabel = allSymbols.find(s => s.value === symbol)?.label || symbol.toUpperCase();

  return {
    symbol,
    timeframe,
    status,
    loadingPhase,
    noData,
    assetCategory,
    setAssetCategory,
    showSymbolSearch,
    setShowSymbolSearch,
    searchOpenedAt,
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
