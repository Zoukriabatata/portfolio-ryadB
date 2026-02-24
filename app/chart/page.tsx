'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { CanvasChartEngine, type ChartCandle, type ChartTheme } from '@/lib/rendering/CanvasChartEngine';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { tradovateWS, timeframeToMinutes, getSubMinuteSeconds } from '@/lib/websocket/TradovateWS';
import { useUIThemeStore, UI_THEMES } from '@/stores/useUIThemeStore';
import { SYMBOLS, type Symbol, type Timeframe } from '@/types/market';
import { SubMinuteAggregator } from '@/lib/candle/SubMinuteAggregator';

// Granular selectors to avoid re-renders on every price tick
const useSymbol = () => useMarketStore((s) => s.symbol);
const useTimeframe = () => useMarketStore((s) => s.timeframe);
const useCurrentPrice = () => useMarketStore((s) => s.currentPrice);
const useCandles = () => useMarketStore((s) => s.candles);
const useActions = () => useMarketStore((s) => ({
  setSymbol: s.setSymbol,
  setTimeframe: s.setTimeframe,
  setCurrentPrice: s.setCurrentPrice,
  setCandles: s.setCandles,
  updateCurrentCandle: s.updateCurrentCandle,
}));

const CRYPTO_SYMBOLS: Symbol[] = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ARBUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT',
];

