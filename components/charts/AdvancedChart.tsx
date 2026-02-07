'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import { SYMBOLS, type Candle } from '@/types/market';
import {
  calculateVolumeProfile,
  calculateVWAP,
  calculateTWAP,
  type VolumeProfile,
  type VWAPData,
  type TWAPData,
} from '@/lib/calculations/indicators';

interface AdvancedChartProps {
  className?: string;
  showVolumeProfile?: boolean;
  showVWAP?: boolean;
  showTWAP?: boolean;
}

const BYBIT_API_BASE = '/api/bybit';
const YAHOO_API_BASE = '/api/yahoo';

export default function AdvancedChart({
  className,
  showVolumeProfile = true,
  showVWAP = true,
  showTWAP = false,
}: AdvancedChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const vpCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const vwapLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const twapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const [loading, setLoading] = useState(false);
  const [volumeProfile, setVolumeProfile] = useState<VolumeProfile | null>(null);
  const [marketState, setMarketState] = useState<string>('');
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chartInitializedRef = useRef(false);

  const { symbol, timeframe, candles, setCandles, updateCurrentCandle, setConnected, setCurrentPrice } = useMarketStore();

  const symbolInfo = SYMBOLS[symbol];
  const isCME = symbolInfo?.exchange === 'tradovate';
  const tickSize = symbolInfo?.tickSize || 1;

  // Fetch Bybit data
  const fetchBybitData = useCallback(async () => {
    const intervalMap: Record<string, string> = {
      '1m': '1', '5m': '5', '15m': '15', '30m': '30',
      '1h': '60', '4h': '240', '1d': 'D',
    };
    const interval = intervalMap[timeframe] || '1';

    const response = await fetch(
      `${BYBIT_API_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=500`
    );
    const data = await response.json();

    if (data.retCode !== 0) throw new Error(data.retMsg);

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

  // Fetch Yahoo data
  const fetchYahooData = useCallback(async () => {
    const response = await fetch(
      `${YAHOO_API_BASE}/quote?symbol=${symbol}&interval=${timeframe}`
    );
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    setMarketState(data.marketState || '');
    setCurrentPrice(data.currentPrice || 0);

    return data.candles || [];
  }, [symbol, timeframe, setCurrentPrice]);

  // Update chart with indicators
  const updateChartWithIndicators = useCallback((candleData: Candle[]) => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    // Set candle data
    const candlestickData: CandlestickData<Time>[] = candleData.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData<Time>[] = candleData.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
    }));

    candlestickSeriesRef.current.setData(candlestickData);
    volumeSeriesRef.current.setData(volumeData);

    // Calculate and set VWAP
    if (showVWAP && vwapSeriesRef.current) {
      const vwapData = calculateVWAP(candleData);
      const vwapLine: LineData<Time>[] = vwapData.map(v => ({
        time: v.time as Time,
        value: v.vwap,
      }));
      vwapSeriesRef.current.setData(vwapLine);

      // VWAP bands
      if (vwapUpperRef.current && vwapLowerRef.current) {
        vwapUpperRef.current.setData(vwapData.map(v => ({
          time: v.time as Time,
          value: v.upperBand1,
        })));
        vwapLowerRef.current.setData(vwapData.map(v => ({
          time: v.time as Time,
          value: v.lowerBand1,
        })));
      }
    }

    // Calculate and set TWAP
    if (showTWAP && twapSeriesRef.current) {
      const twapData = calculateTWAP(candleData, 20);
      const twapLine: LineData<Time>[] = twapData.map(t => ({
        time: t.time as Time,
        value: t.twap,
      }));
      twapSeriesRef.current.setData(twapLine);
    }

    // Calculate Volume Profile with adaptive tick size
    if (showVolumeProfile && candleData.length > 0) {
      // Calculate price range using reduce to avoid stack overflow
      let minPrice = candleData[0].low;
      let maxPrice = candleData[0].high;
      candleData.forEach(c => {
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
      });

      // Adapt tick size for ~50-100 levels
      const priceRange = maxPrice - minPrice;
      const targetLevels = 80;
      const vpTickSize = Math.max(tickSize, Math.ceil(priceRange / targetLevels / tickSize) * tickSize);

      const vp = calculateVolumeProfile(candleData, vpTickSize);
      setVolumeProfile(vp);
    }

    // Set current price
    if (candleData.length > 0) {
      setCurrentPrice(candleData[candleData.length - 1].close);
    }
  }, [showVWAP, showTWAP, showVolumeProfile, tickSize, setCurrentPrice]);

  // Fetch historical data
  const fetchHistoricalData = useCallback(async () => {
    setLoading(true);
    try {
      const candleData = isCME ? await fetchYahooData() : await fetchBybitData();

      if (!candleData || candleData.length === 0) {
        setLoading(false);
        return;
      }

      setCandles(candleData);
      updateChartWithIndicators(candleData);
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
    } finally {
      setLoading(false);
    }
  }, [isCME, fetchBybitData, fetchYahooData, setCandles, updateChartWithIndicators]);

  // Draw Volume Profile on canvas
  const drawVolumeProfile = useCallback(() => {
    const canvas = vpCanvasRef.current;
    const chart = chartRef.current;
    const series = candlestickSeriesRef.current;
    if (!canvas || !chart || !series || !volumeProfile || volumeProfile.levels.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const timeScale = chart.timeScale();

    // Get visible range
    const visibleRange = timeScale.getVisibleLogicalRange();
    if (!visibleRange) return;

    // Canvas dimensions
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, width, height);

    const vpWidth = 80; // Volume profile width
    // Use reduce instead of spread to avoid stack overflow with large arrays
    const maxVolume = volumeProfile.levels.reduce((max, l) => Math.max(max, l.volume), 0);

    volumeProfile.levels.forEach(level => {
      // Convert price to Y coordinate using series API
      const y = series.priceToCoordinate(level.price);
      if (y === null || y < 0 || y > height) return;

      const barWidth = (level.volume / maxVolume) * vpWidth;
      const barHeight = Math.max(2, tickSize * 0.8);

      // Color based on delta
      const deltaRatio = level.volume > 0 ? level.delta / level.volume : 0;
      const color = deltaRatio > 0
        ? `rgba(38, 166, 154, ${0.3 + Math.abs(deltaRatio) * 0.5})`
        : `rgba(239, 68, 68, ${0.3 + Math.abs(deltaRatio) * 0.5})`;

      ctx.fillStyle = color;
      ctx.fillRect(width - vpWidth, y - barHeight / 2, barWidth, barHeight);

      // POC highlight
      if (level.price === volumeProfile.poc) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(width - vpWidth, y - barHeight / 2, barWidth, barHeight);
      }
    });

    // Draw VAH/VAL lines using series API
    const vahY = series.priceToCoordinate(volumeProfile.vah);
    const valY = series.priceToCoordinate(volumeProfile.val);

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
    ctx.lineWidth = 1;

    if (vahY !== null) {
      ctx.beginPath();
      ctx.moveTo(0, vahY);
      ctx.lineTo(width, vahY);
      ctx.stroke();
    }

    if (valY !== null) {
      ctx.beginPath();
      ctx.moveTo(0, valY);
      ctx.lineTo(width, valY);
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }, [volumeProfile, tickSize]);

  // Initialize chart
  useEffect(() => {
    if (!wrapperRef.current || chartInitializedRef.current) return;

    // Create a container div that React won't manage
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    wrapperRef.current.appendChild(container);
    chartContainerRef.current = container;
    chartInitializedRef.current = true;

    const chart = createChart(container, {
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

    // Candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderDownColor: '#ef5350',
      borderUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      wickUpColor: '#26a69a',
    });

    // Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // VWAP series
    if (showVWAP) {
      const vwapSeries = chart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 2,
        title: 'VWAP',
        priceLineVisible: false,
      });
      vwapSeriesRef.current = vwapSeries;

      // VWAP bands
      const vwapUpper = chart.addSeries(LineSeries, {
        color: 'rgba(139, 92, 246, 0.3)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
      });
      const vwapLower = chart.addSeries(LineSeries, {
        color: 'rgba(139, 92, 246, 0.3)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
      });
      vwapUpperRef.current = vwapUpper;
      vwapLowerRef.current = vwapLower;
    }

    // TWAP series
    if (showTWAP) {
      const twapSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        title: 'TWAP',
        priceLineVisible: false,
      });
      twapSeriesRef.current = twapSeries;
    }

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (wrapperRef.current) {
        chart.applyOptions({
          width: wrapperRef.current.clientWidth,
          height: wrapperRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      // Clear refs before removing chart
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
      twapSeriesRef.current = null;
      chartInitializedRef.current = false;
      // Remove chart safely
      try {
        chart.remove();
      } catch {
        // Ignore removal errors
      }
      // Remove manually created container
      if (chartContainerRef.current && wrapperRef.current) {
        try {
          wrapperRef.current.removeChild(chartContainerRef.current);
        } catch {
          // Ignore if already removed
        }
        chartContainerRef.current = null;
      }
    };
  }, [showVWAP, showTWAP]);

  // Fetch data and subscribe
  useEffect(() => {
    fetchHistoricalData();

    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    let unsubscribe: (() => void) | undefined;

    if (isCME) {
      refreshIntervalRef.current = setInterval(fetchHistoricalData, 15000);
      setConnected(true);
    } else {
      bybitWS.connect('linear');

      const updateChart = (candle: Candle) => {
        updateCurrentCandle(candle);
        setCurrentPrice(candle.close);

        if (candlestickSeriesRef.current && volumeSeriesRef.current) {
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
        }
      };

      unsubscribe = bybitWS.subscribeKline(symbol, timeframe, updateChart, 'linear');
      setConnected(true);
    }

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (unsubscribe) unsubscribe();
    };
  }, [symbol, timeframe, isCME, fetchHistoricalData, updateCurrentCandle, setConnected, setCurrentPrice]);

  // Redraw VP when data changes or chart scrolls
  useEffect(() => {
    drawVolumeProfile();

    // Subscribe to chart scroll/zoom to redraw VP
    const chart = chartRef.current;
    if (chart && showVolumeProfile) {
      const handler = () => drawVolumeProfile();
      chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return () => {
        try {
          chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
        } catch {
          // Ignore if chart is already destroyed
        }
      };
    }
  }, [volumeProfile, drawVolumeProfile, showVolumeProfile]);

  return (
    <div className="relative w-full h-full">
      {/* Market state for CME */}
      {isCME && marketState && (
        <div className="absolute top-2 right-24 z-10">
          <span className={`text-xs px-2 py-1 rounded ${
            marketState === 'REGULAR' ? 'bg-green-500/20 text-green-400' :
            marketState === 'PRE' || marketState === 'POST' ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-zinc-500/20 text-zinc-400'
          }`}>
            {marketState === 'REGULAR' ? 'Market Open' :
             marketState === 'PRE' ? 'Pre-Market' :
             marketState === 'POST' ? 'After Hours' : 'Closed'}
          </span>
          <span className="ml-2 text-xs text-zinc-500">15min delay</span>
        </div>
      )}

      {/* Indicator legend */}
      <div className="absolute top-2 left-2 z-10 flex gap-3 text-xs">
        {showVWAP && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-purple-500"></span>
            <span className="text-zinc-400">VWAP</span>
          </span>
        )}
        {showTWAP && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-amber-500"></span>
            <span className="text-zinc-400">TWAP</span>
          </span>
        )}
        {showVolumeProfile && volumeProfile && (
          <span className="text-zinc-400">
            POC: ${volumeProfile.poc.toLocaleString()}
          </span>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 z-10">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Chart container wrapper - inner div created by JS to isolate from React */}
      <div
        ref={wrapperRef}
        className={`w-full h-full min-h-[400px] ${className || ''}`}
      />

      {/* Volume Profile overlay - always render to avoid DOM conflicts */}
      <canvas
        ref={vpCanvasRef}
        className="absolute top-0 right-0 w-full h-full pointer-events-none"
        style={{ zIndex: 5, display: showVolumeProfile ? 'block' : 'none' }}
      />
    </div>
  );
}
