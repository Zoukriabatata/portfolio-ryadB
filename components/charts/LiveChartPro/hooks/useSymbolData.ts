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
import { validateInstrumentPrice, validateCandle, getDxFeedSymbol } from '@/lib/instruments';
import { dxFeedWS } from '@/lib/websocket/DxFeedWS';
import { useAlertsStore } from '@/stores/useAlertsStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { type AssetCategory, SYMBOL_CATEGORIES_BY_ASSET } from '../constants/symbols';
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
  // Restore last viewed symbol/timeframe/asset from localStorage so a refresh
  // keeps the user where they were instead of dumping them back on BTC/USDT.
  const STORAGE_KEY = 'liveChart.session';
  const [symbol, setSymbol] = useState<string>(() => {
    if (typeof window === 'undefined') return 'btcusdt';
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      return typeof saved?.symbol === 'string' && saved.symbol ? saved.symbol : 'btcusdt';
    } catch { return 'btcusdt'; }
  });
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(() => {
    if (typeof window === 'undefined') return 60;
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      const tf = saved?.timeframe;
      return typeof tf === 'number' && tf > 0 ? (tf as TimeframeSeconds) : 60;
    } catch { return 60; }
  });
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [loadingPhase, setLoadingPhase] = useState<'fetching' | 'rendering' | 'connecting' | null>('fetching');
  const [noData, setNoData] = useState(false);
  const [assetCategory, setAssetCategory] = useState<AssetCategory>(() => {
    if (typeof window === 'undefined') return 'crypto';
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      const cat = saved?.assetCategory;
      const valid: AssetCategory[] = ['crypto', 'futures', 'options'] as AssetCategory[];
      return (valid as string[]).includes(cat) ? (cat as AssetCategory) : 'crypto';
    } catch { return 'crypto'; }
  });

  // Persist current symbol / TF / asset on every change so a Ctrl+Shift+R
  // brings the user back to the same chart.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ symbol, timeframe, assetCategory }));
    } catch { /* localStorage full or blocked — silently ignore */ }
  }, [symbol, timeframe, assetCategory]);
  const [showSymbolSearch, _setShowSymbolSearch] = useState(false);
  const [searchOpenedAt, setSearchOpenedAt] = useState(0);
  // CME data source state — tracks Yahoo Finance polling health
  const [cmeDataMode, setCmeDataMode] = useState<'ok' | 'stale' | 'error' | null>(null);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [staleAgo, setStaleAgo] = useState('');
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
    try {
      if (isCMESymbol(sym)) {
        type CandleRow = { time: number; open: number; high: number; low: number; close: number; volume: number };
        // Align time to TF boundary — Yahoo / Stooq sometimes return timestamps
        // a few seconds off from the minute boundary. Without alignment, two polls
        // returning slightly different timestamps for the same minute would create
        // two separate candles in the chart instead of updating one.
        const align = (t: number) => Math.floor(t / tf) * tf;
        const toCandle = (c: CandleRow): LiveCandle => ({
          time: align(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume || 0, buyVolume: (c.volume || 0) * 0.5, sellVolume: (c.volume || 0) * 0.5, trades: 0,
        });

        // 1. Yahoo Finance — fast HTTP, works for FREE users, no credentials needed
        try {
          const yahooRes = await fetch(
            `/api/futures-history?symbol=${encodeURIComponent(sym)}&timeframe=${tf}&days=5`,
            { signal: AbortSignal.timeout(8_000) }
          );
          if (yahooRes.ok) {
            const yahooData = await yahooRes.json();
            if (Array.isArray(yahooData) && yahooData.length > 0) {
              const candles = yahooData.map(toCandle).filter((c: LiveCandle) =>
                validateCandle(c, sym) && validateInstrumentPrice(sym, c.close)
              );
              if (candles.length > 0) return candles;
            }
          }
        } catch { /* Yahoo unavailable */ }

        // 2. Tradovate — only attempt if credentials are configured (avoids 5s needless wait)
        const { useDataFeedStore } = await import('@/stores/useDataFeedStore');
        const configs = useDataFeedStore.getState().configs;
        const hasTradovate = configs['tradovate']?.status === 'connected' || configs['tradovate']?.status === 'configured';
        if (hasTradovate) {
          const tradovateCandles = await new Promise<LiveCandle[]>(async (resolve) => {
            const intervalMin = Math.max(1, Math.floor(tf / 60));
            let resolved = false;
            const timer = setTimeout(() => { if (!resolved) { resolved = true; resolve([]); } }, 5_000);
            const { tradovateWS } = await import('@/lib/websocket/TradovateWS');
            await tradovateWS.subscribeChart(sym, intervalMin, () => {}, (candles) => {
              if (resolved) return;
              resolved = true;
              clearTimeout(timer);
              resolve(candles.map(c => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                volume: c.volume, buyVolume: c.volume * 0.5, sellVolume: c.volume * 0.5, trades: 0,
              })));
            });
          });
          if (tradovateCandles.length > 0) return tradovateCandles.filter(c =>
            validateCandle(c, sym) && validateInstrumentPrice(sym, c.close)
          );
        }

        // 3. dxFeed history REST endpoint
        try {
          const dxSymbol = sym.startsWith('/') ? sym : `/${sym}`;
          const dxRes = await fetch(
            `/api/dxfeed/history?symbol=${encodeURIComponent(dxSymbol)}&timeframe=${tf}&limit=500`,
            { signal: AbortSignal.timeout(5_000) }
          );
          if (dxRes.ok) {
            const dxData = await dxRes.json();
            if (Array.isArray(dxData) && dxData.length > 0) {
              return dxData.map(toCandle).filter((c: LiveCandle) =>
                validateCandle(c, sym) && validateInstrumentPrice(sym, c.close)
              );
            }
          }
        } catch { /* dxFeed history unavailable */ }

        return [];
      }

      // Sub-minute: fetch real 1s klines and aggregate into 15s/30s
      if (tf < 60) {
        return await fetchRealSubCandles(sym, tf, 300, AbortSignal.timeout(30_000));
      }

      // Crypto history from Bybit linear (same exchange as the live WebSocket).
      // Mixing Binance history with Bybit live data was creating visible chart
      // divergence vs TradingView (different basis, different liquidity).
      const TF_TO_BYBIT: Partial<Record<TimeframeSeconds, string>> = {
        60: '1', 180: '3', 300: '5', 900: '15', 1800: '30',
        3600: '60', 14400: '240', 86400: 'D', 604800: 'W',
      };
      const bybitInterval = TF_TO_BYBIT[tf] ?? '1';
      const limit = 500;

      const response = await fetch(
        `/api/bybit/v5/market/kline?category=linear&symbol=${sym.toUpperCase()}&interval=${bybitInterval}&limit=${limit}`,
        { signal: AbortSignal.timeout(15_000) }
      );

      const json = await response.json();
      const list = json?.result?.list;
      if (!Array.isArray(list) || list.length === 0) return [];

      // Bybit returns klines NEWEST-FIRST — reverse for chronological order.
      // Format per item: [startTime(ms), open, high, low, close, volume, turnover]
      const rows: LiveCandle[] = [];
      for (let i = list.length - 1; i >= 0; i--) {
        const k = list[i] as string[];
        const totalVolume = parseFloat(k[5]);
        rows.push({
          time: Math.floor(Number(k[0]) / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: totalVolume,
          // Bybit klines don't expose taker-buy vs taker-sell — split 50/50 as fallback.
          // Real buy/sell breakdown comes from the live WS publicTrade stream.
          buyVolume: totalVolume * 0.5,
          sellVolume: totalVolume * 0.5,
          trades: 0,
        });
      }
      return rows;
    } catch {
      return [];
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
      useMarketStore.getState().setCurrentPrice(lastCandle.close);
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
      // Step 1 — kill all live feeds IMMEDIATELY so no stale ticks reach the aggregator
      // during the async history load below (Binance ticks were leaking onto CME charts).
      getBinanceLiveWS().disconnect();
      getCMELiveAdapter().disconnect();

      // Step 2 — clean slate: DOM, canvas, aggregator, refs
      refs.unsubscribers.current.forEach(unsub => unsub());
      refs.unsubscribers.current = [];
      resetAggregator();
      refs.lastHistoryTime.current = 0;
      refs.currentPrice.current = 0;
      refs.candles.current = [];
      refs.candleData.current.clear();
      refs.sessionHigh.current = -Infinity;
      refs.sessionLow.current = Infinity;
      // Clear chart canvas so old symbol's candles don't bleed through
      refs.chartEngine.current?.setCandles([]);
      // Clear price/OHLC display immediately so stale values don't linger
      if (refs.price.current) refs.price.current.textContent = '---';
      if (refs.ohlcOpen?.current) refs.ohlcOpen.current.textContent = '---';
      if (refs.ohlcHigh?.current) refs.ohlcHigh.current.textContent = '---';
      if (refs.ohlcLow?.current) refs.ohlcLow.current.textContent = '---';
      if (refs.ohlcClose?.current) refs.ohlcClose.current.textContent = '---';
      if (refs.footerVolume?.current) refs.footerVolume.current.textContent = '---';
      setNoData(false);
      setLoadingPhase('fetching');

      // Step 3 — load history (adapters are disconnected, aggregator is clean)
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      setLoadingPhase('rendering');
      // Yield one frame so React can flush the 'rendering' phase before we update canvas
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      if (!isMounted) return;

      if (history.length > 0) {
        updateChartData(history);
      } else if (!isCMESymbol(symbol)) {
        // Crypto: WebSocket should deliver candles within 3s; if not, show no-data state
        const noDataTimer = setTimeout(() => {
          if (isMounted && refs.candles.current.length === 0) {
            setNoData(true);
          }
        }, 3_000);
        refs.unsubscribers.current.push(() => clearTimeout(noDataTimer));
      } else {
        // CME: polling fires immediately below; if still empty after 12s (enough for
        // one poll attempt + Stooq fallback), show a message instead of a black canvas.
        const cmeNoDataTimer = setTimeout(() => {
          if (isMounted && refs.candles.current.length === 0) {
            setNoData(true);
          }
        }, 12_000);
        refs.unsubscribers.current.push(() => clearTimeout(cmeNoDataTimer));
      }

      // Step 4 — connect the right live adapter
      const isCME = isCMESymbol(symbol);
      const ws = isCME ? getCMELiveAdapter() : getBinanceLiveWS();
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

      // ── 60fps RAF batcher ─────────────────────────────────────────────────
      // BTC can deliver 30-50 ticks/sec. Without batching, every tick would
      // cause 7+ DOM textContent writes + a chart redraw → main-thread thrash.
      // Solution: collect the latest values in `pending`, flush ONCE per frame.
      type Pending = {
        price: number;
        selected: LiveCandle | null;
        liveHigh: number;
        liveLow: number;
      };
      let pending: Pending | null = null;
      let rafId: number | null = null;
      let lastPrice = NaN;
      let lastOhlcOpen = NaN, lastOhlcHigh = NaN, lastOhlcLow = NaN, lastOhlcClose = NaN, lastVol = NaN;

      const flush = () => {
        rafId = null;
        const p = pending;
        pending = null;
        if (!p || !isMounted) return;

        // Price (skip if unchanged — avoids needless DOM mutation)
        if (p.price !== lastPrice) {
          lastPrice = p.price;
          refs.currentPrice.current = p.price;
          // Publish to global market store so trading panel can read it
          useMarketStore.getState().setCurrentPrice(p.price);
          if (refs.price.current) refs.price.current.textContent = `$${priceFormatter.format(p.price)}`;
        }

        if (!p.selected) return;
        const sel = p.selected;

        // Clear "no data" state on first live candle
        if (refs.candles.current.length === 0) setNoData(false);

        // OHLC — diff each before writing to skip redundant DOM work
        if (sel.open !== lastOhlcOpen && refs.ohlcOpen?.current) {
          lastOhlcOpen = sel.open;
          refs.ohlcOpen.current.textContent = priceFormatter.format(sel.open);
        }
        if (p.liveHigh !== lastOhlcHigh && refs.ohlcHigh?.current) {
          lastOhlcHigh = p.liveHigh;
          refs.ohlcHigh.current.textContent = priceFormatter.format(p.liveHigh);
        }
        if (p.liveLow !== lastOhlcLow && refs.ohlcLow?.current) {
          lastOhlcLow = p.liveLow;
          refs.ohlcLow.current.textContent = priceFormatter.format(p.liveLow);
        }
        if (p.price !== lastOhlcClose && refs.ohlcClose?.current) {
          lastOhlcClose = p.price;
          refs.ohlcClose.current.textContent = priceFormatter.format(p.price);
        }
        if (sel.volume !== lastVol && refs.footerVolume?.current) {
          lastVol = sel.volume;
          refs.footerVolume.current.textContent = formatVolumeCompact(sel.volume);
        }

        // Throttled side-effects (alerts/positions/viewport)
        const now = Date.now();
        if (now - refs.lastAlertCheck.current > 250) {
          refs.lastAlertCheck.current = now;
          checkAlerts(symbol, p.price);
          updatePositionPrices(symbol.toUpperCase(), p.price);
          if (refs.chartEngine.current) {
            const vp = refs.chartEngine.current.getViewport();
            setViewportState({ priceMin: vp.priceMin, priceMax: vp.priceMax, chartHeight: vp.chartHeight });
          }
        }

        if (p.liveHigh > refs.sessionHigh.current) refs.sessionHigh.current = p.liveHigh;
        if (p.liveLow  < refs.sessionLow.current)  refs.sessionLow.current  = p.liveLow;
        updatePricePositionIndicator();

        // Chart canvas update (engine throttles to 60fps internally)
        if (sel.time >= refs.lastHistoryTime.current && refs.chartEngine.current) {
          const chartCandle: ChartCandle = {
            time: sel.time, open: sel.open, high: p.liveHigh, low: p.liveLow, close: p.price,
            volume: sel.volume, buyVolume: sel.buyVolume, sellVolume: sel.sellVolume,
          };
          refs.chartEngine.current.updateCandle(chartCandle);
          refs.candleData.current.set(sel.time, { open: sel.open, high: p.liveHigh, low: p.liveLow, close: p.price });
          const existingIndex = refs.candles.current.findIndex(c => c.time === sel.time);
          if (existingIndex >= 0) {
            refs.candles.current[existingIndex] = chartCandle;
          } else {
            refs.candles.current.push(chartCandle);
          }
        }
      };

      // Lightweight tick handler: stash latest values, let RAF flush them at 60fps.
      // Gates on tf=15 (the primary, fires every tick) and reads the selected TF
      // candle from the aggregator directly — see flush() for the heavy work.
      const unsubCandle = aggregator.on('candle:update', (candle, tf) => {
        if (!isMounted) return;
        if (!validateInstrumentPrice(symbol, candle.close)) return;

        if (tf !== (15 as TimeframeSeconds)) {
          // Non-primary TFs only refresh the price snapshot, no scheduling needed
          // (RAF will pick it up on the next primary tick anyway).
          if (!pending) pending = { price: candle.close, selected: null, liveHigh: candle.close, liveLow: candle.close };
          else pending.price = candle.close;
          if (rafId === null) rafId = requestAnimationFrame(flush);
          return;
        }

        const sel = aggregator.getCurrentCandle(timeframe);
        if (!sel) return;

        const liveHigh = Math.max(sel.high, candle.close);
        const liveLow  = Math.min(sel.low,  candle.close);
        pending = { price: candle.close, selected: sel, liveHigh, liveLow };
        if (rafId === null) rafId = requestAnimationFrame(flush);
      });
      refs.unsubscribers.current.push(unsubCandle);
      refs.unsubscribers.current.push(() => {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        pending = null;
      });

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

      // Clear the overlay now — chart has data. WS connects in the background;
      // connection status is shown via the status dot in the header.
      if (isMounted) setLoadingPhase(null);

      // Connect the live adapter without blocking the chart
      void ws.connect(symbol);

      if (isCME) {
        // ── Yahoo Finance adaptive polling — primary CME data source ─────────
        // Adaptive interval: faster polling for short timeframes so the last
        // candle stays fresh (Yahoo refreshes ~every 15s on 1m data).
        // Tab-aware: pauses when hidden, resumes immediately on focus.
        // Aggressive polling for short TFs to maximize the number of Yahoo
        // refreshes per minute. Yahoo blocks requests under ~5s so we stay
        // just above that threshold for 1m and below.
        const POLL_INTERVALS: Partial<Record<TimeframeSeconds, number>> = {
          15: 5_000, 30: 5_000, 60: 5_000, 180: 15_000,
          300: 30_000, 900: 60_000, 1800: 60_000,
          3600: 120_000, 14400: 120_000, 86400: 120_000,
        };
        const POLL_INTERVAL = POLL_INTERVALS[timeframe] ?? 30_000;

        type CandleRow = { time: number; open: number; high: number; low: number; close: number; volume: number };
        // Align to TF boundary so two polls of the same minute don't create
        // duplicate candles when Yahoo returns slightly different timestamps.
        const alignTime = (t: number) => Math.floor(t / timeframe) * timeframe;
        const toLC = (c: CandleRow): LiveCandle => ({
          time: alignTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
          volume: c.volume || 0, buyVolume: (c.volume || 0) * 0.5, sellVolume: (c.volume || 0) * 0.5, trades: 0,
        });

        let pollTimer: ReturnType<typeof setTimeout> | null = null;
        let pollErrors = 0;
        // RAF id for the close-interpolation animation (smooths Yahoo's
        // discrete updates into a fluid visual transition).
        let interpRafId: number | null = null;

        const pollCME = async () => {
          if (!isMounted) return;
          // Pause when tab is hidden — onVisibility will restart us on focus
          if (document.visibilityState === 'hidden') return;
          try {
            const res = await fetch(
              `/api/futures-history?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&days=2`,
              { signal: AbortSignal.timeout(10_000) }
            );
            if (!res.ok || !isMounted) throw new Error('fetch_error');
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) throw new Error('empty');

            const polled = (data as CandleRow[]).map(toLC).filter(c => validateCandle(c, symbol));
            if (polled.length === 0) throw new Error('no_valid_candles');

            const last = polled[polled.length - 1];
            if (!validateInstrumentPrice(symbol, last.close)) throw new Error('invalid_price');

            // Successful poll — reset error counter and record timestamp
            pollErrors = 0;
            if (isMounted) { setCmeDataMode('ok'); setLastPollAt(Date.now()); }

            setNoData(false);

            if (refs.candles.current.length === 0) {
              updateChartData(polled);
            } else {
              // ── Gap detection: Yahoo sometimes skips minutes during quiet periods.
              // Check if we received a candle that's MORE than 1 TF interval after
              // our last known candle. If so, log it (visibility) and merge what
              // Yahoo returned for the missing slots — Yahoo often has the data,
              // just not in the most recent batch.
              const lastTime = refs.lastHistoryTime.current;
              const expectedNext = lastTime + timeframe;
              const firstNew = polled.find(c => c.time > lastTime);
              if (firstNew && firstNew.time > expectedNext + timeframe / 2) {
                const missingCount = Math.floor((firstNew.time - lastTime) / timeframe) - 1;
                if (missingCount > 0 && missingCount < 100) {
                  // Backfill: take any polled candle whose time falls in the gap
                  const backfillCandles = polled.filter(c => c.time > lastTime && c.time < firstNew.time);
                  if (backfillCandles.length > 0) {
                    console.debug(`[CME poll] Backfilling ${backfillCandles.length} missing ${timeframe}s candles before ${firstNew.time}`);
                    backfillCandles.forEach(c => {
                      const cc: ChartCandle = {
                        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                        volume: c.volume, buyVolume: c.buyVolume, sellVolume: c.sellVolume,
                      };
                      refs.chartEngine.current?.updateCandle(cc);
                      refs.candleData.current.set(c.time, { open: c.open, high: c.high, low: c.low, close: c.close });
                      refs.candles.current.push(cc);
                    });
                  }
                }
              }

              const newBars = polled.filter(c => c.time > refs.lastHistoryTime.current);
              if (newBars.length > 0 && refs.chartEngine.current) {
                newBars.forEach(c => {
                  const cc: ChartCandle = {
                    time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
                    volume: c.volume, buyVolume: c.buyVolume, sellVolume: c.sellVolume,
                  };
                  refs.chartEngine.current!.updateCandle(cc);
                  refs.candleData.current.set(c.time, { open: c.open, high: c.high, low: c.low, close: c.close });
                  const idx = refs.candles.current.findIndex(x => x.time === c.time);
                  if (idx >= 0) refs.candles.current[idx] = cc;
                  else refs.candles.current.push(cc);
                });
                refs.lastHistoryTime.current = newBars[newBars.length - 1].time;
              }

              const existingCandles = refs.candles.current;
              if (existingCandles.length > 0 && refs.chartEngine.current) {
                const tail = existingCandles[existingCandles.length - 1];
                if (tail.time === last.time) {
                  // ── Smooth interpolation toward the new Yahoo close ──
                  // Instead of jumping the close from old → new in one frame,
                  // animate it over 800ms with ease-out so the chart feels
                  // alive between Yahoo's discrete updates (every ~15-30s).
                  const startClose = tail.close;
                  const targetClose = last.close;
                  const targetVolume = last.volume;
                  const targetHigh = Math.max(tail.high, last.high);
                  const targetLow  = Math.min(tail.low, last.low);
                  const startMs = performance.now();
                  const durationMs = 800;

                  // Cancel any prior interpolation so we don't fight ourselves
                  if (interpRafId !== null) cancelAnimationFrame(interpRafId);

                  const animate = () => {
                    if (!isMounted) { interpRafId = null; return; }
                    const elapsed = performance.now() - startMs;
                    const t = Math.min(1, elapsed / durationMs);
                    // Ease-out cubic for natural deceleration
                    const eased = 1 - Math.pow(1 - t, 3);
                    const interpClose = startClose + (targetClose - startClose) * eased;

                    const tailNow = refs.candles.current[refs.candles.current.length - 1];
                    if (tailNow && tailNow.time === last.time && refs.chartEngine.current) {
                      const updated: ChartCandle = {
                        ...tailNow,
                        close: interpClose,
                        high: Math.max(tailNow.high, interpClose, targetHigh),
                        low:  Math.min(tailNow.low,  interpClose, targetLow),
                        volume: targetVolume,
                      };
                      refs.chartEngine.current.updateCandle(updated);
                      refs.candles.current[refs.candles.current.length - 1] = updated;

                      // Sync price + OHLC display in real time
                      refs.currentPrice.current = interpClose;
                      useMarketStore.getState().setCurrentPrice(interpClose);
                      if (refs.price.current) refs.price.current.textContent = `$${priceFormatter.format(interpClose)}`;
                      if (refs.ohlcClose?.current) refs.ohlcClose.current.textContent = priceFormatter.format(interpClose);
                      if (refs.ohlcHigh?.current)  refs.ohlcHigh.current.textContent  = priceFormatter.format(updated.high);
                      if (refs.ohlcLow?.current)   refs.ohlcLow.current.textContent   = priceFormatter.format(updated.low);
                    }

                    interpRafId = t < 1 ? requestAnimationFrame(animate) : null;
                  };
                  interpRafId = requestAnimationFrame(animate);
                }
              }
            }

            refs.currentPrice.current = last.close;
            useMarketStore.getState().setCurrentPrice(last.close);
            if (refs.price.current) refs.price.current.textContent = `$${priceFormatter.format(last.close)}`;
            if (refs.ohlcOpen?.current) refs.ohlcOpen.current.textContent = priceFormatter.format(last.open);
            if (refs.ohlcHigh?.current) refs.ohlcHigh.current.textContent = priceFormatter.format(last.high);
            if (refs.ohlcLow?.current) refs.ohlcLow.current.textContent = priceFormatter.format(last.low);
            if (refs.ohlcClose?.current) refs.ohlcClose.current.textContent = priceFormatter.format(last.close);
            if (refs.footerVolume?.current) refs.footerVolume.current.textContent = formatVolumeCompact(last.volume);
            if (last.close > refs.sessionHigh.current) refs.sessionHigh.current = last.close;
            if (last.close < refs.sessionLow.current) refs.sessionLow.current = last.close;
            updatePricePositionIndicator();
            checkAlerts(symbol, last.close);
            updatePositionPrices(symbol.toUpperCase(), last.close);
          } catch {
            pollErrors++;
            if (isMounted) setCmeDataMode(pollErrors >= 3 ? 'error' : 'stale');
          } finally {
            // Reschedule only if mounted and tab is visible (visibilitychange restarts otherwise)
            if (isMounted && document.visibilityState === 'visible') {
              pollTimer = setTimeout(pollCME, POLL_INTERVAL);
            }
          }
        };

        // Resume immediately when tab regains focus
        const onVisibility = () => {
          if (!isMounted) return;
          if (document.visibilityState === 'visible') {
            if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
            void pollCME();
          }
        };
        document.addEventListener('visibilitychange', onVisibility);
        refs.unsubscribers.current.push(() => {
          if (pollTimer) clearTimeout(pollTimer);
          if (interpRafId !== null) { cancelAnimationFrame(interpRafId); interpRafId = null; }
          document.removeEventListener('visibilitychange', onVisibility);
        });

        // Fire immediately
        void pollCME();

        // ── dxFeed as optional high-frequency supplement (fire-and-forget) ───
        // If dxFeed connects (paid plan), it provides per-tick quotes / closed bars.
        // We do NOT await it — connection can take 10s to time out and would freeze
        // the chart init. All failures are silently swallowed.
        void (async () => {
          const TF_TO_DX: Partial<Record<TimeframeSeconds, string>> = {
            15: '15s', 30: '30s', 60: '1m', 180: '1m', 300: '5m',
            900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d',
          };
          const dxTF = TF_TO_DX[timeframe] ?? '1m';
          const dxSym = getDxFeedSymbol(symbol);

          try {
            const unsubDxCandle = await dxFeedWS.subscribeCandles(dxSym, dxTF, (candle) => {
              if (!isMounted) return;
              if (!validateCandle(candle, symbol) || !validateInstrumentPrice(symbol, candle.close)) return;
              // Align dxFeed timestamps to TF boundary (defensive — dxFeed bars
              // should already be aligned but better safe than duplicate candles).
              const alignedTime = Math.floor(candle.time / timeframe) * timeframe;
              const cc: ChartCandle = {
                time: alignedTime, open: candle.open, high: candle.high,
                low: candle.low, close: candle.close, volume: candle.volume,
                buyVolume: candle.volume * 0.5, sellVolume: candle.volume * 0.5,
              };
              refs.currentPrice.current = candle.close;
              useMarketStore.getState().setCurrentPrice(candle.close);
              if (refs.price.current) refs.price.current.textContent = `$${priceFormatter.format(candle.close)}`;
              if (refs.ohlcOpen?.current) refs.ohlcOpen.current.textContent = priceFormatter.format(candle.open);
              if (refs.ohlcHigh?.current) refs.ohlcHigh.current.textContent = priceFormatter.format(candle.high);
              if (refs.ohlcLow?.current) refs.ohlcLow.current.textContent = priceFormatter.format(candle.low);
              if (refs.ohlcClose?.current) refs.ohlcClose.current.textContent = priceFormatter.format(candle.close);
              if (candle.high > refs.sessionHigh.current) refs.sessionHigh.current = candle.high;
              if (candle.low < refs.sessionLow.current) refs.sessionLow.current = candle.low;
              updatePricePositionIndicator();
              if (refs.chartEngine.current && alignedTime >= refs.lastHistoryTime.current) {
                refs.chartEngine.current.updateCandle(cc);
                refs.candleData.current.set(alignedTime, {
                  open: candle.open, high: candle.high, low: candle.low, close: candle.close,
                });
                const idx = refs.candles.current.findIndex(c => c.time === alignedTime);
                if (idx >= 0) refs.candles.current[idx] = cc;
                else refs.candles.current.push(cc);
              }
            });
            if (isMounted) refs.unsubscribers.current.push(unsubDxCandle);
          } catch { /* dxFeed unavailable — polling handles everything */ }

          try {
            const unsubDxQuote = await dxFeedWS.subscribeQuotes(symbol, ({ bid, ask }) => {
              if (!isMounted) return;
              const mid = (bid + ask) / 2;
              if (!mid || !validateInstrumentPrice(symbol, mid)) return;
              refs.currentPrice.current = mid;
              useMarketStore.getState().setCurrentPrice(mid);
              if (refs.price.current) refs.price.current.textContent = `$${priceFormatter.format(mid)}`;
              if (refs.ohlcClose?.current) refs.ohlcClose.current.textContent = priceFormatter.format(mid);
              const candles = refs.candles.current;
              if (candles.length > 0 && refs.chartEngine.current) {
                const last = candles[candles.length - 1];
                const updated: ChartCandle = { ...last, close: mid, high: Math.max(last.high, mid), low: Math.min(last.low, mid) };
                refs.chartEngine.current.updateCandle(updated);
                candles[candles.length - 1] = updated;
              }
              if (mid > refs.sessionHigh.current) refs.sessionHigh.current = mid;
              if (mid < refs.sessionLow.current) refs.sessionLow.current = mid;
              updatePricePositionIndicator();
              const now = Date.now();
              if (now - refs.lastAlertCheck.current > 500) {
                refs.lastAlertCheck.current = now;
                checkAlerts(symbol, mid);
                updatePositionPrices(symbol.toUpperCase(), mid);
              }
            });
            if (isMounted) refs.unsubscribers.current.push(unsubDxQuote);
          } catch { /* dxFeed unavailable */ }
        })();
      }
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
    // Clear chart immediately — reset everything for clean slate
    refs.candles.current = [];
    refs.candleData.current.clear();
    if (refs.chartEngine.current) {
      refs.chartEngine.current.setCandles([]);
      refs.chartEngine.current.resetPriceScale();
    }
    setNoData(false);
    setLoadingPhase('fetching');
    setSymbol(newSymbol);
    onSymbolChange?.(newSymbol);
  }, [symbol, refs, onSymbolChange]);

  /**
   * Change timeframe
   */
  const handleTimeframeChange = useCallback((newTf: TimeframeSeconds) => {
    if (newTf === timeframe) return;
    // setTimeframe triggers useEffect([symbol, timeframe]) which handles
    // history reload + adapter reconnect — no manual loadHistory needed here
    setTimeframe(newTf);
  }, [timeframe]);

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

  // Keep staleAgo text fresh (updates every 30s while data is stale/error)
  useEffect(() => {
    if (cmeDataMode !== 'stale' && cmeDataMode !== 'error') { setStaleAgo(''); return; }
    const compute = () => {
      if (!lastPollAt) { setStaleAgo(''); return; }
      const min = Math.floor((Date.now() - lastPollAt) / 60_000);
      setStaleAgo(min < 1 ? '< 1min' : `${min}min`);
    };
    compute();
    const t = setInterval(compute, 30_000);
    return () => clearInterval(t);
  }, [cmeDataMode, lastPollAt]);

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
    cmeDataMode,
    lastPollAt,
    staleAgo,
  };
}
