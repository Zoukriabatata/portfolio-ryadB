'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';

/**
 * AccountCard — Topstep / TradingView-style account summary.
 *
 * Shows: balance, equity (balance + unrealized P&L), day P&L, total P&L,
 * win rate, open positions count, and pending orders count.
 *
 * All values derive live from the trading store — no extra polling needed.
 */
export default function AccountCard() {
  const { connections, activeBroker, positions, closedTrades } = useTradingStore(
    useShallow(s => ({
      connections:   s.connections,
      activeBroker:  s.activeBroker,
      positions:     s.positions,
      closedTrades:  s.closedTrades,
    })),
  );

  const broker  = activeBroker ?? 'demo';
  const balance = connections[broker]?.balance ?? 0;

  // Unrealized P&L from open positions
  const unrealized = useMemo(
    () => positions.reduce((sum, p) => sum + p.pnl, 0),
    [positions],
  );

  // Equity = balance + unrealized
  const equity = balance + unrealized;

  // Today's realized P&L (closed trades that exited today)
  const dayPnl = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return closedTrades
      .filter(t => t.exitTime >= startMs)
      .reduce((sum, t) => sum + t.pnl, 0);
  }, [closedTrades]);

  // Total realized P&L across all closed trades
  const totalPnl = useMemo(
    () => closedTrades.reduce((sum, t) => sum + t.pnl, 0),
    [closedTrades],
  );

  // Win rate
  const { wins, losses, winRate } = useMemo(() => {
    const w = closedTrades.filter(t => t.pnl > 0).length;
    const l = closedTrades.filter(t => t.pnl < 0).length;
    const total = w + l;
    return {
      wins:    w,
      losses:  l,
      winRate: total > 0 ? (w / total) * 100 : 0,
    };
  }, [closedTrades]);

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4 rounded-xl"
      style={{
        background: 'var(--surface)',
        border:     '1px solid var(--border)',
      }}
    >
      <Stat label="Account Balance"  value={fmt(balance)}    color="primary" />
      <Stat label="Equity"           value={fmt(equity)}     color={unrealized >= 0 ? 'success' : 'error'} sub={unrealized !== 0 ? `${unrealized >= 0 ? '+' : ''}${fmt(unrealized, false)} unrealized` : 'no open positions'} />
      <Stat label="Day P&L"          value={`${dayPnl >= 0 ? '+' : ''}${fmt(dayPnl, false)}`}   color={dayPnl >= 0 ? 'success' : 'error'} />
      <Stat label="Total P&L"        value={`${totalPnl >= 0 ? '+' : ''}${fmt(totalPnl, false)}`} color={totalPnl >= 0 ? 'success' : 'error'} />
      <Stat label="Win Rate"         value={`${winRate.toFixed(1)}%`} sub={`${wins}W · ${losses}L`} color={winRate >= 50 ? 'success' : winRate > 0 ? 'warning' : 'muted'} />
      <Stat label="Open Positions"   value={positions.length.toString()} sub={positions.length > 0 ? positions.map(p => p.symbol).join(', ') : 'flat'} />
    </div>
  );
}

function fmt(n: number, prefix = true): string {
  const sign  = prefix ? '$' : '$';
  const abs   = Math.abs(n);
  const value = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${sign}${value}` : `${sign}${value}`;
}

function Stat({
  label,
  value,
  sub,
  color = 'default',
}: {
  label: string;
  value: string;
  sub?:  string;
  color?: 'default' | 'success' | 'error' | 'warning' | 'primary' | 'muted';
}) {
  const colorMap = {
    default: 'var(--text-primary)',
    success: '#10b981',
    error:   '#ef4444',
    warning: '#fbbf24',
    primary: 'var(--text-primary)',
    muted:   'var(--text-muted)',
  };

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-lg font-bold tabular-nums leading-tight" style={{ color: colorMap[color] }}>
        {value}
      </span>
      {sub && (
        <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-dimmed)' }}>
          {sub}
        </span>
      )}
    </div>
  );
}
