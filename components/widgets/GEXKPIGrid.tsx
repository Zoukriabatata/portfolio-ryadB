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
  const metrics = [
    'netGEX', 'netVEX', 'netCEX', 'netDEX',
    'zeroGammaLevel', 'callWall', 'putWall', 'gammaIntensity',
    'maxPain', 'impliedMove', 'netFlow', 'flowRatio', 'gexRatio',
    'callIV', 'putIV', 'ivSkew',
  ] as const;

  const stats = useMemo(() => {
    const s: Record<string, ReturnType<typeof history.getStats>> = {};
    for (const m of metrics) s[m] = history.getStats(m);
    return s;
  }, [history, metrics]);

  const sparklines = useMemo(() => {
    const s: Record<string, number[]> = {};
    for (const m of metrics) s[m] = history.getSparkline(m);
    return s;
  }, [history, metrics]);

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

      {/* Row 3: GEXStream Metrics */}
      <GEXMetricCard
        label="Net Flow"
        icon="$"
        value={summary.netFlow}
        format="gex"
        color={summary.netFlow >= 0 ? '#22c55e' : '#ef4444'}
        sparkline={sparklines.netFlow}
        stats={stats.netFlow}
        pulsing
        subtitle={summary.netFlow >= 0 ? 'Net call premium inflow' : 'Net put premium inflow'}
      />
      <GEXMetricCard
        label="Flow Ratio"
        icon="⇄"
        value={summary.flowRatio}
        format="ratio"
        color={summary.flowRatio >= 1 ? '#22c55e' : '#ef4444'}
        sparkline={sparklines.flowRatio}
        stats={stats.flowRatio}
        subtitle={summary.flowRatio >= 1.2 ? 'Call volume dominant' : summary.flowRatio <= 0.8 ? 'Put volume dominant' : 'Balanced flow'}
      />
      <GEXMetricCard
        label="GEX Ratio"
        icon="⚖"
        value={summary.gexRatio}
        format="ratio"
        color={summary.gexRatio >= 1 ? '#22c55e' : '#ef4444'}
        sparkline={sparklines.gexRatio}
        stats={stats.gexRatio}
        subtitle={`|Call GEX / Put GEX|`}
      />
      <GEXMetricCard
        label="IV Skew"
        icon="∿"
        value={summary.ivSkew}
        format="ratio"
        color={summary.ivSkew > 3 ? '#ef4444' : summary.ivSkew < -1 ? '#22c55e' : '#eab308'}
        sparkline={sparklines.ivSkew}
        stats={stats.ivSkew}
        subtitle={summary.ivSkew > 3 ? 'Put premium (fear)' : summary.ivSkew < -1 ? 'Call premium (greed)' : 'Neutral skew'}
      />

      {/* Row 4: Levels & IV */}
      <GEXMetricCard
        label="Call IV"
        icon="C"
        value={summary.callIV * 100}
        format="percent"
        color="#22c55e"
        sparkline={sparklines.callIV?.map((v: number) => v * 100)}
        stats={stats.callIV}
        subtitle="ATM call implied vol"
      />
      <GEXMetricCard
        label="Put IV"
        icon="P"
        value={summary.putIV * 100}
        format="percent"
        color="#ef4444"
        sparkline={sparklines.putIV?.map((v: number) => v * 100)}
        stats={stats.putIV}
        subtitle="ATM put implied vol"
      />
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
        subtitle={`±${spotPrice > 0 ? (summary.impliedMove / spotPrice * 100).toFixed(1) : '0'}%`}
      />

      {/* Row 5: OI & Regime */}
      <GEXMetricCard
        label="Call/Put OI"
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
