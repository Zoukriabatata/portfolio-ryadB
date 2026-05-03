'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore, type ClosedTrade } from '@/stores/useTradingStore';
import type { TimeRange } from './TimeRangeTabs';

interface PerformanceMetricsProps {
  range: TimeRange;
}

/**
 * Extended performance stats card.
 * Computes from closedTrades filtered by the selected time range.
 */
export default function PerformanceMetrics({ range }: PerformanceMetricsProps) {
  const { closedTrades } = useTradingStore(
    useShallow(s => ({ closedTrades: s.closedTrades })),
  );

  const trades = useMemo(() => filterByRange(closedTrades, range), [closedTrades, range]);

  const stats = useMemo(() => computeStats(trades), [trades]);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Performance</h3>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {trades.length} trades
        </span>
      </div>

      {trades.length === 0 ? (
        <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
          No trades in this period yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <Metric label="Net P&L"        value={fmt(stats.netPnl)} color={stats.netPnl >= 0 ? 'success' : 'error'} bold />
          <Metric label="Win Rate"       value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W · ${stats.losses}L`} color={stats.winRate >= 50 ? 'success' : 'warning'} />
          <Metric label="Profit Factor"  value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)} color={stats.profitFactor >= 1.5 ? 'success' : stats.profitFactor >= 1 ? 'warning' : 'error'} />
          <Metric label="Avg Win"        value={fmt(stats.avgWin)}  color="success" />
          <Metric label="Avg Loss"       value={fmt(stats.avgLoss)} color="error" />
          <Metric label="Expectancy"     value={fmt(stats.expectancy)} color={stats.expectancy >= 0 ? 'success' : 'error'} sub="per trade" />
          <Metric label="Best Trade"     value={fmt(stats.bestTrade)}  color="success" sub={stats.bestSymbol ?? ''} />
          <Metric label="Worst Trade"    value={fmt(stats.worstTrade)} color="error"   sub={stats.worstSymbol ?? ''} />
          <Metric label="Avg Hold"       value={formatDuration(stats.avgHoldMs)} sub="time in market" />
        </div>
      )}
    </div>
  );
}

interface ComputedStats {
  netPnl:        number;
  wins:          number;
  losses:        number;
  winRate:       number;
  profitFactor:  number;
  avgWin:        number;
  avgLoss:       number;
  expectancy:    number;
  bestTrade:     number;
  bestSymbol:    string | null;
  worstTrade:    number;
  worstSymbol:   string | null;
  avgHoldMs:     number;
}

function computeStats(trades: ClosedTrade[]): ComputedStats {
  if (trades.length === 0) {
    return {
      netPnl: 0, wins: 0, losses: 0, winRate: 0,
      profitFactor: 0, avgWin: 0, avgLoss: 0,
      expectancy: 0,
      bestTrade: 0, bestSymbol: null,
      worstTrade: 0, worstSymbol: null,
      avgHoldMs: 0,
    };
  }

  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);

  const netPnl     = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin   = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss  = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate    = trades.length ? (wins.length / trades.length) * 100 : 0;
  const avgWin     = wins.length   ? grossWin / wins.length : 0;
  const avgLoss    = losses.length ? -grossLoss / losses.length : 0;
  const expectancy = (winRate / 100) * avgWin + ((100 - winRate) / 100) * avgLoss;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);

  let best = trades[0];
  let worst = trades[0];
  let totalHold = 0;
  for (const t of trades) {
    if (t.pnl > best.pnl)  best  = t;
    if (t.pnl < worst.pnl) worst = t;
    totalHold += Math.max(0, t.exitTime - t.entryTime);
  }

  return {
    netPnl,
    wins:   wins.length,
    losses: losses.length,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    expectancy,
    bestTrade:   best.pnl,
    bestSymbol:  best.symbol,
    worstTrade:  worst.pnl,
    worstSymbol: worst.symbol,
    avgHoldMs:   totalHold / trades.length,
  };
}

function filterByRange(trades: ClosedTrade[], range: TimeRange): ClosedTrade[] {
  if (range === 'all') return trades;

  const now = Date.now();
  let cutoff = 0;

  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    cutoff = d.getTime();
  } else if (range === 'week') {
    cutoff = now - 7 * 24 * 60 * 60 * 1000;
  } else if (range === 'month') {
    cutoff = now - 30 * 24 * 60 * 60 * 1000;
  }

  return trades.filter(t => t.exitTime >= cutoff);
}

function fmt(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${n === 0 ? '' : sign}$${Math.abs(n).toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000)        return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60)         return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60)         return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

function Metric({
  label, value, sub, color = 'default', bold,
}: {
  label:  string;
  value:  string;
  sub?:   string;
  color?: 'default' | 'success' | 'error' | 'warning';
  bold?:  boolean;
}) {
  const colorMap = {
    default: 'var(--text-primary)',
    success: '#10b981',
    error:   '#ef4444',
    warning: '#fbbf24',
  };

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className="tabular-nums leading-tight"
        style={{
          color:    colorMap[color],
          fontSize: bold ? '18px' : '14px',
          fontWeight: bold ? 700 : 600,
        }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-dimmed)' }}>{sub}</span>
      )}
    </div>
  );
}
