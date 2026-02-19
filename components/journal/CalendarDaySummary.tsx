'use client';

import type { JournalEntry } from '@/types/journal';
import { formatCurrency } from '@/lib/journal/chartUtils';

interface CalendarDaySummaryProps {
  date: string;
  trades: JournalEntry[];
  onClose: () => void;
}

export default function CalendarDaySummary({ date, trades, onClose }: CalendarDaySummaryProps) {
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = trades.filter(t => (t.pnl || 0) > 0).length;
  const losses = trades.filter(t => (t.pnl || 0) < 0).length;

  const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{dateFormatted}</p>
          <p className="text-xs text-[var(--text-muted)]">
            {trades.length} trade{trades.length > 1 ? 's' : ''} — {wins}W / {losses}L
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-lg font-bold font-mono"
            style={{ color: totalPnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}
          >
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </span>
          <button onClick={onClose} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Trades list */}
      <div className="space-y-2">
        {trades.map((trade) => (
          <div key={trade.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--surface-elevated)]">
            <span className="text-xs font-mono font-bold text-[var(--text-primary)] w-8">{trade.symbol}</span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: trade.side === 'LONG' ? 'var(--bull-bg, rgba(34,197,94,0.15))' : 'var(--bear-bg, rgba(239,68,68,0.15))',
                color: trade.side === 'LONG' ? 'var(--bull)' : 'var(--bear)',
              }}
            >
              {trade.side}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-mono">{trade.entryPrice}</span>
            <span className="text-xs text-[var(--text-dimmed)]">→</span>
            <span className="text-xs text-[var(--text-muted)] font-mono">{trade.exitPrice ?? '—'}</span>
            <span className="flex-1" />
            <span
              className="text-xs font-bold font-mono"
              style={{ color: (trade.pnl || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}
            >
              {trade.pnl !== null ? `${trade.pnl >= 0 ? '+' : ''}${formatCurrency(trade.pnl)}` : '—'}
            </span>
            {trade.setup && <span className="text-[10px] text-[var(--text-dimmed)]">{trade.setup}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
