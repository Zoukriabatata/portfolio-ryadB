'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { useEquityOptionsStore } from '@/stores/useEquityOptionsStore';
import { themeColor } from '@/lib/ui/themeColors';

interface VolatilitySkewChartProps {
  className?: string;
  height?: number;
}

export default function VolatilitySkewChart({
  className,
  height = 400,
}: VolatilitySkewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const callSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const putSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const spotLineRef = useRef<ISeriesApi<'Line'> | null>(null);

  const { getVolatilitySkew, underlyingPrice, getATMStrike } = useEquityOptionsStore();

  const updateChart = useCallback(() => {
    if (!callSeriesRef.current || !putSeriesRef.current) return;

    const skewData = getVolatilitySkew();
    if (skewData.length === 0) return;

    // Prepare data for line series
    // Using strike as "time" (x-axis) - this is a workaround since lightweight-charts
    // is primarily for time-series, but we use it for strike prices
    const callData: LineData<Time>[] = [];
    const putData: LineData<Time>[] = [];

    skewData.forEach((point) => {
      // Use strike as time value (converted to Unix timestamp format)
      const timeValue = point.strike as unknown as Time;

      if (point.callIV !== null && point.callIV > 0) {
        callData.push({
          time: timeValue,
          value: point.callIV * 100, // Convert to percentage
        });
      }

      if (point.putIV !== null && point.putIV > 0) {
        putData.push({
          time: timeValue,
          value: point.putIV * 100, // Convert to percentage
        });
      }
    });

    callSeriesRef.current.setData(callData);
    putSeriesRef.current.setData(putData);

    // Add marker at ATM strike (vertical lines not supported in lightweight-charts)
    const atmStrike = getATMStrike();
    if (atmStrike && spotLineRef.current && callData.length > 0) {
      // Find the IV value at ATM strike for the marker
      const atmCallPoint = callData.find((d) => (d.time as unknown as number) === atmStrike);
      const atmPutPoint = putData.find((d) => (d.time as unknown as number) === atmStrike);
      const atmIV = atmCallPoint?.value ?? atmPutPoint?.value ?? 0;

      if (atmIV > 0) {
        // Use a single point marker instead of a vertical line
        spotLineRef.current.setData([
          { time: atmStrike as unknown as Time, value: atmIV },
        ]);
      } else {
        spotLineRef.current.setData([]);
      }
    }

    // Fit content
    chartRef.current?.timeScale().fitContent();
  }, [getVolatilitySkew, getATMStrike]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: themeColor('--background') },
        textColor: themeColor('--text-secondary'),
      },
      grid: {
        vertLines: { color: themeColor('--border') },
        horzLines: { color: themeColor('--border') },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: themeColor('--text-muted'),
          width: 1,
          style: 2,
          labelBackgroundColor: themeColor('--border'),
        },
        horzLine: {
          color: themeColor('--text-muted'),
          width: 1,
          style: 2,
          labelBackgroundColor: themeColor('--border'),
        },
      },
      rightPriceScale: {
        borderColor: themeColor('--border'),
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: themeColor('--border'),
        tickMarkFormatter: (time: number) => {
          // Format strike price
          if (time >= 1000) {
            return `$${time}`;
          }
          return `$${time}`;
        },
      },
      localization: {
        priceFormatter: (price: number) => `${price.toFixed(1)}%`,
      },
    });

    // Call IV series (bull)
    const callSeries = chart.addSeries(LineSeries, {
      color: themeColor('--bull'),
      lineWidth: 2,
      title: 'Call IV',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
      },
    });

    // Put IV series (bear)
    const putSeries = chart.addSeries(LineSeries, {
      color: themeColor('--bear'),
      lineWidth: 2,
      title: 'Put IV',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${price.toFixed(1)}%`,
      },
    });

    // ATM line (dashed, theme text)
    const spotLine = chart.addSeries(LineSeries, {
      color: themeColor('--text-primary'),
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: 'ATM',
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    callSeriesRef.current = callSeries;
    putSeriesRef.current = putSeries;
    spotLineRef.current = spotLine;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      try {
        chart.remove();
      } catch {
        // Ignore cleanup errors
      }
      chartRef.current = null;
      callSeriesRef.current = null;
      putSeriesRef.current = null;
      spotLineRef.current = null;
    };
  }, [height]);

  // Update chart when data changes
  useEffect(() => {
    updateChart();
  }, [updateChart]);

  return (
    <div className={className}>
      <div ref={chartContainerRef} style={{ height: `${height}px` }} />

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5" style={{ backgroundColor: 'var(--bull)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Call IV</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5" style={{ backgroundColor: 'var(--bear)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Put IV</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 border-dashed" style={{ backgroundColor: 'var(--text-primary)', borderTopWidth: 1 }} />
          <span style={{ color: 'var(--text-muted)' }}>ATM (${underlyingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
        </div>
      </div>
    </div>
  );
}
