'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CanvasChartEngine, type ChartCandle, type ChartTheme } from '@/lib/rendering/CanvasChartEngine';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS, type Symbol, type Timeframe } from '@/types/market';

/**
 * CHART PAGE - 100% Custom Canvas Chart
 *
 * Chart professionnel sans librairie externe
 * Moteur de rendu canvas custom
 */

const CRYPTO_SYMBOLS: Symbol[] = ['BTCUSDT'];

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

  const {
    symbol,
    timeframe,
    setSymbol,
    setTimeframe,
    currentPrice,
    setCurrentPrice,
    candles,
    setCandles,
    updateCurrentCandle,
  } = useMarketStore();

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

  const handleSymbolChange = (newSymbol: Symbol) => {
    setSymbol(newSymbol);
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

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col" style={{ backgroundColor: selectedTheme.theme.background }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          backgroundColor: selectedTheme.theme.background,
          borderColor: selectedTheme.theme.gridLines,
        }}
      >
        <div className="flex items-center gap-4">
          {/* Symbol */}
          <div className="flex items-center gap-3">
            <select
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value as Symbol)}
              className="border text-sm rounded px-3 py-1.5 font-medium focus:outline-none"
              style={{
                backgroundColor: selectedTheme.theme.gridLines,
                borderColor: selectedTheme.theme.gridLines,
                color: selectedTheme.theme.text,
              }}
            >
              {CRYPTO_SYMBOLS.map((s) => (
                <option key={s} value={s}>
                  {SYMBOLS[s].name}
                </option>
              ))}
            </select>

            <span className="text-xl font-bold font-mono" style={{ color: selectedTheme.theme.candleUp }}>
              ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Timeframes */}
          <div
            className="flex items-center gap-0.5 rounded p-0.5"
            style={{ backgroundColor: selectedTheme.theme.gridLines }}
          >
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => handleTimeframeChange(tf.value)}
                className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: timeframe === tf.value ? selectedTheme.theme.candleUp : 'transparent',
                  color: timeframe === tf.value ? '#ffffff' : selectedTheme.theme.text,
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Selector */}
          <select
            value={selectedTheme.id}
            onChange={(e) => setSelectedTheme(THEMES.find((t) => t.id === e.target.value) || THEMES[0])}
            className="border text-xs rounded px-2 py-1.5 focus:outline-none"
            style={{
              backgroundColor: selectedTheme.theme.gridLines,
              borderColor: selectedTheme.theme.gridLines,
              color: selectedTheme.theme.text,
            }}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                🎨 {t.name}
              </option>
            ))}
          </select>

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: showGrid ? selectedTheme.theme.candleUp : selectedTheme.theme.gridLines,
              color: showGrid ? '#ffffff' : selectedTheme.theme.text,
            }}
          >
            Grid
          </button>

          {/* Volume Toggle */}
          <button
            onClick={() => setShowVolume(!showVolume)}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: showVolume ? selectedTheme.theme.candleUp : selectedTheme.theme.gridLines,
              color: showVolume ? '#ffffff' : selectedTheme.theme.text,
            }}
          >
            Vol
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
            className="px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              backgroundColor: selectedTheme.theme.gridLines,
              color: selectedTheme.theme.text,
            }}
          >
            [ ]
          </button>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ backgroundColor: `${selectedTheme.theme.background}ee` }}
          >
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: selectedTheme.theme.candleUp }}
            />
          </div>
        )}

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ cursor: 'crosshair' }} />

        {/* Zoom Controls */}
        <div
          className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-lg z-10"
          style={{
            backgroundColor: `${selectedTheme.theme.background}dd`,
            border: `1px solid ${selectedTheme.theme.gridLines}`,
          }}
        >
          <button
            onClick={() => engineRef.current?.zoomIn()}
            className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110"
            style={{ color: selectedTheme.theme.text }}
            title="Zoom In (+)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            onClick={() => engineRef.current?.zoomOut()}
            className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110"
            style={{ color: selectedTheme.theme.text }}
            title="Zoom Out (-)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <div className="w-px h-5" style={{ backgroundColor: selectedTheme.theme.gridLines }} />
          <button
            onClick={() => engineRef.current?.fitToData()}
            className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110"
            style={{ color: selectedTheme.theme.text }}
            title="Fit Content (Ctrl+0)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            className="absolute top-2 left-2 px-3 py-1.5 rounded text-xs font-mono z-10"
            style={{
              backgroundColor: `${selectedTheme.theme.background}dd`,
              border: `1px solid ${selectedTheme.theme.gridLines}`,
              color: selectedTheme.theme.text,
            }}
          >
            <span>{formatCrosshairTime(crosshairInfo.time)}</span>
            <span className="mx-2">|</span>
            <span style={{ color: selectedTheme.theme.candleUp }}>
              ${crosshairInfo.price.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-1.5 border-t text-xs"
        style={{
          backgroundColor: selectedTheme.theme.background,
          borderColor: selectedTheme.theme.gridLines,
          color: selectedTheme.theme.textMuted,
        }}
      >
        <div className="flex items-center gap-4">
          <span>Bybit Perpetual</span>
          <span style={{ color: selectedTheme.theme.candleUp }}>● Connected</span>
          <span className="text-[10px] opacity-50">Custom Canvas Chart Engine</span>
        </div>
        <div className="flex items-center gap-4 font-mono">
          <span>
            O: <span style={{ color: selectedTheme.theme.text }}>{candles[candles.length - 1]?.open.toFixed(2) || '-'}</span>
          </span>
          <span>
            H: <span style={{ color: selectedTheme.theme.candleUp }}>{candles[candles.length - 1]?.high.toFixed(2) || '-'}</span>
          </span>
          <span>
            L: <span style={{ color: selectedTheme.theme.candleDown }}>{candles[candles.length - 1]?.low.toFixed(2) || '-'}</span>
          </span>
          <span>
            C: <span style={{ color: selectedTheme.theme.text }}>{candles[candles.length - 1]?.close.toFixed(2) || '-'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
