'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTradingStore } from '@/stores/useTradingStore';

const MAX_ROWS = 20;

/**
 * Trade history — last 20 closed trades, newest first.
 * Shows entry/exit/P&L per trade with timestamps.
 */
export default function TradeHistory() {
  const { closedTrades } = useTradingStore(
    useShallow(s => ({ closedTrades: s.closedTrades })),
  );

  const recent = useMemo(
    () => [...closedTrades].sort((a, b) => b.exitTime - a.exitTime).slice(0, MAX_ROWS),
    [closedTrades],
  );

  if (recent.length === 0) {
    return (
      <Card title="Recent Trades" badge="0">
        <EmptyRow text="No trades closed yet. Once you close a position, the trade history shows up here." />
      </Card>
    );
  }

  return (
    <Card title="Recent Trades" badge={`${closedTrades.length}`} subBadge={recent.length < closedTrades.length ? `showing last ${recent.length}` : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }} className="text-left text-[10px] uppercase tracking-wider">
              <th className="px-3 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
              <th className="px-3 py-2 font-medium text-right">Entry</th>
              <th className="px-3 py-2 font-medium text-right">Exit</th>
              <th className="px-3 py-2 font-medium text-right">P&L</th>
              <th className="px-3 py-2 font-medium text-right">Hold</th>
              <th className="px-3 py-2 font-medium text-right">Closed</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(t => {
              const isLong = t.side === 'buy';
              const pnlColor = t.pnl >= 0 ? '#10b981' : '#ef4444';
              return (
                <tr
                  key={t.id}
                  className="border-t transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="px-3 py-2 font-bold" style={{ color: 'var(--text-primary)' }}>{t.symbol}</td>
                  <td className="px-3 py-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                      style={{
                        background: isLong ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                        color:      isLong ? '#10b981' : '#ef4444',
                      }}
                    >
                      {isLong ? 'LONG' : 'SHORT'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-primary)' }}>{t.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>${t.entryPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>${t.exitPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: pnlColor }}>
                    {t.pnl >= 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatDuration(t.exitTime - t.entryTime)}
                  </td>
                  <td className="px-3 py-2 text-right text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatRelative(t.exitTime)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60)  return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)        return 'just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function Card({
  title,
  badge,
  subBadge,
  children,
}: {
  title:     string;
  badge?:    string;
  subBadge?: string;
  children:  React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {badge && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums" style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}>
            {badge}
          </span>
        )}
        {subBadge && (
          <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{subBadge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
      {text}
    </div>
  );
}
