'use client';

import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react';
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
import { useMarketStore } from '@/stores/useMarketStore';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import { useChartToolsStore } from '@/stores/useChartToolsStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS, type Candle } from '@/types/market';
import DrawingToolbar from './tools/DrawingToolbar';
import IndicatorPanel from './tools/IndicatorPanel';
import { IndicatorManager } from './tools/IndicatorManager';
import VolumeProfile from './tools/VolumeProfile';

interface CandlestickChartProps {
  className?: string;
}

const BYBIT_API_BASE = '/api/bybit';
const YAHOO_API_BASE = '/api/yahoo';

// Use useLayoutEffect on client, useEffect on server
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function CandlestickChart({ className }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorManagerRef = useRef<IndicatorManager | null>(null);
  const isInitializedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [marketState, setMarketState] = useState<string>('');
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [volumeProfileMode, setVolumeProfileMode] = useState<'sidebar' | 'overlay' | 'both'>('sidebar');
  const [chartHeight, setChartHeight] = useState(500);
  const [chartWidth, setChartWidth] = useState(800);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { symbol, timeframe, candles, setCandles, updateCurrentCandle, setConnected, setCurrentPrice } = useMarketStore();
  const { indicators } = useIndicatorStore();
  const { clearDrawings } = useChartToolsStore();

  const symbolInfo = SYMBOLS[symbol];
  const isCME = symbolInfo?.exchange === 'tradovate'; // CME futures use Yahoo now

  // Convert timeframe to Bybit interval format
  const getBybitInterval = (tf: string): string => {
    const map: Record<string, string> = {
      '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
      '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
      '1d': 'D', '1w': 'W', '1M': 'M',
    };
    return map[tf] || '1';
  };

  // Fetch historical candles from Bybit
  const fetchBybitData = useCallback(async () => {
    const interval = getBybitInterval(timeframe);
    const response = await fetch(
      `${BYBIT_API_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=500`
    );

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid response from Bybit API');
    }

    const data = await response.json();

    if (data.retCode !== 0) {
      throw new Error(data.retMsg || 'Failed to fetch Bybit data');
    }

    if (!data.result?.list) {
      throw new Error('No data from Bybit');
    }

    return data.result.list
      .map((k: string[]) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }))
      .reverse();
  }, [symbol, timeframe]);

  // Fetch historical candles from Yahoo Finance
  const fetchYahooData = useCallback(async () => {
    const response = await fetch(
      `${YAHOO_API_BASE}/quote?symbol=${symbol}&interval=${timeframe}`
    );

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid response from Yahoo API');
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    setMarketState(data.marketState || '');
    setCurrentPrice(data.currentPrice || 0);

    return data.candles || [];
  }, [symbol, timeframe, setCurrentPrice]);

  // Fetch historical data
  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    try {
      let candles: Candle[];

      if (isCME) {
        candles = await fetchYahooData();
      } else {
        candles = await fetchBybitData();
      }

      if (!candles || candles.length === 0) {
        setLoading(false);
        return;
      }

      setCandles(candles);

      // Update chart
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        const candleData: CandlestickData<Time>[] = candles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const volumeData: HistogramData<Time>[] = candles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
        }));

        candlestickSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        // Set current price
        if (candles.length > 0) {
          setCurrentPrice(candles[candles.length - 1].close);
        }
      }
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
    } finally {
      setLoading(false);
    }
  }, [isCME, fetchBybitData, fetchYahooData, setCandles, setCurrentPrice]);

  // Initialize chart - use useIsomorphicLayoutEffect for synchronous DOM updates
  useIsomorphicLayoutEffect(() => {
    const container = chartContainerRef.current;
    if (!container || isInitializedRef.current) return;

    isInitializedRef.current = true;

    // Clear container using innerHTML (safest method)
    container.innerHTML = '';

    // Create chart directly in container
    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: container.clientHeight || 500,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#6b7280', width: 1, style: 2 },
        horzLine: { color: '#6b7280', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#374151',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      lastValueVisible: true,
      priceLineVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;
    indicatorManagerRef.current = new IndicatorManager(chart);

    setChartHeight(container.clientHeight || 500);
    setChartWidth(container.clientWidth || 800);

    const handleResize = () => {
      if (!chartRef.current) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        try {
          chartRef.current.applyOptions({ width, height });
          setChartHeight(height);
          setChartWidth(width);
        } catch { /* ignore */ }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);

      // Cleanup in order
      indicatorManagerRef.current?.destroy();
      indicatorManagerRef.current = null;

      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;

      try {
        chart.remove();
      } catch { /* ignore */ }

      // Use innerHTML to clear - never throws
      container.innerHTML = '';
      isInitializedRef.current = false;
    };
  }, []);

  // Update indicators when they change or when candles update
  useEffect(() => {
    if (indicatorManagerRef.current && candles.length > 0) {
      indicatorManagerRef.current.updateIndicators(indicators, candles);
    }
  }, [indicators, candles]);

  // Fetch data and subscribe to updates
  useEffect(() => {
    fetchHistoricalData();

    // Clear any existing refresh interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    let unsubscribe: (() => void) | undefined;

    if (isCME) {
      // For CME (Yahoo), poll every 15 seconds (data is delayed anyway)
      refreshIntervalRef.current = setInterval(() => {
        fetchHistoricalData();
      }, 15000);

      setConnected(true);
    } else {
      // For Crypto (Bybit), use WebSocket
      bybitWS.connect('linear');

      const updateChart = (candle: Candle) => {
        // Validate candle time is a valid number
        if (typeof candle.time !== 'number' || isNaN(candle.time) || candle.time <= 0) {
          console.warn('Invalid candle time:', candle.time);
          return;
        }

        updateCurrentCandle(candle);
        setCurrentPrice(candle.close);

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
              color: candle.close >= candle.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
            });
          } catch (err) {
            // Ignore chart update errors (can happen with out-of-order updates)
          }
        }
      };

      unsubscribe = bybitWS.subscribeKline(symbol, timeframe, updateChart, 'linear');
      setConnected(true);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (unsubscribe) unsubscribe();
    };
  }, [symbol, timeframe, isCME, fetchHistoricalData, updateCurrentCandle, setConnected, setCurrentPrice]);

  return (
    <div className="relative w-full h-full">
      {/* Drawing Toolbar */}
      {showToolbar && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
          <DrawingToolbar onClearAll={() => clearDrawings(symbol)} />
        </div>
      )}

      {/* Right side controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
        {/* Indicator button */}
        <button
          onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            showIndicatorPanel
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          }`}
        >
          Indicators
        </button>

        {/* Toggle toolbar button */}
        <button
          onClick={() => setShowToolbar(!showToolbar)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            showToolbar
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          }`}
        >
          Tools
        </button>

        {/* Volume Profile toggle - cycles through modes */}
        <button
          onClick={() => {
            if (!showVolumeProfile) {
              setShowVolumeProfile(true);
              setVolumeProfileMode('sidebar');
            } else if (volumeProfileMode === 'sidebar') {
              setVolumeProfileMode('overlay');
            } else if (volumeProfileMode === 'overlay') {
              setVolumeProfileMode('both');
            } else {
              setShowVolumeProfile(false);
            }
          }}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            showVolumeProfile
              ? volumeProfileMode === 'overlay'
                ? 'bg-blue-600 text-white'
                : volumeProfileMode === 'both'
                  ? 'bg-purple-600 text-white'
                  : 'bg-green-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          }`}
          title={showVolumeProfile ? `VP: ${volumeProfileMode}` : 'Volume Profile off'}
        >
          VP{showVolumeProfile ? ` (${volumeProfileMode === 'sidebar' ? 'S' : volumeProfileMode === 'overlay' ? 'O' : 'B'})` : ''}
        </button>

        {/* Market state indicator for CME */}
        {isCME && marketState && (
          <>
            <span className={`text-xs px-2 py-1 rounded ${
              marketState === 'REGULAR' ? 'bg-green-500/20 text-green-400' :
              marketState === 'PRE' || marketState === 'POST' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-zinc-500/20 text-zinc-400'
            }`}>
              {marketState === 'REGULAR' ? 'Market Open' :
               marketState === 'PRE' ? 'Pre-Market' :
               marketState === 'POST' ? 'After Hours' :
               'Market Closed'}
            </span>
            <span className="text-xs text-zinc-500">15min delay</span>
          </>
        )}
      </div>

      {/* Indicator Panel */}
      <IndicatorPanel
        isOpen={showIndicatorPanel}
        onClose={() => setShowIndicatorPanel(false)}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 z-10">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div className="relative w-full h-full flex">
        <div
          ref={chartContainerRef}
          className={`relative h-full min-h-[400px] ${className || ''}`}
          style={{ width: showVolumeProfile && (volumeProfileMode === 'sidebar' || volumeProfileMode === 'both') ? 'calc(100% - 120px)' : '100%' }}
        >
          {/* Overlay Volume Profile - rendered on top of chart from right side */}
          {showVolumeProfile && (volumeProfileMode === 'overlay' || volumeProfileMode === 'both') && candles.length > 0 && (
            <div
              className="absolute right-[50px] top-0 pointer-events-none z-[5]"
              style={{ height: chartHeight || 500 }}
            >
              <VolumeProfile
                candles={candles}
                height={chartHeight || 500}
                width={Math.min((chartWidth || 800) * 0.25, 180)} // Max 25% of chart width or 180px
                tickSize={symbolInfo?.tickSize || 0.25}
                currentPrice={candles[candles.length - 1]?.close || 0}
                mode="overlay"
                profileType="visible"
                showLabels={false}
              />
            </div>
          )}
        </div>
        {/* Sidebar Volume Profile */}
        {showVolumeProfile && (volumeProfileMode === 'sidebar' || volumeProfileMode === 'both') && candles.length > 0 && (
          <div className="relative bg-zinc-950" style={{ width: '120px', height: chartHeight || 500 }}>
            <VolumeProfile
              candles={candles}
              height={chartHeight || 500}
              width={120}
              tickSize={symbolInfo?.tickSize || 0.25}
              currentPrice={candles[candles.length - 1]?.close || 0}
              mode="sidebar"
              profileType="visible"
              showLabels={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
