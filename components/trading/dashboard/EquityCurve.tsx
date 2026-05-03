'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';

/**
 * Equity curve sparkline — derived from closed trades chronologically.
 * Pure SVG, no chart lib needed for this size.
 */
export default function EquityCurve() {
  const { connections, activeBroker, closedTrades } = useTradingStore(
    useShallow(s => ({
      connections:  s.connections,
      activeBroker: s.activeBroker,
      closedTrades: s.closedTrades,
    })),
  );

  const broker  = activeBroker ?? 'demo';
  const balance = connections[broker]?.balance ?? 0;

  // Reconstruct equity curve from current balance backwards through trades
  const points = useMemo(() => {
    const sorted = [...closedTrades].sort((a, b) => a.exitTime - b.exitTime);
    if (sorted.length === 0) return [{ x: 0, y: balance }];

    // Starting equity = balance - sum(pnl) (since each trade's pnl was already applied)
    const totalPnl = sorted.reduce((s, t) => s + t.pnl, 0);
    const startEquity = balance - totalPnl;

    let running = startEquity;
    const pts: { x: number; y: number; t: number }[] = [{ x: 0, y: running, t: sorted[0].entryTime }];

    sorted.forEach((trade, i) => {
      running += trade.pnl;
      pts.push({ x: i + 1, y: running, t: trade.exitTime });
    });

    return pts;
  }, [closedTrades, balance]);

  const { path, areaPath, min, max, isProfitable } = useMemo(() => {
    const n = points.length;
    if (n < 2) {
      return { path: '', areaPath: '', min: 0, max: 0, isProfitable: true };
    }

    const ys = points.map(p => p.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const range = hi - lo || 1;

    const w = 100;
    const h = 30;
    const xStep = w / (n - 1);

    const coords = points.map((p, i) => ({
      x: i * xStep,
      y: h - ((p.y - lo) / range) * h,
    }));

    const lineD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
    const areaD = `${lineD} L${w},${h} L0,${h} Z`;
    const profitable = points[n - 1].y >= points[0].y;

    return { path: lineD, areaPath: areaD, min: lo, max: hi, isProfitable: profitable };
  }, [points]);

  const lineColor = isProfitable ? '#10b981' : '#ef4444';
  const areaFill  = isProfitable ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Equity Curve
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-right text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {points.length > 1 ? (
            <>
              <div>High: ${max.toFixed(0)}</div>
              <div>Low: ${min.toFixed(0)}</div>
              <div>{points.length - 1} trades</div>
            </>
          ) : (
            <div>No trade history yet</div>
          )}
        </div>
      </div>

      {points.length >= 2 ? (
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-20">
          <path d={areaPath} fill={areaFill} />
          <path d={path} fill="none" stroke={lineColor} strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <div
          className="w-full h-20 flex items-center justify-center text-[11px] rounded"
          style={{ color: 'var(--text-dimmed)', background: 'var(--surface-elevated)' }}
        >
          Close at least 2 trades to see your equity curve
        </div>
      )}
    </div>
  );
}
