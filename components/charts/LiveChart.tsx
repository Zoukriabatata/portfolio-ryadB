'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  type LiveCandle,
  type TimeframeSeconds,
  TIMEFRAME_LABELS,
} from '@/lib/live/TickAggregator';
import { getBinanceLiveWS, type ConnectionStatus } from '@/lib/live/BinanceLiveWS';

/**
 * LIVE CHART COMPONENT
 *
 * Graphique en temps réel avec :
 * - Connexion WebSocket Binance
 * - Agrégation live en 15s/30s/1m/5m
 * - Mise à jour instantanée
 * - Changement de timeframe à chaud
 */

interface LiveChartProps {
  className?: string;
}

// Symboles disponibles
const SYMBOLS = [
  { value: 'btcusdt', label: 'BTC/USDT' },
  { value: 'ethusdt', label: 'ETH/USDT' },
  { value: 'solusdt', label: 'SOL/USDT' },
  { value: 'bnbusdt', label: 'BNB/USDT' },
  { value: 'xrpusdt', label: 'XRP/USDT' },
];

// Timeframes disponibles
const TIMEFRAMES: TimeframeSeconds[] = [15, 30, 60, 300];

export default function LiveChart({ className }: LiveChartProps) {
  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // State
  const [symbol, setSymbol] = useState('btcusdt');
  const [timeframe, setTimeframe] = useState<TimeframeSeconds>(15);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [tickCount, setTickCount] = useState(0);
  const [candleCount, setCandleCount] = useState(0);

  /**
   * Convertit les bougies pour Lightweight Charts
   */
  const formatCandles = useCallback((candles: LiveCandle[]) => {
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
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    }));

    return { candleData, volumeData };
  }, []);

  /**
   * Met à jour le graphique avec les données
   */
  const updateChart = useCallback((candles: LiveCandle[]) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const { candleData, volumeData } = formatCandles(candles);

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    setCandleCount(candles.length);

    // Scroll vers la droite
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [formatCandles]);

  /**
   * Met à jour une seule bougie (pour les updates live)
   */
  const updateSingleCandle = useCallback((candle: LiveCandle) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    try {
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
        color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      });

      setCurrentPrice(candle.close);
    } catch (error) {
      // Ignore les erreurs de mise à jour (peut arriver avec des timestamps out of order)
    }
  }, []);

  /**
   * Initialise le graphique
   */
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    // Crée le chart
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: '#0a0a0a' },
        textColor: '#9ca3af',
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
        secondsVisible: timeframe < 60,
        rightOffset: 5,
      },
    });

    // Série de chandeliers
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    // Série de volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#22c55e',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [timeframe]);

  /**
   * Connexion WebSocket et abonnement aux événements
   */
  useEffect(() => {
    const ws = getBinanceLiveWS();
    const aggregator = getAggregator();

    // S'abonne aux changements de status
    const unsubStatus = ws.onStatus((newStatus) => {
      setStatus(newStatus);
    });

    // S'abonne aux ticks pour le compteur
    const unsubTick = ws.onTick(() => {
      setTickCount(ws.getTickCount());
    });

    // S'abonne aux mises à jour de bougies
    const unsubCandle = aggregator.on('candle:update', (candle, tf) => {
      if (tf === timeframe) {
        updateSingleCandle(candle);
      }
    });

    // S'abonne aux fermetures de bougies
    const unsubClose = aggregator.on('candle:close', (candle, tf) => {
      if (tf === timeframe) {
        // Recalcule le changement de prix
        const history = aggregator.getHistory(tf);
        if (history.length >= 2) {
          const prev = history[history.length - 2];
          const change = ((candle.close - prev.close) / prev.close) * 100;
          setPriceChange(change);
        }
      }
    });

    // Connecte au WebSocket
    ws.connect(symbol);

    // Charge les données existantes
    setTimeout(() => {
      const allCandles = aggregator.getAllCandles(timeframe);
      if (allCandles.length > 0) {
        updateChart(allCandles);
      }
    }, 100);

    return () => {
      unsubStatus();
      unsubTick();
      unsubCandle();
      unsubClose();
    };
  }, [symbol, timeframe, updateSingleCandle, updateChart]);

  /**
   * Change de symbole
   */
  const handleSymbolChange = (newSymbol: string) => {
    setSymbol(newSymbol);
    getBinanceLiveWS().changeSymbol(newSymbol);
    setCurrentPrice(0);
    setPriceChange(0);
    setTickCount(0);
  };

  /**
   * Change de timeframe
   */
  const handleTimeframeChange = (newTf: TimeframeSeconds) => {
    setTimeframe(newTf);

    // Met à jour le chart avec les données du nouveau timeframe
    setTimeout(() => {
      const aggregator = getAggregator();
      const allCandles = aggregator.getAllCandles(newTf);
      updateChart(allCandles);
    }, 50);
  };

  // Couleur du status
  const statusColors: Record<ConnectionStatus, string> = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    disconnected: 'bg-zinc-500',
    error: 'bg-red-500',
  };

  return (
    <div className={`flex flex-col h-full bg-[#0a0a0a] ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111] border-b border-zinc-800">
        {/* Gauche : Symbole & Prix */}
        <div className="flex items-center gap-4">
          {/* Sélecteur de symbole */}
          <select
            value={symbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm font-bold rounded px-3 py-1.5"
          >
            {SYMBOLS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Prix actuel */}
          {currentPrice > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-bold text-white">
                ${currentPrice.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Centre : Timeframes */}
        <div className="flex items-center gap-1 bg-zinc-800 rounded p-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                timeframe === tf
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>

        {/* Droite : Stats */}
        <div className="flex items-center gap-4">
          {/* Compteur de bougies */}
          <div className="text-xs text-zinc-500">
            <span className="text-zinc-400">{candleCount}</span> bougies
          </div>

          {/* Compteur de ticks */}
          <div className="text-xs text-zinc-500">
            <span className="text-zinc-400">{tickCount.toLocaleString()}</span> ticks
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
            <span className="text-xs text-zinc-400 capitalize">{status}</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative">
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* Overlay si déconnecté */}
        {status === 'disconnected' && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400">Connexion au flux live...</span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-red-500 text-xl">!</span>
              </div>
              <span className="text-zinc-400">Erreur de connexion</span>
              <button
                onClick={() => getBinanceLiveWS().connect(symbol)}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Reconnecter
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-[#111] border-t border-zinc-800 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span>Binance Spot</span>
          <span className="text-zinc-600">|</span>
          <span>Timeframe: <span className="text-zinc-400">{TIMEFRAME_LABELS[timeframe]}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span>WebSocket Live</span>
          <span className="text-zinc-600">|</span>
          <span className={status === 'connected' ? 'text-green-500' : 'text-zinc-400'}>
            {status === 'connected' ? 'Streaming' : 'En attente'}
          </span>
        </div>
      </div>
    </div>
  );
}
