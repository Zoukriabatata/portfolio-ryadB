/**
 * FUTURES METRICS WIDGET
 *
 * Sidebar panel showing real-time futures data:
 * - Mark Price / Index Price
 * - Funding Rate + countdown
 * - Open Interest + mini chart
 * - Long/Short Ratio + visual bar
 * - Top Traders L/S
 * - Recent Liquidations
 */

'use client';

import { useMemo } from 'react';
import { useFuturesStore } from '@/stores/useFuturesStore';
import { formatPrice as fmtPrice, formatVolumeDollar } from '@/lib/utils/formatters';

export default function FuturesMetricsWidget() {
  const {
    markPrice,
    indexPrice,
    fundingRate,
    nextFundingTime,
    openInterestValue,
    openInterestHistory,
    globalLongShortRatio,
    globalLongAccount,
    globalShortAccount,
    topTraderLongShortRatio,
    longShortHistory,
    liquidations,
    recentLiqBuyVolume,
    recentLiqSellVolume,
    metricsError,
  } = useFuturesStore();

  const formatPrice = (p: number) => p === 0 ? '--' : fmtPrice(p);
  const formatLargeNumber = (n: number) => n === 0 ? '--' : formatVolumeDollar(n);

  const formatFundingRate = (rate: number) => {
    if (rate === 0) return '--';
    const pct = (rate * 100).toFixed(4);
    return `${rate >= 0 ? '+' : ''}${pct}%`;
  };

  const fundingCountdown = useMemo(() => {
    if (nextFundingTime === 0) return '--';
    const diff = nextFundingTime - Date.now();
    if (diff <= 0) return 'Now';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins}m`;
  }, [nextFundingTime]);

  const fundingColor = fundingRate > 0.0001
    ? 'text-[var(--bull)]'
    : fundingRate < -0.0001
    ? 'text-[var(--bear)]'
    : 'text-[var(--text-muted)]';

  const longPct = globalLongAccount * 100;
  const shortPct = globalShortAccount * 100;

  // OI mini chart
  const oiChartHeight = 52;
  const oiPoints = useMemo(() => {
    if (openInterestHistory.length < 2) return '';
    const values = openInterestHistory.map(p => p.value);
    let min = Infinity, max = -Infinity;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
    const range = max - min || 1;
    return openInterestHistory.map((p, i) => {
      const x = (i / (openInterestHistory.length - 1)) * 100;
      const y = ((max - p.value) / range) * oiChartHeight;
      return `${x},${y}`;
    }).join(' ');
  }, [openInterestHistory]);

  // Long/Short history sparkline
  const lsChartHeight = 40;
  const lsPoints = useMemo(() => {
    if (longShortHistory.length < 2) return '';
    const values = longShortHistory.map(p => p.ratio);
    let min = Infinity, max = -Infinity;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
    const range = max - min || 0.01;
    return longShortHistory.map((p, i) => {
      const x = (i / (longShortHistory.length - 1)) * 100;
      const y = ((max - p.ratio) / range) * lsChartHeight;
      return `${x},${y}`;
    }).join(' ');
  }, [longShortHistory]);

  // OI change percentage
  const oiChange = useMemo(() => {
    if (openInterestHistory.length < 2) return null;
    const first = openInterestHistory[0].value;
    const last = openInterestHistory[openInterestHistory.length - 1].value;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [openInterestHistory]);

  const recentLiqCount = useMemo(() => {
    return liquidations.filter(l => Date.now() - l.time < 60_000).length;
  }, [liquidations]);

  if (markPrice === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
        <div className="flex flex-col items-center gap-2 animate-fadeIn">
          {metricsError ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Futures data unavailable</span>
              <span className="text-[10px] text-[var(--text-dimmed)]">Retrying automatically...</span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 border-2 border-[var(--border-light)] border-t-transparent rounded-full animate-spin" />
              <span>Loading futures data...</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2.5 text-xs overflow-y-auto custom-scrollbar">
      {/* Mark Price */}
      <div className="text-center py-1">
        <p className="text-[10px] text-[var(--text-dimmed)] uppercase tracking-wider">Mark Price</p>
        <p className="text-lg font-mono font-bold text-[var(--text-primary)] leading-tight">
          {formatPrice(markPrice)}
        </p>
        <p className="text-[10px] text-[var(--text-dimmed)]">
          Index: {formatPrice(indexPrice)}
        </p>
      </div>

      {/* Funding Rate */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Funding Rate</span>
          <span className={`font-mono font-semibold ${fundingColor}`}>
            {formatFundingRate(fundingRate)}
          </span>
        </div>
        {/* Funding rate visual bar */}
        {fundingRate !== 0 && (
          <div className="mt-1.5 h-1 bg-[var(--background)] rounded-full overflow-hidden relative">
            <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
            <div
              className="absolute inset-y-0 rounded-full transition-all duration-500"
              style={{
                left: fundingRate >= 0 ? '50%' : undefined,
                right: fundingRate < 0 ? '50%' : undefined,
                width: `${Math.min(Math.abs(fundingRate) * 10000, 50)}%`,
                backgroundColor: fundingRate >= 0 ? 'var(--bull)' : 'var(--bear)',
              }}
            />
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[var(--text-dimmed)] text-[10px]">Next Funding</span>
          <span className="font-mono text-[var(--text-secondary)] text-[10px]">{fundingCountdown}</span>
        </div>
      </div>

      {/* Open Interest */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[var(--text-muted)]">Open Interest</span>
          <div className="flex items-center gap-1.5">
            {oiChange !== null && (
              <span className={`font-mono text-[10px] ${oiChange >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                {oiChange >= 0 ? '+' : ''}{oiChange.toFixed(1)}%
              </span>
            )}
            <span className="font-mono text-[var(--text-primary)] font-medium">
              {formatLargeNumber(openInterestValue)}
            </span>
          </div>
        </div>
        {openInterestHistory.length > 1 && (
          <div className="h-[52px] bg-[var(--background)]/50 rounded overflow-hidden">
            <svg
              viewBox={`0 0 100 ${oiChartHeight}`}
              preserveAspectRatio="none"
              className="w-full h-full"
              aria-label="Open Interest chart"
            >
              <defs>
                <linearGradient id="oiAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--info)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon
                fill="url(#oiAreaGrad)"
                points={`0,${oiChartHeight} ${oiPoints} 100,${oiChartHeight}`}
              />
              <polyline
                fill="none"
                stroke="var(--info)"
                strokeWidth="1.5"
                points={oiPoints}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Long/Short Ratio */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[var(--text-muted)]">Long/Short</span>
          <span className="font-mono text-[var(--text-primary)] font-medium">
            {globalLongShortRatio > 0 ? globalLongShortRatio.toFixed(2) : '--'}
          </span>
        </div>
        <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden flex">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${longPct || 50}%`, backgroundColor: 'var(--bull)' }}
          />
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${shortPct || 50}%`, backgroundColor: 'var(--bear)' }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[var(--bull)] text-[10px]">{longPct.toFixed(1)}% L</span>
          <span className="text-[var(--bear)] text-[10px]">{shortPct.toFixed(1)}% S</span>
        </div>
        {/* L/S Ratio history sparkline */}
        {longShortHistory.length > 1 && (
          <div className="h-[40px] mt-1.5 bg-[var(--background)]/50 rounded overflow-hidden">
            <svg
              viewBox={`0 0 100 ${lsChartHeight}`}
              preserveAspectRatio="none"
              className="w-full h-full"
              aria-label="Long/Short ratio chart"
            >
              <line x1="0" y1={lsChartHeight / 2} x2="100" y2={lsChartHeight / 2} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />
              <polyline
                fill="none"
                stroke={globalLongShortRatio >= 1 ? 'var(--bull)' : 'var(--bear)'}
                strokeWidth="1.5"
                points={lsPoints}
              />
            </svg>
          </div>
        )}
      </div>

      {/* Top Traders */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-muted)]">Top Traders L/S</span>
          <span className="font-mono text-[var(--text-primary)] font-medium">
            {topTraderLongShortRatio > 0 ? topTraderLongShortRatio.toFixed(2) : '--'}
          </span>
        </div>
      </div>

      {/* Liquidations */}
      <div
        className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5 transition-shadow duration-500"
        style={{
          boxShadow: recentLiqCount > 3
            ? '0 0 12px rgba(234,179,8,0.2), inset 0 0 12px rgba(234,179,8,0.05)'
            : 'none',
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[var(--text-muted)]">Liquidations</span>
          <span
            className={`font-mono text-[10px] ${recentLiqCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-dimmed)]'}`}
            style={{
              animation: recentLiqCount > 3 ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          >
            {recentLiqCount > 0 ? `${recentLiqCount} (1m)` : 'none'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[var(--text-dimmed)] text-[10px]">Shorts liq.</p>
            <p className="text-[var(--bull)] font-mono font-medium">
              {formatLargeNumber(recentLiqBuyVolume)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[var(--text-dimmed)] text-[10px]">Longs liq.</p>
            <p className="text-[var(--bear)] font-mono font-medium">
              {formatLargeNumber(recentLiqSellVolume)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
