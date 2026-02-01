'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import {
  getAggregator,
  resetAggregator,
  type LiveCandle,
  type TimeframeSeconds,
  TIMEFRAME_LABELS,
} from '@/lib/live/HierarchicalAggregator';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';
import { useThemeStore } from '@/stores/useThemeStore';
import { THEMES } from '@/lib/themes/ThemeSystem';

/**
 * LIVE CHART PRO - Version optimisée
 * - Pas de re-render excessif
 * - Historique chargé depuis Binance API
 */

interface LiveChartProProps {
  className?: string;
}

const SYMBOLS = [
  { value: 'btcusdt', label: 'BTC/USDT' },
  { value: 'ethusdt', label: 'ETH/USDT' },
  { value: 'solusdt', label: 'SOL/USDT' },
  { value: 'bnbusdt', label: 'BNB/USDT' },
];

const TF_GROUPS = {
  seconds: [15, 30] as TimeframeSeconds[],
  minutes: [60, 180, 300, 900, 1800] as TimeframeSeconds[],
  hours: [3600, 14400] as TimeframeSeconds[],
  days: [86400] as TimeframeSeconds[],
};

// Map timeframe to Binance interval
const TF_TO_BINANCE: Record<number, string> = {
  15: '1m', 30: '1m', 60: '1m', 180: '3m', 300: '5m',
  900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d',
};

