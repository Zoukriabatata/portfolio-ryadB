'use client';

import React, { useMemo, memo } from 'react';
import type { TapeVelocityStats } from '@/lib/heatmap/analytics/TapeVelocityEngine';
import { formatVolume } from '@/lib/utils/formatters';

interface TapeSpeedMeterProps {
  stats: TapeVelocityStats;
  compact?: boolean;
}

/**
 * TAPE SPEED METER
 *
 * Visual indicator for tape (trade flow) velocity and pressure.
 * Shows:
 * - Trades per second (tape speed)
 * - Buy/Sell pressure bars
 * - Stop run alert
 */
export const TapeSpeedMeter = memo(function TapeSpeedMeter({ stats, compact = false }: TapeSpeedMeterProps) {
  const velocityPercent = useMemo(() => {
    // Map 0-100 trades/s to 0-100%
    return Math.min(100, stats.tradesPerSecond * 2);
  }, [stats.tradesPerSecond]);

  const velocityColor = useMemo(() => {
    switch (stats.velocity) {
      case 'slow':
        return 'var(--bull)';
      case 'normal':
        return 'var(--warning)';
      case 'fast':
        return 'var(--warning-dark, #f97316)';
      case 'aggressive':
        return 'var(--bear)';
      default:
        return 'var(--text-dimmed)';
    }
  }, [stats.velocity]);

  const buyPressurePercent = stats.buyPressure * 100;
  const sellPressurePercent = stats.sellPressure * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: velocityColor }}
        />
        <span style={{ color: 'var(--text-muted)' }}>
          {stats.tradesPerSecond.toFixed(0)}/s
        </span>
      </div>
    );
  }

  return (
    <div className="rounded p-2 text-xs min-w-[140px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium" style={{ color: 'var(--text-muted)' }}>TAPE SPEED</span>
        {stats.stopRunDetected && (
          <span className="font-bold animate-pulse" style={{ color: 'var(--bear)' }}>
            STOP RUN {stats.stopRunSide === 'buy' ? '↑' : '↓'}
          </span>
        )}
      </div>

      {/* Velocity bar */}
      <div className="relative h-4 rounded overflow-hidden mb-2" style={{ background: 'var(--surface-elevated)' }}>
        <div
          className="absolute inset-y-0 left-0 transition-all duration-200"
          style={{
            width: `${velocityPercent}%`,
            backgroundColor: velocityColor,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-end pr-2">
          <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
            {stats.tradesPerSecond.toFixed(0)}/s
          </span>
        </div>
      </div>

      {/* Buy/Sell pressure */}
      <div className="space-y-1">
        {/* Buy pressure */}
        <div className="flex items-center gap-1">
          <span className="w-8" style={{ color: 'var(--bull)' }}>BUY</span>
          <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
            <div
              className="h-full transition-all duration-200"
              style={{ background: 'var(--bull)', width: `${buyPressurePercent}%` }}
            />
          </div>
          <span className="w-8 text-right" style={{ color: 'var(--text-muted)' }}>
            {buyPressurePercent.toFixed(0)}%
          </span>
        </div>

        {/* Sell pressure */}
        <div className="flex items-center gap-1">
          <span className="w-8" style={{ color: 'var(--bear)' }}>SELL</span>
          <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
            <div
              className="h-full transition-all duration-200"
              style={{ background: 'var(--bear)', width: `${sellPressurePercent}%` }}
            />
          </div>
          <span className="w-8 text-right" style={{ color: 'var(--text-muted)' }}>
            {sellPressurePercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Momentum indicator */}
      <div className="mt-2 flex items-center justify-between">
        <span style={{ color: 'var(--text-dimmed)' }}>Momentum</span>
        <span
          className="font-medium"
          style={{ color: stats.momentum === 'bullish' ? 'var(--bull)' : stats.momentum === 'bearish' ? 'var(--bear)' : 'var(--text-muted)' }}
        >
          {stats.momentum.toUpperCase()}
        </span>
      </div>

      {/* Volume info */}
      <div className="mt-1 flex items-center justify-between" style={{ color: 'var(--text-dimmed)' }}>
        <span>Vol</span>
        <span>
          <span style={{ color: 'var(--bull)' }}>{formatVolume(stats.recentBuyVolume)}</span>
          {' / '}
          <span style={{ color: 'var(--bear)' }}>{formatVolume(stats.recentSellVolume)}</span>
        </span>
      </div>
    </div>
  );
});

/**
 * Stop Run Alert - Flash component for stop runs
 */
interface StopRunAlertProps {
  detected: boolean;
  side?: 'buy' | 'sell';
}

export function StopRunAlert({ detected, side }: StopRunAlertProps) {
  if (!detected) return null;

  return (
    <div
      className={`
        fixed top-4 right-4 z-50
        px-4 py-2 rounded
        font-bold animate-pulse
        ${side === 'buy' ? 'bg-[var(--bull)]' : 'bg-[var(--bear)]'}
      `}
    >
      🚨 STOP RUN {side === 'buy' ? '↑ LONGS' : '↓ SHORTS'}
    </div>
  );
}
