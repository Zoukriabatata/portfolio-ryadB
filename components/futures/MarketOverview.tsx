'use client';

/**
 * MARKET OVERVIEW — Header stratégique
 *
 * Mark/Index price, basis, variation, volatility, regime, risk temperature.
 */

import { useMemo } from 'react';
import { formatPrice, formatVolumeDollar } from '@/lib/utils/formatters';
import type { MarketRegime, RiskTemperature } from '@/lib/calculations/futures/marketRegime';

interface MarketOverviewProps {
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  nextFundingTime: number;
  volatility: number;
  regime: MarketRegime;
  riskTemperature: RiskTemperature;
}

const REGIME_LABELS: Record<MarketRegime, { label: string; color: string }> = {
  trending: { label: 'Trending', color: '#3b82f6' },
  range: { label: 'Range', color: '#8b5cf6' },
  expansion: { label: 'Expansion', color: '#f59e0b' },
  compression: { label: 'Compression', color: '#6b7280' },
};

const RISK_LABELS: Record<RiskTemperature, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  moderate: { label: 'Moderate', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  high: { label: 'High', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  extreme: { label: 'Extreme', color: '#dc2626', bg: 'rgba(220,38,38,0.15)' },
};

export default function MarketOverview({
  markPrice,
  indexPrice,
  fundingRate,
  nextFundingTime,
  volatility,
  regime,
  riskTemperature,
}: MarketOverviewProps) {
  const basis = markPrice > 0 && indexPrice > 0 ? markPrice - indexPrice : 0;
  const basisPct = indexPrice > 0 ? (basis / indexPrice) * 100 : 0;
  const annualized = fundingRate * 3 * 365 * 100;

  const fundingCountdown = useMemo(() => {
    if (nextFundingTime === 0) return '--';
    const diff = nextFundingTime - Date.now();
    if (diff <= 0) return 'Now';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [nextFundingTime]);

  const fundingPct = (fundingRate * 100).toFixed(4);
  const fundingColor = fundingRate > 0.0001 ? 'var(--bull)' : fundingRate < -0.0001 ? 'var(--bear)' : 'var(--text-muted)';

  const regimeInfo = REGIME_LABELS[regime];
  const riskInfo = RISK_LABELS[riskTemperature];

  return (
    <div className="space-y-2">
      {/* Price Header */}
      <div className="text-center py-1">
        <p className="text-[10px] text-[var(--text-dimmed)] uppercase tracking-wider">Mark Price</p>
        <p className="text-lg font-mono font-bold text-[var(--text-primary)] leading-tight">
          {markPrice > 0 ? formatPrice(markPrice) : '--'}
        </p>
        <p className="text-[10px] text-[var(--text-dimmed)]">
          Index: {indexPrice > 0 ? formatPrice(indexPrice) : '--'}
        </p>
      </div>

      {/* Basis + Funding Row */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* Basis */}
        <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2">
          <p className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider mb-0.5">Basis</p>
          <p className="font-mono text-xs font-semibold" style={{ color: basisPct >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
            {basis !== 0 ? `${basisPct >= 0 ? '+' : ''}${basisPct.toFixed(4)}%` : '--'}
          </p>
        </div>

        {/* Funding */}
        <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2">
          <p className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider mb-0.5">Funding</p>
          <p className="font-mono text-xs font-semibold" style={{ color: fundingColor }}>
            {fundingRate !== 0 ? `${fundingRate >= 0 ? '+' : ''}${fundingPct}%` : '--'}
          </p>
        </div>
      </div>

      {/* Funding details */}
      {fundingRate !== 0 && (
        <div className="bg-[var(--surface-elevated)]/50 rounded-lg p-2">
          {/* Visual bar */}
          <div className="h-1 bg-[var(--background)] rounded-full overflow-hidden relative mb-1.5">
            <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
            <div
              className="absolute inset-y-0 rounded-full transition-all duration-500"
              style={{
                left: fundingRate >= 0 ? '50%' : undefined,
                right: fundingRate < 0 ? '50%' : undefined,
                width: `${Math.min(Math.abs(fundingRate) * 10000, 50)}%`,
                backgroundColor: fundingColor,
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-dimmed)]">Next: {fundingCountdown}</span>
            <span className="font-mono text-[10px]" style={{ color: annualized >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
              {annualized >= 0 ? '+' : ''}{annualized.toFixed(1)}% ann.
            </span>
          </div>
        </div>
      )}

      {/* Regime + Risk Row */}
      <div className="flex items-center gap-1.5">
        <div
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: `${regimeInfo.color}15`, color: regimeInfo.color }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: regimeInfo.color }} />
          {regimeInfo.label}
        </div>
        <div
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: riskInfo.bg, color: riskInfo.color }}
        >
          Risk: {riskInfo.label}
        </div>
      </div>

      {/* Volatility bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-[var(--text-dimmed)] uppercase tracking-wider w-8">Vol</span>
        <div className="flex-1 h-1 bg-[var(--background)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(volatility * 20, 100)}%`,
              backgroundColor: volatility > 3 ? 'var(--bear)' : volatility > 1.5 ? 'var(--warning)' : 'var(--bull)',
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-[var(--text-secondary)] w-10 text-right">
          {volatility.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
