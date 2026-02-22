'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CanvasChartEngine, type ChartCandle, type ChartTheme } from '@/lib/rendering/CanvasChartEngine';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS, type Symbol, type Timeframe } from '@/types/market';

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

/**
 * CHART PAGE - 100% Custom Canvas Chart
 *
 * Chart professionnel sans librairie externe
 * Moteur de rendu canvas custom
 */

const CRYPTO_SYMBOLS: Symbol[] = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ARBUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT',
];

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

const THEMES: { id: string; name: string; theme: Partial<ChartTheme> }[] = [
  {
    id: 'senzoukria',
    name: 'Senzoukria',
    theme: {
      background: '#060a08',
      gridLines: '#0f1e12',
      text: '#8aab8a',
      textMuted: '#5a7a5a',
      candleUp: '#7ed321',
      candleDown: '#e04040',
      wickUp: '#5fa31a',
      wickDown: '#b91c1c',
      volumeUp: 'rgba(126, 211, 33, 0.4)',
      volumeDown: 'rgba(224, 64, 64, 0.4)',
      crosshair: '#7ed321',
      crosshairLabel: '#ffffff',
      crosshairLabelBg: '#1a3a10',
      priceLineColor: '#7ed321',
    },
  },
  {
    id: 'dark',
    name: 'Dark',
    theme: {
      background: '#0a0a0a',
      gridLines: '#1a1a1a',
      text: '#888888',
      textMuted: '#555555',
      candleUp: '#26a69a',
      candleDown: '#ef5350',
      wickUp: '#26a69a',
      wickDown: '#ef5350',
      volumeUp: 'rgba(38, 166, 154, 0.4)',
      volumeDown: 'rgba(239, 83, 80, 0.4)',
      crosshair: '#6b7280',
      crosshairLabel: '#ffffff',
      crosshairLabelBg: '#374151',
      priceLineColor: '#3b82f6',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    theme: {
      background: '#0a0a1a',
      gridLines: '#1a1a2f',
      text: '#8888aa',
      textMuted: '#5555aa',
      candleUp: '#3b82f6',
      candleDown: '#f97316',
      wickUp: '#3b82f6',
      wickDown: '#f97316',
      volumeUp: 'rgba(59, 130, 246, 0.4)',
      volumeDown: 'rgba(249, 115, 22, 0.4)',
      crosshair: '#60a5fa',
      crosshairLabel: '#ffffff',
      crosshairLabelBg: '#1e40af',
      priceLineColor: '#60a5fa',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    theme: {
      background: '#0a0010',
      gridLines: '#1a0025',
      text: '#ec4899',
      textMuted: '#a855f7',
      candleUp: '#ec4899',
      candleDown: '#8b5cf6',
      wickUp: '#ec4899',
      wickDown: '#8b5cf6',
      volumeUp: 'rgba(236, 72, 153, 0.4)',
      volumeDown: 'rgba(139, 92, 246, 0.4)',
      crosshair: '#f472b6',
      crosshairLabel: '#ffffff',
      crosshairLabelBg: '#831843',
      priceLineColor: '#f472b6',
    },
  },
];

export default function ChartPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasChartEngine | null>(null);

  const [loading, setLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [crosshairInfo, setCrosshairInfo] = useState<{ time: number; price: number } | null>(null);
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

    const engine = new CanvasChartEngine(canvas, selectedTheme.theme);
    engineRef.current = engine;

    engine.resize(rect.width, rect.height);
    engine.setShowVolume(showVolume);
    engine.setShowGrid(showGrid);
    engine.setOnPriceChange(setCurrentPrice);
    engine.setOnCrosshairMove((time, price) => {
      setCrosshairInfo({ time, price });
    });

    // Resize observer
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

  // Update theme
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTheme(selectedTheme.theme);
    }
  }, [selectedTheme]);

  // Update volume visibility
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setShowVolume(showVolume);
    }
  }, [showVolume]);

  // Update grid visibility
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setShowGrid(showGrid);
    }
  }, [showGrid]);

  // Fetch historical data
  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    try {
      const intervalMap: Record<string, string> = {
        '1m': '1',
        '3m': '3',
        '5m': '5',
        '15m': '15',
        '30m': '30',
        '1h': '60',
        '2h': '120',
        '4h': '240',
        '1d': 'D',
      };
      const interval = intervalMap[timeframe] || '1';

      const response = await fetch(
        `/api/bybit/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=500`
      );
      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        const fetchedCandles: ChartCandle[] = data.result.list
          .map((k: string[]) => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }))
          .reverse();

        setCandles(fetchedCandles);

        if (engineRef.current) {
          engineRef.current.setCandles(fetchedCandles);
        }

        if (fetchedCandles.length > 0) {
          setCurrentPrice(fetchedCandles[fetchedCandles.length - 1].close);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, setCandles, setCurrentPrice]);

  // Fetch data and subscribe to WebSocket
  useEffect(() => {
    fetchHistoricalData();

    bybitWS.connect('linear');

    const unsubscribe = bybitWS.subscribeKline(
      symbol,
      timeframe,
      (candle, isClosed) => {
        const chartCandle: ChartCandle = {
          time: candle.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        };

        if (engineRef.current) {
          engineRef.current.updateCandle(chartCandle);
        }

        setCurrentPrice(candle.close);
        updateCurrentCandle(candle);
      },
      'linear'
    );

    return () => unsubscribe();
  }, [symbol, timeframe, fetchHistoricalData, setCurrentPrice, updateCurrentCandle]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        engineRef.current?.zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        engineRef.current?.zoomOut();
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        engineRef.current?.fitToData();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close symbol dropdown on click outside or Escape
  useEffect(() => {
    if (!symbolDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (symbolDropdownRef.current && !symbolDropdownRef.current.contains(e.target as Node)) {
        setSymbolDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSymbolDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [symbolDropdownOpen]);

  const handleSymbolChange = (newSymbol: Symbol) => {
    setSymbol(newSymbol);
    setSymbolDropdownOpen(false);
  };

  const handleTimeframeChange = (newTimeframe: Timeframe) => {
    setTimeframe(newTimeframe);
  };

  const formatCrosshairTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const theme = selectedTheme.theme;
  const lastCandle = candles[candles.length - 1];

  return (
    <div
      className="h-[calc(100svh-80px)] flex flex-col animate-page-enter"
      style={{
        '--chart-bg': theme.background,
        '--chart-grid': theme.gridLines,
        '--chart-text': theme.text,
        '--chart-muted': theme.textMuted,
        '--chart-up': theme.candleUp,
        '--chart-down': theme.candleDown,
        '--chart-accent': theme.candleUp,
        backgroundColor: 'var(--chart-bg)',
      } as React.CSSProperties}
    >
      {/* ─── Header ─── */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b backdrop-blur-md animate-fadeIn"
        style={{
          backgroundColor: `${theme.background}cc`,
          borderColor: theme.gridLines,
        }}
      >
        {/* Left: Symbol + Price + Timeframes */}
        <div className="flex items-center gap-3">
          {/* Symbol selector dropdown */}
          <div ref={symbolDropdownRef} className="relative">
            {/* Trigger */}
            <button
              onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
              style={{
                backgroundColor: `${theme.gridLines}80`,
                borderColor: symbolDropdownOpen ? theme.candleUp : theme.gridLines,
                boxShadow: symbolDropdownOpen ? `0 0 0 2px ${theme.candleUp}20` : 'none',
              }}
            >
              <span className="text-sm font-semibold" style={{ color: theme.text }}>
                {SYMBOLS[symbol].name}
              </span>
              <div className="w-px h-4" style={{ backgroundColor: theme.gridLines }} />
              <span className="text-base font-bold font-mono tabular-nums" style={{ color: theme.candleUp }}>
                ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${symbolDropdownOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                style={{ color: theme.textMuted }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown panel */}
            {symbolDropdownOpen && (
              <div
                className="absolute top-full left-0 mt-2 w-56 rounded-xl overflow-hidden z-50 animate-dropdown-in"
                style={{
                  backgroundColor: theme.background,
                  border: `1px solid ${theme.gridLines}`,
                  boxShadow: `0 12px 40px rgba(0, 0, 0, 0.5)`,
                }}
              >
                <div className="py-1 max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {CRYPTO_SYMBOLS.map((s) => {
                    const info = SYMBOLS[s];
                    const isActive = s === symbol;
                    return (
                      <button
                        key={s}
                        onClick={() => handleSymbolChange(s)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left transition-all duration-150"
                        style={{
                          backgroundColor: isActive ? `${theme.candleUp}15` : 'transparent',
                          color: isActive ? theme.candleUp : theme.text,
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) e.currentTarget.style.backgroundColor = `${theme.gridLines}80`;
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.candleUp }} />
                          )}
                          <span className={`text-sm font-medium ${isActive ? '' : 'ml-3.5'}`}>
                            {info?.name || s}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: theme.textMuted }}>{s}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* LIVE badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: `${theme.candleUp}15`, border: `1px solid ${theme.candleUp}30` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.candleUp }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.candleUp }}>Live</span>
          </div>

          {/* Divider */}
          <div className="w-px h-6" style={{ backgroundColor: theme.gridLines }} />

          {/* Timeframes */}
          <div
            className="flex items-center gap-0.5 rounded-lg p-1 border"
            style={{ backgroundColor: `${theme.gridLines}60`, borderColor: theme.gridLines }}
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => handleTimeframeChange(tf.value)}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  backgroundColor: timeframe === tf.value ? theme.candleUp : 'transparent',
                  color: timeframe === tf.value ? '#ffffff' : theme.text,
                  boxShadow: timeframe === tf.value ? `0 2px 8px ${theme.candleUp}40` : 'none',
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1.5">
          {/* Theme selector */}
          <select
            value={selectedTheme.id}
            onChange={(e) => setSelectedTheme(THEMES.find((t) => t.id === e.target.value) || THEMES[0])}
            className="text-[11px] rounded-lg px-2 py-1.5 border focus:outline-none transition-all duration-200 cursor-pointer"
            style={{
              backgroundColor: `${theme.gridLines}80`,
              borderColor: theme.gridLines,
              color: theme.text,
            }}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Divider */}
          <div className="w-px h-6" style={{ backgroundColor: theme.gridLines }} />

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showGrid ? `${theme.candleUp}20` : 'transparent',
              color: showGrid ? theme.candleUp : theme.textMuted,
            }}
            title="Toggle Grid"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="3" x2="3" y2="21" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
              <line x1="21" y1="3" x2="21" y2="21" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </button>

          {/* Volume Toggle */}
          <button
            onClick={() => setShowVolume(!showVolume)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: showVolume ? `${theme.candleUp}20` : 'transparent',
              color: showVolume ? theme.candleUp : theme.textMuted,
            }}
            title="Toggle Volume"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="14" width="4" height="6" rx="1" />
              <rect x="10" y="8" width="4" height="12" rx="1" />
              <rect x="16" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                document.documentElement.requestFullscreen();
              }
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ color: theme.textMuted }}
            title="Fullscreen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── Chart Area ─── */}
      <div ref={containerRef} className="flex-1 relative">
        {/* Loading overlay */}
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10 animate-fadeIn"
            style={{ backgroundColor: `${theme.background}ee` }}
          >
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: theme.candleUp, borderTopColor: 'transparent' }}
              />
              <span className="text-xs font-medium" style={{ color: theme.textMuted }}>Loading chart...</span>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ cursor: 'crosshair' }} />

        {/* Zoom Controls */}
        <div
          className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-xl z-10 backdrop-blur-sm"
          style={{
            backgroundColor: `${theme.background}cc`,
            border: `1px solid ${theme.gridLines}`,
          }}
        >
          <button
            onClick={() => engineRef.current?.zoomIn()}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ color: theme.text }}
            title="Zoom In (+)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            onClick={() => engineRef.current?.zoomOut()}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ color: theme.text }}
            title="Zoom Out (-)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <div className="w-px h-4 mx-0.5 opacity-40" style={{ backgroundColor: theme.text }} />
          <button
            onClick={() => engineRef.current?.fitToData()}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ color: theme.text }}
            title="Fit Content (Ctrl+0)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>

        {/* Crosshair Info */}
        {crosshairInfo && (
          <div
            className="absolute top-3 left-3 px-3 py-1.5 rounded-lg text-xs font-mono z-10 backdrop-blur-sm animate-fadeIn"
            style={{
              backgroundColor: `${theme.background}cc`,
              border: `1px solid ${theme.gridLines}`,
              color: theme.text,
            }}
          >
            <span>{formatCrosshairTime(crosshairInfo.time)}</span>
            <span className="mx-2 opacity-30">|</span>
            <span className="font-semibold" style={{ color: theme.candleUp }}>
              ${crosshairInfo.price.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* ─── Footer ─── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-t text-xs backdrop-blur-md"
        style={{
          backgroundColor: `${theme.background}cc`,
          borderColor: theme.gridLines,
          color: theme.textMuted,
        }}
      >
        <div className="flex items-center gap-3">
          {/* Exchange badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md"
            style={{ backgroundColor: `${theme.gridLines}80` }}
          >
            <span className="text-[10px] font-medium" style={{ color: theme.text }}>Bybit Perpetual</span>
          </div>
          <div className="flex items-center gap-1" style={{ color: theme.candleUp }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: theme.candleUp }} />
            <span className="text-[10px] font-medium">Connected</span>
          </div>
        </div>

        {/* OHLC */}
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span>
            <span className="opacity-50 mr-1">O</span>
            <span style={{ color: theme.text }}>{lastCandle?.open.toFixed(2) || '-'}</span>
          </span>
          <span>
            <span className="opacity-50 mr-1">H</span>
            <span style={{ color: theme.candleUp }}>{lastCandle?.high.toFixed(2) || '-'}</span>
          </span>
          <span>
            <span className="opacity-50 mr-1">L</span>
            <span style={{ color: theme.candleDown }}>{lastCandle?.low.toFixed(2) || '-'}</span>
          </span>
          <span>
            <span className="opacity-50 mr-1">C</span>
            <span style={{ color: theme.text }}>{lastCandle?.close.toFixed(2) || '-'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
