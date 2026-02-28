'use client';

/**
 * LIQUIDITY & POSITIONING — OI, L/S, Liquidations, Squeeze Detection
 */

import { useMemo } from 'react';
import { formatVolumeDollar } from '@/lib/utils/formatters';
import type { PositioningReading, SqueezeRisk } from '@/lib/calculations/futures/positioning';
import type { LiquidationEvent } from '@/types/futures';

interface LiquidityPositioningProps {
  openInterestValue: number;
  openInterestHistory: Array<{ time: number; value: number }>;
  globalLongShortRatio: number;
  globalLongAccount: number;
  globalShortAccount: number;
  topTraderLongShortRatio: number;
  longShortHistory: Array<{ time: number; ratio: number }>;
  liquidations: LiquidationEvent[];
  recentLiqBuyVolume: number;
  recentLiqSellVolume: number;
  positioning: PositioningReading;
  squeezeDirection: 'long' | 'short' | 'none';
  squeezeRisk: SqueezeRisk;
}

const POSITIONING_LABELS: Record<PositioningReading, { label: string; color: string; description: string }> = {
  'build-up': { label: 'Long Build-up', color: '#22c55e', description: 'OI ↑ + Price ↑' },
  'short-build-up': { label: 'Short Build-up', color: '#ef4444', description: 'OI ↑ + Price ↓' },
  'long-squeeze': { label: 'Long Squeeze', color: '#dc2626', description: 'OI ↓ + Price ↓' },
  'short-squeeze': { label: 'Short Squeeze', color: '#16a34a', description: 'OI ↓ + Price ↑' },
  'short-covering': { label: 'Short Covering', color: '#22d3ee', description: 'OI ↓ + Price ↑' },
  'neutral': { label: 'Neutral', color: '#6b7280', description: 'No clear signal' },
};

