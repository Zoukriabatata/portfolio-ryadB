'use client';

import { useMemo } from 'react';
import { GEXMetricCard } from './GEXMetricCard';
import type { MultiGreekSummary } from '@/types/options';
import type { GEXHistoryBuffer } from '@/lib/calculations/gexHistory';

interface GEXKPIGridProps {
  summary: MultiGreekSummary;
  spotPrice: number;
  history: GEXHistoryBuffer;
  totalCallOI?: number;
  totalPutOI?: number;
}

export function GEXKPIGrid({ summary, spotPrice, history, totalCallOI = 0, totalPutOI = 0 }: GEXKPIGridProps) {
  const stats = useMemo(() => ({
    netGEX: history.getStats('netGEX'),
    netVEX: history.getStats('netVEX'),
    netCEX: history.getStats('netCEX'),
    netDEX: history.getStats('netDEX'),
    zeroGammaLevel: history.getStats('zeroGammaLevel'),
    callWall: history.getStats('callWall'),
    putWall: history.getStats('putWall'),
    gammaIntensity: history.getStats('gammaIntensity'),
    maxPain: history.getStats('maxPain'),
    impliedMove: history.getStats('impliedMove'),
  }), [history]);

  const sparklines = useMemo(() => ({
    netGEX: history.getSparkline('netGEX'),
    netVEX: history.getSparkline('netVEX'),
    netCEX: history.getSparkline('netCEX'),
    netDEX: history.getSparkline('netDEX'),
    gammaIntensity: history.getSparkline('gammaIntensity'),
    zeroGammaLevel: history.getSparkline('zeroGammaLevel'),
    callWall: history.getSparkline('callWall'),
    putWall: history.getSparkline('putWall'),
    maxPain: history.getSparkline('maxPain'),
    impliedMove: history.getSparkline('impliedMove'),
  }), [history]);

  const callPutRatio = totalPutOI > 0 ? totalCallOI / totalPutOI : 0;
  const totalOI = totalCallOI + totalPutOI;

  const distanceToZeroGamma = spotPrice > 0
    ? ((spotPrice - summary.zeroGammaLevel) / spotPrice * 100)
    : 0;
  const distanceToCallWall = spotPrice > 0
    ? ((summary.callWall - spotPrice) / spotPrice * 100)
    : 0;
  const distanceToPutWall = spotPrice > 0
    ? ((spotPrice - summary.putWall) / spotPrice * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {/* Row 1: Multi-Greek Exposures */}
      <GEXMetricCard
        label="Net GEX"
        icon="Γ"
        value={summary.netGEX}
        format="gex"
        color="#22c55e"
        sparkline={sparklines.netGEX}
        stats={stats.netGEX}
        pulsing
        subtitle={summary.regime === 'positive' ? 'Dealers long gamma' : 'Dealers short gamma'}
      />
      <GEXMetricCard
        label="Net VEX"
        icon="ν"
        value={summary.netVEX}
        format="gex"
        color="#8b5cf6"
        sparkline={sparklines.netVEX}
        stats={stats.netVEX}
        pulsing
        subtitle={summary.netVEX >= 0 ? 'Vol drop → buy pressure' : 'Vol drop → sell pressure'}
      />
      <GEXMetricCard
        label="Net CEX"
        icon="θ"
        value={summary.netCEX}
        format="gex"
        color="#f59e0b"
        sparkline={sparklines.netCEX}
        stats={stats.netCEX}
        pulsing
        subtitle={summary.netCEX >= 0 ? 'Time decay → buy pressure' : 'Time decay → sell pressure'}
      />
      <GEXMetricCard
        label="Net DEX"
        icon="Δ"
        value={summary.netDEX}
        format="gex"
        color="#3b82f6"
        sparkline={sparklines.netDEX}
        stats={stats.netDEX}
        pulsing
        subtitle={summary.netDEX >= 0 ? 'Net long exposure' : 'Net short exposure'}
      />

      {/* Row 2: Key Levels */}
      <GEXMetricCard
        label="Regime"
        value={summary.gammaIntensity}
        format="percent"
        color={summary.regime === 'positive' ? '#22c55e' : '#ef4444'}
        sparkline={sparklines.gammaIntensity}
        stats={stats.gammaIntensity}
        icon={summary.regime === 'positive' ? '+' : '-'}
        subtitle={`${summary.regime === 'positive' ? 'Positive' : 'Negative'} gamma`}
      />
      <GEXMetricCard
        label="Zero Gamma"
        value={summary.zeroGammaLevel}
        format="price"
        color="#eab308"
        sparkline={sparklines.zeroGammaLevel}
        stats={stats.zeroGammaLevel}
        subtitle={`${distanceToZeroGamma >= 0 ? '+' : ''}${distanceToZeroGamma.toFixed(1)}% from spot`}
      />
      <GEXMetricCard
        label="Call Wall"
        value={summary.callWall}
        format="price"
        color="#10b981"
        sparkline={sparklines.callWall}
        stats={stats.callWall}
        subtitle={`+${distanceToCallWall.toFixed(1)}% above spot`}
      />
      <GEXMetricCard
        label="Put Wall"
        value={summary.putWall}
        format="price"
        color="#f43f5e"
        sparkline={sparklines.putWall}
        stats={stats.putWall}
        subtitle={`-${distanceToPutWall.toFixed(1)}% below spot`}
      />

      {/* Row 3: Advanced Metrics */}
      <GEXMetricCard
        label="Max Pain"
        value={summary.maxPain}
        format="price"
        color="#a78bfa"
        sparkline={sparklines.maxPain}
        stats={stats.maxPain}
        subtitle="Expiration magnet"
      />
      <GEXMetricCard
        label="Implied Move"
        value={summary.impliedMove}
        format="price"
        color="#06b6d4"
        sparkline={sparklines.impliedMove}
        stats={stats.impliedMove}
        subtitle={`±${spotPrice > 0 ? (summary.impliedMove / spotPrice * 100).toFixed(1) : '0'}% (7d)`}
      />
      <GEXMetricCard
        label="Call/Put Ratio"
        value={callPutRatio}
        format="ratio"
        color={callPutRatio >= 1 ? '#22c55e' : '#ef4444'}
        subtitle={callPutRatio >= 1 ? 'Call heavy' : 'Put heavy'}
      />
      <GEXMetricCard
        label="Total OI"
        value={totalOI}
        format="number"
        color="#64748b"
        subtitle={`C: ${(totalCallOI / 1000).toFixed(0)}K / P: ${(totalPutOI / 1000).toFixed(0)}K`}
      />
    </div>
  );
}
