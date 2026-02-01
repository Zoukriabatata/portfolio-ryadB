'use client';

import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS, type Symbol, type Timeframe, type Candle } from '@/types/market';

const CRYPTO_SYMBOLS: Symbol[] = ['BTCUSDT', 'ETHUSDT'];

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function ChartPage() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const isInitializedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [chartStyle, setChartStyle] = useState<'candles' | 'hollow' | 'heikin'>('candles');

  const { symbol, timeframe, setSymbol, setTimeframe, currentPrice, setCurrentPrice, candles, setCandles, updateCurrentCandle } = useMarketStore();

  // Fetch historical data
  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    try {
      const intervalMap: Record<string, string> = {
        '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
        '1h': '60', '2h': '120', '4h': '240', '1d': 'D',
      };
      const interval = intervalMap[timeframe] || '1';

      const response = await fetch(
        `/api/bybit/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=500`
      );
      const data = await response.json();

      if (data.retCode === 0 && data.result?.list) {
        const fetchedCandles: Candle[] = data.result.list
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

        if (candlestickSeriesRef.current && volumeSeriesRef.current) {
          const candleData: CandlestickData<Time>[] = fetchedCandles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }));

          const volumeData: HistogramData<Time>[] = fetchedCandles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(0, 212, 170, 0.5)' : 'rgba(255, 68, 102, 0.5)',
          }));

          candlestickSeriesRef.current.setData(candleData);
          volumeSeriesRef.current.setData(volumeData);

          if (fetchedCandles.length > 0) {
            setCurrentPrice(fetchedCandles[fetchedCandles.length - 1].close);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, setCandles, setCurrentPrice]);

  // Initialize chart
  useIsomorphicLayoutEffect(() => {
    const container = chartContainerRef.current;
    if (!container || isInitializedRef.current) return;

    isInitializedRef.current = true;
    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#555', width: 1, style: 2, labelBackgroundColor: '#333' },
        horzLine: { color: '#555', width: 1, style: 2, labelBackgroundColor: '#333' },
      },
      rightPriceScale: {
        borderColor: '#333',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#333',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00d4aa',
      downColor: '#ff4466',
      borderDownColor: '#ff4466',
      borderUpColor: '#00d4aa',
      wickDownColor: '#ff4466',
      wickUpColor: '#00d4aa',
      lastValueVisible: true,
      priceLineVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#00d4aa',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartRef.current && container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      try { chart.remove(); } catch { /* ignore */ }
      container.innerHTML = '';
      isInitializedRef.current = false;
    };
  }, []);

  // Toggle volume visibility
  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({
        visible: showVolume,
      });
    }
  }, [showVolume]);

  // Fetch data and subscribe to WebSocket
  useEffect(() => {
    fetchHistoricalData();

    bybitWS.connect('linear');

    const unsubscribe = bybitWS.subscribeKline(symbol, timeframe, (candle, isClosed) => {
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        try {
          candlestickSeriesRef.current.update({
            time: candle.time as Time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });

          volumeSeriesRef.current.update({
            time: candle.time as Time,
            value: candle.volume,
            color: candle.close >= candle.open ? 'rgba(0, 212, 170, 0.5)' : 'rgba(255, 68, 102, 0.5)',
          });

          setCurrentPrice(candle.close);
          updateCurrentCandle(candle);
        } catch { /* ignore */ }
      }
    }, 'linear');

    return () => unsubscribe();
  }, [symbol, timeframe, fetchHistoricalData, setCurrentPrice, updateCurrentCandle]);

  const handleSymbolChange = (newSymbol: Symbol) => {
    setSymbol(newSymbol);
  };

  const handleTimeframeChange = (newTimeframe: Timeframe) => {
    setTimeframe(newTimeframe);
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-b border-zinc-800">
        <div className="flex items-center gap-4">
          {/* Symbol */}
          <div className="flex items-center gap-2">
            <select
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value as Symbol)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded px-3 py-1.5 font-medium"
            >
              {CRYPTO_SYMBOLS.map((s) => (
                <option key={s} value={s}>{SYMBOLS[s].name}</option>
              ))}
            </select>

            <span className="text-lg font-bold text-white">
              ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Timeframes */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => handleTimeframeChange(tf.value)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  timeframe === tf.value
                    ? 'bg-zinc-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chart Style */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded p-0.5">
            <button
              onClick={() => setChartStyle('candles')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                chartStyle === 'candles' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Candles
            </button>
            <button
              onClick={() => setChartStyle('hollow')}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                chartStyle === 'hollow' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Hollow
            </button>
          </div>

          {/* Volume Toggle */}
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              showVolume
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
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
            className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            [ ]
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 z-10">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="w-full h-full"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900/50 border-t border-zinc-800 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span>Bybit Perpetual</span>
          <span className="text-green-500">Connected</span>
        </div>
        <div className="flex items-center gap-4">
          <span>O: {candles[candles.length - 1]?.open.toFixed(2) || '-'}</span>
          <span>H: {candles[candles.length - 1]?.high.toFixed(2) || '-'}</span>
          <span>L: {candles[candles.length - 1]?.low.toFixed(2) || '-'}</span>
          <span>C: {candles[candles.length - 1]?.close.toFixed(2) || '-'}</span>
          <span>Vol: {candles[candles.length - 1]?.volume.toFixed(2) || '-'}</span>
        </div>
      </div>
    </div>
  );
}
