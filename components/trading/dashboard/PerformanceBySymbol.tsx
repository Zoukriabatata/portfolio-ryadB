'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore, type ClosedTrade } from '@/stores/useTradingStore';
import type { TimeRange } from './TimeRangeTabs';

interface Props {
  range: TimeRange;
}

interface SymbolStat {
  symbol:   string;
  trades:   number;
  netPnl:   number;
  winRate:  number;
}

/**
 * P&L breakdown grouped by symbol — sortable horizontal bar chart.
 */
export default function PerformanceBySymbol({ range }: Props) {
  const { closedTrades } = useTradingStore(
    useShallow(s => ({ closedTrades: s.closedTrades })),
  );

  const stats = useMemo(() => {
    const filtered = filterByRange(closedTrades, range);
    const groups = new Map<string, ClosedTrade[]>();
    for (const t of filtered) {
      if (!groups.has(t.symbol)) groups.set(t.symbol, []);
      groups.get(t.symbol)!.push(t);
    }
    const arr: SymbolStat[] = [];
    groups.forEach((trades, symbol) => {
      const wins = trades.filter(t => t.pnl > 0).length;
      const total = trades.length;
      arr.push({
        symbol,
        trades: total,
        netPnl: trades.reduce((s, t) => s + t.pnl, 0),
        winRate: total ? (wins / total) * 100 : 0,
      });
    });
    arr.sort((a, b) => b.netPnl - a.netPnl);
    return arr;
  }, [closedTrades, range]);

  const maxAbs = useMemo(
    () => Math.max(1, ...stats.map(s => Math.abs(s.netPnl))),
    [stats],
  );

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>P&L by Symbol</h3>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {stats.length} symbols
        </span>
      </div>

      {stats.length === 0 ? (
        <div className="text-[12px] py-6 text-center" style={{ color: 'var(--text-muted)' }}>
          No trades in this period yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {stats.map(s => {
            const pctWidth = (Math.abs(s.netPnl) / maxAbs) * 100;
            const isProfit = s.netPnl >= 0;
            return (
              <div key={s.symbol} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 shrink-0 font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {s.symbol}
                </span>
                <div className="flex-1 relative h-5 rounded overflow-hidden" style={{ background: 'var(--surface-elevated)' }}>
                  <div
                    className="absolute top-0 h-full transition-all duration-500"
                    style={{
                      width:       `${pctWidth}%`,
                      background:  isProfit ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)',
                      borderLeft:  `2px solid ${isProfit ? '#10b981' : '#ef4444'}`,
                      left: 0,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center px-2">
                    <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {s.trades}t · {s.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <span className="w-20 text-right tabular-nums font-bold" style={{ color: isProfit ? '#10b981' : '#ef4444' }}>
                  {isProfit ? '+' : ''}${s.netPnl.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function filterByRange(trades: ClosedTrade[], range: TimeRange): ClosedTrade[] {
  if (range === 'all') return trades;
  const now = Date.now();
  let cutoff = 0;
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    cutoff = d.getTime();
  } else if (range === 'week')  cutoff = now - 7  * 86_400_000;
  else if (range === 'month')   cutoff = now - 30 * 86_400_000;
  return trades.filter(t => t.exitTime >= cutoff);
}