const SQUEEZE_COLORS: Record<SqueezeRisk, string> = {
  none: '#6b7280',
  low: '#22c55e',
  moderate: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

export default function LiquidityPositioning({
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
  positioning,
  squeezeDirection,
  squeezeRisk,
}: LiquidityPositioningProps) {
  const longPct = globalLongAccount * 100;
  const shortPct = globalShortAccount * 100;
  const posInfo = POSITIONING_LABELS[positioning];

  // OI change
  const oiChange = useMemo(() => {
    if (openInterestHistory.length < 2) return null;
    const first = openInterestHistory[0].value;
    const last = openInterestHistory[openInterestHistory.length - 1].value;
    return first > 0 ? ((last - first) / first) * 100 : null;
  }, [openInterestHistory]);

  // OI sparkline
  const oiChartHeight = 40;
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

  // L/S sparkline
  const lsChartHeight = 30;
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

  const recentLiqCount = useMemo(() => {
    return liquidations.filter(l => Date.now() - l.time < 60_000).length;
  }, [liquidations]);

  return (
    <div className="space-y-2">
      {/* Positioning reading badge */}
      <div
        className="flex items-center justify-between py-1.5 px-2.5 rounded-lg"
        style={{ backgroundColor: `${posInfo.color}10`, border: `1px solid ${posInfo.color}25` }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: posInfo.color }} />
          <span className="text-[11px] font-semibold" style={{ color: posInfo.color }}>
            {posInfo.label}
          </span>
        </div>
        <span className="text-[9px] text-[var(--text-dimmed)]">{posInfo.description}</span>
      </div>

      {/* Open Interest */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Open Interest</span>
          <div className="flex items-center gap-1.5">
            {oiChange !== null && (
              <span className={`font-mono text-[10px] ${oiChange >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}`}>
                {oiChange >= 0 ? '+' : ''}{oiChange.toFixed(1)}%
              </span>
            )}
            <span className="font-mono text-xs text-[var(--text-primary)] font-medium">
              {openInterestValue > 0 ? formatVolumeDollar(openInterestValue) : '--'}
            </span>
          </div>
        </div>
        {openInterestHistory.length > 1 && (
          <div className="h-[40px] bg-[var(--background)]/50 rounded overflow-hidden">
            <svg viewBox={`0 0 100 ${oiChartHeight}`} preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id="oiGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--info)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon fill="url(#oiGrad2)" points={`0,${oiChartHeight} ${oiPoints} 100,${oiChartHeight}`} />
              <polyline fill="none" stroke="var(--info)" strokeWidth="1.5" points={oiPoints} />
            </svg>
          </div>
        )}
      </div>

      {/* Long/Short Ratio */}
      <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Long/Short</span>
          <span className="font-mono text-xs text-[var(--text-primary)] font-medium">
            {globalLongShortRatio > 0 ? globalLongShortRatio.toFixed(2) : '--'}
          </span>
        </div>
        <div className="h-1.5 bg-[var(--background)] rounded-full overflow-hidden flex">
          <div className="h-full transition-all duration-500" style={{ width: `${longPct || 50}%`, backgroundColor: 'var(--bull)' }} />
          <div className="h-full transition-all duration-500" style={{ width: `${shortPct || 50}%`, backgroundColor: 'var(--bear)' }} />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[var(--bull)] text-[10px]">{longPct.toFixed(1)}% L</span>
          <span className="text-[var(--bear)] text-[10px]">{shortPct.toFixed(1)}% S</span>
        </div>

        {/* Top traders */}
        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--border)]/30">
          <span className="text-[9px] text-[var(--text-dimmed)]">Top Traders</span>
          <span className="font-mono text-[10px] text-[var(--text-secondary)]">
            {topTraderLongShortRatio > 0 ? topTraderLongShortRatio.toFixed(2) : '--'}
          </span>
        </div>

        {/* L/S sparkline */}
        {longShortHistory.length > 1 && (
          <div className="h-[30px] mt-1.5 bg-[var(--background)]/50 rounded overflow-hidden">
            <svg viewBox={`0 0 100 ${lsChartHeight}`} preserveAspectRatio="none" className="w-full h-full">
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

      {/* Squeeze Detection */}
      {squeezeRisk !== 'none' && (
        <div
          className="flex items-center justify-between py-1.5 px-2.5 rounded-lg"
          style={{
            backgroundColor: `${SQUEEZE_COLORS[squeezeRisk]}10`,
            border: `1px solid ${SQUEEZE_COLORS[squeezeRisk]}30`,
          }}
        >
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SQUEEZE_COLORS[squeezeRisk]} strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="text-[10px] font-semibold uppercase" style={{ color: SQUEEZE_COLORS[squeezeRisk] }}>
              {squeezeDirection === 'short' ? 'Short' : 'Long'} Squeeze Risk
            </span>
          </div>
          <span className="text-[10px] font-semibold uppercase" style={{ color: SQUEEZE_COLORS[squeezeRisk] }}>
            {squeezeRisk}
          </span>
        </div>
      )}

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
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Liquidations</span>
          <span
            className={`font-mono text-[10px] ${recentLiqCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-dimmed)]'}`}
            style={{ animation: recentLiqCount > 3 ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
          >
            {recentLiqCount > 0 ? `${recentLiqCount} (1m)` : 'none'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[var(--text-dimmed)] text-[9px]">Shorts liq.</p>
            <p className="text-[var(--bull)] font-mono text-xs font-medium">
              {recentLiqBuyVolume > 0 ? formatVolumeDollar(recentLiqBuyVolume) : '--'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[var(--text-dimmed)] text-[9px]">Longs liq.</p>
            <p className="text-[var(--bear)] font-mono text-xs font-medium">
              {recentLiqSellVolume > 0 ? formatVolumeDollar(recentLiqSellVolume) : '--'}
            </p>
          </div>
        </div>

        {/* Last 5 liquidation events */}
        {liquidations.length > 0 && (
          <div className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto custom-scrollbar">
            {liquidations.slice(-5).reverse().map((liq, i) => {
              const isShortLiq = liq.side === 'BUY';
              const timeStr = new Date(liq.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={`${liq.time}-${i}`}
                  className="flex items-center gap-1 text-[10px] py-0.5 px-1 rounded"
                  style={{ background: i === 0 ? (isShortLiq ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') : 'transparent' }}>
                  <span style={{ fontWeight: 600, color: isShortLiq ? 'var(--bull)' : 'var(--bear)' }}>
                    {isShortLiq ? 'SHORT' : 'LONG'}
                  </span>
                  <span className="font-mono text-[var(--text-secondary)] flex-1">
                    {formatVolumeDollar(liq.quantity * liq.averagePrice)}
                  </span>
                  <span className="text-[var(--text-dimmed)]">{timeStr}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
