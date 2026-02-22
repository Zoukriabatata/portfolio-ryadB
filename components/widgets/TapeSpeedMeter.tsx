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
        return '#22c55e';     // Green
      case 'normal':
        return '#eab308';     // Yellow
      case 'fast':
        return '#f97316';     // Orange
      case 'aggressive':
        return '#ef4444';     // Red
      default:
        return '#6b7280';
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
        <span className="text-gray-400">
          {stats.tradesPerSecond.toFixed(0)}/s
        </span>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0e14] border border-[#1e2430] rounded p-2 text-xs min-w-[140px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 font-medium">TAPE SPEED</span>
        {stats.stopRunDetected && (
          <span className="text-red-500 font-bold animate-pulse">
            STOP RUN {stats.stopRunSide === 'buy' ? '↑' : '↓'}
          </span>
        )}
      </div>

      {/* Velocity bar */}
      <div className="relative h-4 bg-[#1a1f2e] rounded overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-200"
          style={{
            width: `${velocityPercent}%`,
            backgroundColor: velocityColor,
          }}
        />
        <div className="absolute inset-0 flex items-center justify-end pr-2">
          <span className="text-white font-mono text-xs">
            {stats.tradesPerSecond.toFixed(0)}/s
          </span>
        </div>
      </div>

      {/* Buy/Sell pressure */}
      <div className="space-y-1">
        {/* Buy pressure */}
        <div className="flex items-center gap-1">
          <span className="text-cyan-400 w-8">BUY</span>
          <div className="flex-1 h-2 bg-[#1a1f2e] rounded overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-200"
              style={{ width: `${buyPressurePercent}%` }}
            />
          </div>
          <span className="text-gray-400 w-8 text-right">
            {buyPressurePercent.toFixed(0)}%
          </span>
        </div>

        {/* Sell pressure */}
        <div className="flex items-center gap-1">
          <span className="text-red-400 w-8">SELL</span>
          <div className="flex-1 h-2 bg-[#1a1f2e] rounded overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-200"
              style={{ width: `${sellPressurePercent}%` }}
            />
          </div>
          <span className="text-gray-400 w-8 text-right">
            {sellPressurePercent.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Momentum indicator */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-gray-500">Momentum</span>
        <span
          className={`font-medium ${
            stats.momentum === 'bullish'
              ? 'text-green-400'
              : stats.momentum === 'bearish'
              ? 'text-red-400'
              : 'text-gray-400'
          }`}
        >
          {stats.momentum.toUpperCase()}
        </span>
      </div>

      {/* Volume info */}
      <div className="mt-1 flex items-center justify-between text-gray-500">
        <span>Vol</span>
        <span>
          <span className="text-cyan-400">{formatVolume(stats.recentBuyVolume)}</span>
          {' / '}
          <span className="text-red-400">{formatVolume(stats.recentSellVolume)}</span>
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
        font-bold text-white
        animate-pulse
        ${side === 'buy' ? 'bg-green-600' : 'bg-red-600'}
      `}
    >
      🚨 STOP RUN {side === 'buy' ? '↑ LONGS' : '↓ SHORTS'}
    </div>
  );
}