const CME_SYMBOLS: Symbol[] = ['NQ', 'MNQ', 'ES', 'MES', 'GC', 'MGC'];

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '15s', label: '15s' },
  { value: '30s', label: '30s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

// Derive chart theme from the global UI theme
function useChartTheme(): Partial<ChartTheme> {
  const activeThemeId = useUIThemeStore((s) => s.activeTheme);
  return useMemo(() => {
    const uiTheme = UI_THEMES.find(t => t.id === activeThemeId) || UI_THEMES[0];
    const c = uiTheme.colors;
    return {
      background: c.chartBg,
      gridLines: c.chartGrid,
      text: c.textSecondary,
      textMuted: c.textMuted,
      candleUp: c.candleUp,
      candleDown: c.candleDown,
      wickUp: c.wickUp,
      wickDown: c.wickDown,
      volumeUp: `${c.candleUp}66`,
      volumeDown: `${c.candleDown}66`,
      crosshair: c.primary,
      crosshairLabel: '#ffffff',
      crosshairLabelBg: c.surfaceElevated,
      priceLineColor: c.primary,
    };
  }, [activeThemeId]);
}

export default function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasChartEngine | null>(null);

  const [loading, setLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [crosshairInfo, setCrosshairInfo] = useState<{ time: number; price: number } | null>(null);
  const chartTheme = useChartTheme();
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const symbolDropdownRef = useRef<HTMLDivElement>(null);

  const symbol = useSymbol();
  const timeframe = useTimeframe();
  const currentPrice = useCurrentPrice();
  const candles = useCandles();
  const { setSymbol, setTimeframe, setCurrentPrice, setCandles, updateCurrentCandle } = useActions();

  // Initialize chart engine
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const engine = new CanvasChartEngine(canvas, chartTheme);
    engineRef.current = engine;

    engine.resize(rect.width, rect.height);
    engine.setShowVolume(showVolume);
    engine.setShowGrid(showGrid);
    engine.setOnPriceChange(setCurrentPrice);
    engine.setOnCrosshairMove((time, price) => {
      setCrosshairInfo({ time, price });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && engineRef.current) {
          engineRef.current.resize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => { if (engineRef.current) engineRef.current.setTheme(chartTheme); }, [chartTheme]);
  useEffect(() => { if (engineRef.current) engineRef.current.setShowVolume(showVolume); }, [showVolume]);
  useEffect(() => { if (engineRef.current) engineRef.current.setShowGrid(showGrid); }, [showGrid]);

  const exchange = SYMBOLS[symbol]?.exchange || 'bybit';

  const subMinuteSec = getSubMinuteSeconds(timeframe);

  const fetchBybitHistory = useCallback(async () => {
    setLoading(true);
    try {
      const intervalMap: Record<string, string> = {
        '15s': '1', '30s': '1', // fetch 1m and split client-side
        '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
        '1h': '60', '2h': '120', '4h': '240', '1d': 'D',
      };
      const interval = intervalMap[timeframe] || '1';

      const response = await fetch(
        `/api/bybit/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=500`
      );
      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        let fetchedCandles: ChartCandle[] = data.result.list
          .map((k: string[]) => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }))
          .reverse();

        // Split 1m candles into sub-minute if needed
        if (subMinuteSec) {
          fetchedCandles = SubMinuteAggregator.splitHistoricalCandles(fetchedCandles, subMinuteSec);
        }

        setCandles(fetchedCandles);
        if (engineRef.current) engineRef.current.setCandles(fetchedCandles);
        if (fetchedCandles.length > 0) setCurrentPrice(fetchedCandles[fetchedCandles.length - 1].close);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, subMinuteSec, setCandles, setCurrentPrice]);

  // Main data subscription effect
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    let aggregator: SubMinuteAggregator | null = null;

    const liveHandler = (candle: ChartCandle) => {
      if (cancelled) return;
      if (engineRef.current) engineRef.current.updateCandle(candle);
      setCurrentPrice(candle.close);
      updateCurrentCandle(candle);
    };

    if (exchange === 'tradovate') {
      setLoading(true);
      const connectTradovate = async () => {
        try {
          const intervalMin = timeframeToMinutes(timeframe);
          const unsub = await tradovateWS.subscribeChart(
            symbol, intervalMin,
            (candle, _isClosed) => {
              liveHandler({ time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume });
            },
            (historicalCandles) => {
              if (cancelled) return;
              let chartCandles: ChartCandle[] = historicalCandles.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));

              // Split into sub-minute if needed
              if (subMinuteSec) {
                chartCandles = SubMinuteAggregator.splitHistoricalCandles(chartCandles, subMinuteSec);
              }

              setCandles(chartCandles);
              if (engineRef.current) engineRef.current.setCandles(chartCandles);
              if (chartCandles.length > 0) setCurrentPrice(chartCandles[chartCandles.length - 1].close);
              setLoading(false);
            }
          );
          cleanup = () => { unsub(); tradovateWS.disconnect(); };
        } catch (error) {
          console.error('[Tradovate] Connection failed:', error);
          setLoading(false);
        }
      };
      connectTradovate();
    } else {
      fetchBybitHistory();
      bybitWS.connect('linear');

      if (subMinuteSec) {
        // Sub-minute: subscribe to trades and aggregate into candles
        aggregator = new SubMinuteAggregator(subMinuteSec, (candle, _isClosed) => {
          liveHandler({ time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume });
        });

        const unsubTrades = bybitWS.subscribeTrades(
          symbol,
          (trade) => {
            if (cancelled) return;
            aggregator?.addTrade({ price: trade.price, volume: trade.quantity, time: trade.time });
          },
          'linear'
        );
        // Also subscribe to 1m klines as fallback for candle close events
        const unsubKline = bybitWS.subscribeKline(
          symbol, '1m',
          () => {}, // no-op: trades drive the aggregation
          'linear'
        );
        cleanup = () => { unsubTrades(); unsubKline(); aggregator?.reset(); };
      } else {
        // Standard: subscribe to klines directly
        const unsubscribe = bybitWS.subscribeKline(
          symbol, timeframe,
          (candle, _isClosed) => {
            liveHandler({ time: candle.time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume });
          },
          'linear'
        );
        cleanup = unsubscribe;
      }
    }

    return () => { cancelled = true; cleanup?.(); };
  }, [symbol, timeframe, exchange, subMinuteSec, fetchBybitHistory, setCurrentPrice, updateCurrentCandle, setCandles]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); engineRef.current?.zoomIn(); }
      else if (e.key === '-') { e.preventDefault(); engineRef.current?.zoomOut(); }
      else if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); engineRef.current?.fitToData(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!symbolDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(e.target as Node)) setSymbolDropdownOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSymbolDropdownOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [symbolDropdownOpen]);

  const handleSymbolChange = (newSymbol: Symbol) => { setSymbol(newSymbol); setSymbolDropdownOpen(false); };
  const handleTimeframeChange = (newTimeframe: Timeframe) => { setTimeframe(newTimeframe); };

  const formatCrosshairTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const theme = chartTheme;
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles.length > 1 ? candles[candles.length - 2] : null;

  // Price change calculation
  const priceChange = lastCandle && prevCandle
    ? lastCandle.close - prevCandle.close
    : 0;
  const priceChangePercent = prevCandle && prevCandle.close > 0
    ? (priceChange / prevCandle.close) * 100
    : 0;
  const isUp = priceChange >= 0;

  // Volume formatted
  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  const formatPrice = (price: number) => {
    const prefix = exchange === 'tradovate' ? '' : '$';
    return `${prefix}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div
      className="h-[calc(100svh-80px)] flex flex-col animate-fadeIn"
      style={{ backgroundColor: theme.background } as React.CSSProperties}
    >
      {/* ─── Top Bar ─── */}
      <div
        className="flex items-center justify-between px-2 sm:px-3 h-11 border-b shrink-0 animate-slideUp stagger-1"
        style={{ backgroundColor: theme.background, borderColor: theme.gridLines }}
      >
        {/* Left: Symbol + Price + Change */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Symbol selector */}
          <div ref={symbolDropdownRef} className="relative">
            <button
              onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg transition-colors"
              style={{
                backgroundColor: symbolDropdownOpen ? `${theme.gridLines}` : 'transparent',
              }}
            >
              <span className="text-xs font-bold tracking-wide" style={{ color: theme.text }}>
                {symbol}
              </span>
              <svg
                className={`w-2.5 h-2.5 transition-transform duration-200 ${symbolDropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
                style={{ color: theme.textMuted }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown */}
            {symbolDropdownOpen && (
              <div
                className="absolute top-full left-0 mt-1 w-52 rounded-lg overflow-hidden z-50 animate-dropdown-in"
                style={{
                  backgroundColor: theme.background,
                  border: `1px solid ${theme.gridLines}`,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                }}
              >
                <div className="py-1 max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {/* CME */}
                  <div className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: theme.textMuted }}>
                    CME Futures
                  </div>
                  {CME_SYMBOLS.map((s) => {
                    const info = SYMBOLS[s];
                    const active = s === symbol;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSymbolChange(s)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors"
                        style={{
                          backgroundColor: active ? `${theme.candleUp}12` : 'transparent',
                          color: active ? theme.candleUp : theme.text,
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = `${theme.gridLines}80`; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <span className="text-xs font-medium">{info?.name || s}</span>
                        <span className="text-[10px] font-mono" style={{ color: theme.textMuted }}>{s}</span>
                      </button>
                    );
                  })}
                  <div className="mx-3 my-1 border-t" style={{ borderColor: theme.gridLines }} />
                  {/* Crypto */}
                  <div className="px-3 pt-1 pb-1 text-[9px] font-bold uppercase tracking-widest" style={{ color: theme.textMuted }}>
                    Crypto Perpetual
                  </div>
                  {CRYPTO_SYMBOLS.map((s) => {
                    const info = SYMBOLS[s];
                    const active = s === symbol;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSymbolChange(s)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors"
                        style={{
                          backgroundColor: active ? `${theme.candleUp}12` : 'transparent',
                          color: active ? theme.candleUp : theme.text,
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = `${theme.gridLines}80`; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <span className="text-xs font-medium">{info?.name || s}</span>
                        <span className="text-[10px] font-mono" style={{ color: theme.textMuted }}>{s}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="w-px h-5 hidden sm:block" style={{ backgroundColor: theme.gridLines }} />

          {/* Price + Change */}
          <div className="flex items-baseline gap-2">
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums" style={{ color: theme.text }}>
              {formatPrice(currentPrice)}
            </span>
            {lastCandle && (
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold font-mono tabular-nums"
                  style={{ color: isUp ? theme.candleUp : theme.candleDown }}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)}
                </span>
                <span className="text-[10px] font-mono px-1 py-0.5 rounded"
                  style={{
                    backgroundColor: isUp ? `${theme.candleUp}15` : `${theme.candleDown}15`,
                    color: isUp ? theme.candleUp : theme.candleDown,
                  }}>
                  {isUp ? '+' : ''}{priceChangePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="w-px h-5 hidden sm:block" style={{ backgroundColor: theme.gridLines }} />

          {/* OHLCV inline */}
          <div className="hidden md:flex items-center gap-2.5 text-[10px] font-mono tabular-nums" style={{ color: theme.textMuted }}>
            <span>O <span style={{ color: theme.text }}>{lastCandle?.open.toFixed(2) || '-'}</span></span>
            <span>H <span style={{ color: theme.candleUp }}>{lastCandle?.high.toFixed(2) || '-'}</span></span>
            <span>L <span style={{ color: theme.candleDown }}>{lastCandle?.low.toFixed(2) || '-'}</span></span>
            <span>C <span style={{ color: theme.text }}>{lastCandle?.close.toFixed(2) || '-'}</span></span>
            <span>V <span style={{ color: theme.text }}>{lastCandle ? formatVolume(lastCandle.volume) : '-'}</span></span>
          </div>
        </div>

        {/* Right: Timeframes + Controls */}
        <div className="flex items-center gap-1.5">
          {/* Timeframes */}
          <div className="flex items-center rounded-md p-0.5" style={{ backgroundColor: `${theme.gridLines}60` }}>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => handleTimeframeChange(tf.value)}
                className="px-2 py-0.5 rounded text-[11px] font-semibold transition-colors"
                style={{
                  backgroundColor: timeframe === tf.value ? theme.candleUp : 'transparent',
                  color: timeframe === tf.value ? '#fff' : theme.textMuted,
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Separator */}
          <div className="w-px h-5 hidden sm:block" style={{ backgroundColor: theme.gridLines }} />

          {/* Controls */}
          <div className="hidden sm:flex items-center gap-0.5">
            {/* Grid */}
            <button
              onClick={() => setShowGrid(!showGrid)}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
              style={{
                backgroundColor: showGrid ? `${theme.candleUp}18` : 'transparent',
                color: showGrid ? theme.candleUp : theme.textMuted,
              }}
              title="Grid (G)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>

            {/* Volume */}
            <button
              onClick={() => setShowVolume(!showVolume)}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
              style={{
                backgroundColor: showVolume ? `${theme.candleUp}18` : 'transparent',
                color: showVolume ? theme.candleUp : theme.textMuted,
              }}
              title="Volume (V)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="4" y="14" width="4" height="7" rx="1" />
                <rect x="10" y="8" width="4" height="13" rx="1" />
                <rect x="16" y="3" width="4" height="18" rx="1" />
              </svg>
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen();
                else document.documentElement.requestFullscreen();
              }}
              className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
              style={{ color: theme.textMuted }}
              title="Fullscreen (F)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            </button>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: `${theme.candleUp}10` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.candleUp }} />
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: theme.candleUp }}>Live</span>
          </div>
        </div>
      </div>

      {/* ─── Chart Area ─── */}
      <div ref={containerRef} className="flex-1 relative animate-scaleIn stagger-2">
        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: `${theme.background}ee` }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.candleUp, borderTopColor: 'transparent' }} />
              <span className="text-[11px] font-medium" style={{ color: theme.textMuted }}>Loading {SYMBOLS[symbol]?.name || symbol}...</span>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ cursor: 'crosshair' }} />

        {/* Zoom controls */}
        <div
          className="absolute bottom-3 right-3 flex items-center gap-0.5 p-0.5 rounded-lg z-10"
          style={{ backgroundColor: `${theme.background}cc`, border: `1px solid ${theme.gridLines}` }}
        >
          <button
            onClick={() => engineRef.current?.zoomIn()}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:brightness-150"
            style={{ color: theme.textMuted }}
            title="Zoom In (+)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            onClick={() => engineRef.current?.zoomOut()}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:brightness-150"
            style={{ color: theme.textMuted }}
            title="Zoom Out (-)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <div className="w-px h-3.5 opacity-30" style={{ backgroundColor: theme.text }} />
          <button
            onClick={() => engineRef.current?.fitToData()}
            className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:brightness-150"
            style={{ color: theme.textMuted }}
            title="Fit (Ctrl+0)"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>

        {/* Crosshair info */}
        {crosshairInfo && (
          <div
            className="absolute top-2 left-2 px-2.5 py-1 rounded-md text-[11px] font-mono z-10"
            style={{
              backgroundColor: `${theme.background}dd`,
              border: `1px solid ${theme.gridLines}`,
              color: theme.text,
            }}
          >
            {formatCrosshairTime(crosshairInfo.time)}
            <span className="mx-1.5 opacity-30">|</span>
            <span className="font-semibold" style={{ color: theme.candleUp }}>
              {formatPrice(crosshairInfo.price)}
            </span>
          </div>
        )}
      </div>

      {/* ─── Status Bar ─── */}
      <div
        className="flex items-center justify-between px-2 sm:px-3 h-6 border-t text-[10px] shrink-0 animate-fadeIn stagger-3"
        style={{ backgroundColor: theme.background, borderColor: theme.gridLines, color: theme.textMuted }}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium" style={{ color: theme.text }}>
            {exchange === 'tradovate' ? 'CME' : 'Bybit'}
          </span>
          <span className="hidden sm:inline">{SYMBOLS[symbol]?.name}</span>
          <span className="hidden sm:inline">{timeframe}</span>
        </div>

        {/* OHLCV for mobile (hidden on desktop since it's in the top bar) */}
        <div className="flex md:hidden items-center gap-2 font-mono tabular-nums">
          <span>O {lastCandle?.open.toFixed(2) || '-'}</span>
          <span style={{ color: theme.candleUp }}>H {lastCandle?.high.toFixed(2) || '-'}</span>
          <span style={{ color: theme.candleDown }}>L {lastCandle?.low.toFixed(2) || '-'}</span>
          <span>C {lastCandle?.close.toFixed(2) || '-'}</span>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span>{candles.length} bars</span>
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full" style={{ backgroundColor: theme.candleUp }} />
            <span>Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
