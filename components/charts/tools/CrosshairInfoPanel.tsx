'use client';

import { useEffect, useState, useRef } from 'react';
import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts';
import { formatVolume } from '@/lib/utils/formatters';

interface CrosshairData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

interface CrosshairInfoPanelProps {
  chart: IChartApi | null;
  candlestickSeries: unknown;
  volumeSeries: unknown;
}

export default function CrosshairInfoPanel({
  chart,
  candlestickSeries,
  volumeSeries,
}: CrosshairInfoPanelProps) {
  const [data, setData] = useState<CrosshairData | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!chart || !candlestickSeries) return;

    const handler = (param: MouseEventParams<Time>) => {
      // Don't update state if component is unmounting
      if (!isMountedRef.current) return;

      try {
        if (!param.point || !param.seriesData || param.seriesData.size === 0) {
          setData(null);
          return;
        }

        // Get candlestick data
        const candleData = param.seriesData.get(candlestickSeries as Parameters<typeof param.seriesData.get>[0]);
        if (!candleData || !('open' in candleData)) {
          setData(null);
          return;
        }

        const candle = candleData as { time: Time; open: number; high: number; low: number; close: number };

        // Get volume data
        let volume = 0;
        if (volumeSeries) {
          const volData = param.seriesData.get(volumeSeries as Parameters<typeof param.seriesData.get>[0]);
          if (volData && 'value' in volData) {
            volume = (volData as { value: number }).value;
          }
        }

        // Format time
        const timeValue = candle.time as number;
        const date = new Date(timeValue * 1000);
        const timeStr = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Calculate change
        const change = candle.close - candle.open;
        const changePercent = candle.open !== 0 ? (change / candle.open) * 100 : 0;

        setData({
          time: timeStr,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume,
          change,
          changePercent,
        });
      } catch {
        // Ignore errors when chart is being destroyed
      }
    };

    try {
      chart.subscribeCrosshairMove(handler);
    } catch {
      // Chart may have been destroyed
      return;
    }

    return () => {
      try {
        chart.unsubscribeCrosshairMove(handler);
      } catch {
        // Chart may have been destroyed
      }
    };
  }, [chart, candlestickSeries, volumeSeries]);

  // Always render the container, just hide it when no data
  // This prevents React DOM reconciliation issues
  const isPositive = data ? data.change >= 0 : true;

  return (
    <div
      className="absolute top-2 left-2 z-10 bg-zinc-900/95 backdrop-blur rounded-lg px-3 py-2 shadow-lg border border-zinc-800 transition-opacity duration-150"
      style={{
        opacity: data ? 1 : 0,
        pointerEvents: data ? 'auto' : 'none',
        visibility: data ? 'visible' : 'hidden',
      }}
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <span className="text-zinc-500">Time</span>
        <span className="text-zinc-200 font-mono">{data?.time ?? '-'}</span>

        <span className="text-zinc-500">O</span>
        <span className="text-zinc-200 font-mono">
          {data?.open.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-'}
        </span>

        <span className="text-zinc-500">H</span>
        <span className="text-emerald-400 font-mono">
          {data?.high.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-'}
        </span>

        <span className="text-zinc-500">L</span>
        <span className="text-red-400 font-mono">
          {data?.low.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-'}
        </span>

        <span className="text-zinc-500">C</span>
        <span className="text-zinc-200 font-mono">
          {data?.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '-'}
        </span>

        <span className="text-zinc-500">Vol</span>
        <span className="text-zinc-200 font-mono">{data ? formatVolume(data.volume) : '-'}</span>

        <span className="text-zinc-500">Chg</span>
        <span className={`font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {data ? (
            `${isPositive ? '+' : ''}${data.change.toFixed(2)} (${isPositive ? '+' : ''}${data.changePercent.toFixed(2)}%)`
          ) : '-'}
        </span>
      </div>
    </div>
  );
}

// formatVolume imported from @/lib/utils/formatters