export default function LiveChartPro({ className }: LiveChartProProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const tickCountRef = useRef<HTMLSpanElement>(null);
  const statusDotRef = useRef<HTMLDivElement>(null);

  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(60);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [showThemePanel, setShowThemePanel] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { themeId, setTheme, getTheme } = useThemeStore();
  const theme = useMemo(() => getTheme(), [themeId, getTheme]);

  // Refs pour éviter les re-renders
  const currentPriceRef = useRef(0);
  const lastTickCountRef = useRef(0);
  const lastHistoryTimeRef = useRef<number>(0); // Track last historical candle time
  const unsubscribersRef = useRef<(() => void)[]>([]); // Cleanup functions

  /**
   * Charge l'historique depuis Binance API
   */
  const loadHistory = useCallback(async (sym: string, tf: TimeframeSeconds) => {
    setIsLoading(true);
    try {
      const binanceInterval = TF_TO_BINANCE[tf] || '1m';
      const limit = 500;

      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym.toUpperCase()}&interval=${binanceInterval}&limit=${limit}`
      );
      const data = await response.json();

      if (!Array.isArray(data)) {
        console.error('Invalid Binance response');
        return [];
      }

      // Convertit les données Binance en format LiveCandle
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

      // Pour les TF < 60s, on doit subdiviser les bougies M1
      if (tf < 60) {
        return subdivideCandles(candles, tf);
      }

      return candles;
    } catch (error) {
      console.error('Failed to load history:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Subdivise les bougies M1 en sous-bougies (15s ou 30s)
   */
  const subdivideCandles = (m1Candles: LiveCandle[], targetTf: number): LiveCandle[] => {
    const result: LiveCandle[] = [];
    const subdivisions = 60 / targetTf;

    for (const m1 of m1Candles) {
      const priceStep = (m1.close - m1.open) / subdivisions;
      const volumeStep = m1.volume / subdivisions;

      for (let i = 0; i < subdivisions; i++) {
        const subOpen = m1.open + priceStep * i;
        const subClose = m1.open + priceStep * (i + 1);
        const variation = (Math.random() - 0.5) * Math.abs(m1.high - m1.low) * 0.1;

        result.push({
          time: m1.time + (i * targetTf),
          open: subOpen,
          high: Math.max(subOpen, subClose) + Math.abs(variation),
          low: Math.min(subOpen, subClose) - Math.abs(variation),
          close: subClose,
          volume: volumeStep,
          buyVolume: 0,
          sellVolume: 0,
          trades: Math.floor(m1.trades / subdivisions),
        });
      }
    }

    return result;
  };

  /**
   * Met à jour le chart avec les données
   */
  const updateChartData = useCallback((candles: LiveCandle[]) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData: CandlestickData<Time>[] = candles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData<Time>[] = candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? theme.colors.volumeUp : theme.colors.volumeDown,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Store the last historical timestamp
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      lastHistoryTimeRef.current = lastCandle.time;
    }

    // Met à jour le prix
    if (lastCandle && priceRef.current) {
      currentPriceRef.current = lastCandle.close;
      priceRef.current.textContent = `$${lastCandle.close.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
  }, [theme.colors.volumeUp, theme.colors.volumeDown]);

  /**
   * Crée le chart
   */
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || chartRef.current) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: theme.colors.background },
        textColor: theme.colors.text,
      },
      grid: {
        vertLines: { color: theme.colors.gridLines },
        horzLines: { color: theme.colors.gridLines },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: theme.colors.crosshair, width: 1, style: 2 },
        horzLine: { color: theme.colors.crosshair, width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: theme.colors.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: theme.colors.border,
        timeVisible: true,
        secondsVisible: timeframe < 60,
        rightOffset: 5,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.colors.candleUp,
      downColor: theme.colors.candleDown,
      borderDownColor: theme.colors.candleDown,
      borderUpColor: theme.colors.candleUp,
      wickDownColor: theme.colors.wickDown,
      wickUpColor: theme.colors.wickUp,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: theme.colors.candleUp,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  /**
   * Applique le thème
   */
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    chartRef.current.applyOptions({
      layout: {
        background: { color: theme.colors.background },
        textColor: theme.colors.text,
      },
      grid: {
        vertLines: { color: theme.colors.gridLines },
        horzLines: { color: theme.colors.gridLines },
      },
    });

    candleSeriesRef.current.applyOptions({
      upColor: theme.colors.candleUp,
      downColor: theme.colors.candleDown,
      borderDownColor: theme.colors.candleDown,
      borderUpColor: theme.colors.candleUp,
      wickDownColor: theme.colors.wickDown,
      wickUpColor: theme.colors.wickUp,
    });
  }, [theme]);

  /**
   * Charge l'historique et connecte le WebSocket
   */
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // Clean up previous subscriptions
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];

      // 1. Reset aggregator for fresh start
      resetAggregator();
      lastHistoryTimeRef.current = 0;

      // 2. Charge l'historique
      const history = await loadHistory(symbol, timeframe);
      if (!isMounted) return;

      if (history.length > 0) {
        updateChartData(history);
      }

      // 3. Connecte le WebSocket
      const ws = getBinanceLiveWS();
      const aggregator = getAggregator();

      const unsubStatus = ws.onStatus((s) => {
        if (!isMounted) return;
        setStatus(s);
        if (statusDotRef.current) {
          statusDotRef.current.style.backgroundColor =
            s === 'connected' ? theme.colors.success :
            s === 'connecting' ? theme.colors.warning :
            theme.colors.error;
        }
      });
      unsubscribersRef.current.push(unsubStatus);

      // Met à jour le prix et le chart sans re-render React
      const unsubCandle = aggregator.on('candle:update', (candle, tf) => {
        if (tf !== timeframe || !isMounted) return;

        // Met à jour le prix directement dans le DOM
        if (priceRef.current) {
          currentPriceRef.current = candle.close;
          priceRef.current.textContent = `$${candle.close.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
        }

        // Only update chart if candle time >= last history time
        // This prevents "Cannot update oldest data" error
        if (candle.time >= lastHistoryTimeRef.current) {
          if (candleSeriesRef.current && volumeSeriesRef.current) {
            candleSeriesRef.current.update({
              time: candle.time as Time,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            });

            volumeSeriesRef.current.update({
              time: candle.time as Time,
              value: candle.volume,
              color: candle.close >= candle.open ? theme.colors.volumeUp : theme.colors.volumeDown,
            });
          }
        }
      });
      unsubscribersRef.current.push(unsubCandle);

      // Met à jour le compteur de ticks (throttled)
      let tickUpdateTimer: NodeJS.Timeout | null = null;
      const unsubTick = ws.onTick(() => {
        if (!tickUpdateTimer) {
          tickUpdateTimer = setTimeout(() => {
            if (tickCountRef.current) {
              tickCountRef.current.textContent = ws.getTickCount().toLocaleString();
            }
            tickUpdateTimer = null;
          }, 500); // Update max 2x par seconde
        }
      });
      unsubscribersRef.current.push(unsubTick);

      ws.connect(symbol);
    };

    init();

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, [symbol, timeframe, loadHistory, updateChartData, theme]);

  /**
   * Change de symbole
   */
  const handleSymbolChange = async (newSymbol: string) => {
    if (newSymbol === symbol) return;
    setSymbol(newSymbol);
    getBinanceLiveWS().changeSymbol(newSymbol);
  };

  /**
   * Change de timeframe
   */
  const handleTimeframeChange = async (newTf: TimeframeSeconds) => {
    if (newTf === timeframe) return;
    setTimeframe(newTf);

    if (chartRef.current) {
      chartRef.current.timeScale().applyOptions({
        secondsVisible: newTf < 60,
      });
    }

    const history = await loadHistory(symbol, newTf);
    if (history.length > 0) {
      updateChartData(history);
    }
  };

  return (
    <div
      className={`flex flex-col h-full ${className || ''}`}
      style={{ backgroundColor: theme.colors.background }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}
      >
        {/* Symbol & Price */}
        <div className="flex items-center gap-4">
          <select
            value={symbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            className="text-sm font-bold rounded px-3 py-1.5 border focus:outline-none"
            style={{
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
              color: theme.colors.text,
            }}
          >
            {SYMBOLS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <span
            ref={priceRef}
            className="text-xl font-mono font-bold"
            style={{ color: theme.colors.text }}
          >
            $0.00
          </span>
        </div>

        {/* Timeframes */}
        <div className="flex items-center gap-1">
          {Object.entries(TF_GROUPS).map(([group, tfs]) => (
            <div
              key={group}
              className="flex items-center rounded p-0.5 mr-1"
              style={{ backgroundColor: theme.colors.background }}
            >
              {tfs.map(tf => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: timeframe === tf ? theme.colors.toolActive : 'transparent',
                    color: timeframe === tf ? '#fff' : theme.colors.textSecondary,
                  }}
                >
                  {TIMEFRAME_LABELS[tf]}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Theme & Status */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowThemePanel(!showThemePanel)}
              className="px-2 py-1 rounded text-xs border"
              style={{
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.border,
                color: theme.colors.textSecondary,
              }}
            >
              🎨 {THEMES.find(t => t.id === themeId)?.name}
            </button>

            {showThemePanel && (
              <div
                className="absolute top-full right-0 mt-1 rounded shadow-lg z-50 p-1 min-w-[120px]"
                style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
              >
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setShowThemePanel(false); }}
                    className="w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2"
                    style={{
                      backgroundColor: themeId === t.id ? theme.colors.toolActive : 'transparent',
                      color: themeId === t.id ? '#fff' : theme.colors.text,
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colors.candleUp }} />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: theme.colors.textMuted }}>
            <span ref={tickCountRef}>0</span>
            <div
              ref={statusDotRef}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: theme.colors.textMuted }}
            />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative">
        <div ref={chartContainerRef} className="w-full h-full" />

        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ backgroundColor: `${theme.colors.background}ee` }}
          >
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: theme.colors.toolActive }}
              />
              <span className="text-sm" style={{ color: theme.colors.textSecondary }}>
                Chargement...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 py-1 text-xs border-t"
        style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, color: theme.colors.textMuted }}
      >
        <span>Binance Spot • {TIMEFRAME_LABELS[timeframe]}</span>
        <span style={{ color: status === 'connected' ? theme.colors.success : theme.colors.textMuted }}>
          {status === 'connected' ? '● Live' : '○ Offline'}
        </span>
      </div>
    </div>
  );
}
