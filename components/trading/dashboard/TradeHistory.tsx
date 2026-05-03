'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useTradingStore, type ClosedTrade } from '@/stores/useTradingStore';

const PAGE_SIZE = 20;
const PAGE_SIZES = [10, 20, 50, 100];

interface TradeHistoryProps {
  symbolFilter?: string | null;
}

/**
 * Trade history — paginated, newest first.
 * Shows entry/exit/P&L per trade with timestamps.
 */
export default function TradeHistory({ symbolFilter = null }: TradeHistoryProps) {
  const { closedTrades } = useTradingStore(
    useShallow(s => ({ closedTrades: s.closedTrades })),
  );

  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);

  const filtered = useMemo(
    () => symbolFilter ? closedTrades.filter(t => t.symbol === symbolFilter) : closedTrades,
    [closedTrades, symbolFilter],
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.exitTime - a.exitTime),
    [filtered],
  );

  // When the dataset shrinks (e.g. symbolFilter switched, account reset),
  // snap back to a valid page so we never display an empty page.
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const visible = useMemo(
    () => sorted.slice(page * pageSize, page * pageSize + pageSize),
    [sorted, page, pageSize],
  );

  const handleExportCsv = useCallback(() => {
    if (filtered.length === 0) {
      toast.error('No trades to export');
      return;
    }
    const csv = tradesToCsv(filtered);
    downloadCsv(csv, `senzoukria-trades-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`Exported ${filtered.length} trade${filtered.length > 1 ? 's' : ''}`, { duration: 1500 });
  }, [filtered]);

  if (visible.length === 0) {
    return (
      <Card title="Recent Trades" badge="0">
        <EmptyRow text="No trades closed yet. Once you close a position, the trade history shows up here." />
      </Card>
    );
  }

  const startIdx = page * pageSize + 1;
  const endIdx   = Math.min(sorted.length, (page + 1) * pageSize);

  return (
    <Card
      title="Recent Trades"
      badge={`${filtered.length}`}
      subBadge={sorted.length > pageSize ? `showing ${startIdx}–${endIdx}` : undefined}
      action={
        <button
          onClick={handleExportCsv}
          title="Export trade history as CSV"
          className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold transition-colors hover:brightness-110 flex items-center gap-1"
          style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          ⬇ CSV
        </button>
      }
    >
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
            {visible.map(t => {
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

      {/* Pagination footer — only when more than one page exists */}
      {sorted.length > pageSize && (
        <div
          className="flex items-center justify-between px-4 py-2 border-t text-[11px]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
              className="px-1.5 py-0.5 rounded text-[11px] tabular-nums focus:outline-none"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {PAGE_SIZES.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <PageButton onClick={() => setPage(0)}            disabled={page === 0}>«</PageButton>
            <PageButton onClick={() => setPage(p => p - 1)}   disabled={page === 0}>‹</PageButton>
            <span className="px-2 tabular-nums">
              <span style={{ color: 'var(--text-primary)' }}>{page + 1}</span>
              <span> / {pageCount}</span>
            </span>
            <PageButton onClick={() => setPage(p => p + 1)}   disabled={page >= pageCount - 1}>›</PageButton>
            <PageButton onClick={() => setPage(pageCount - 1)} disabled={page >= pageCount - 1}>»</PageButton>
          </div>
        </div>
      )}
    </Card>
  );
}

function PageButton({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-6 h-6 rounded text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-125"
      style={{ background: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
    >
      {children}
    </button>
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
  action,
  children,
}: {
  title:     string;
  badge?:    string;
  subBadge?: string;
  action?:   React.ReactNode;
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
        {action}
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

// ─── CSV export helpers ───────────────────────────────────────────────────

function tradesToCsv(trades: ClosedTrade[]): string {
  const header = [
    'id','symbol','side','quantity','entryPrice','exitPrice','pnl',
    'entryTime','exitTime','holdSeconds','broker',
  ].join(',');

  const rows = [...trades]
    .sort((a, b) => a.exitTime - b.exitTime)
    .map(t => [
      t.id,
      t.symbol,
      t.side,
      t.quantity,
      t.entryPrice,
      t.exitPrice,
      t.pnl.toFixed(4),
      new Date(t.entryTime).toISOString(),
      new Date(t.exitTime).toISOString(),
      Math.round((t.exitTime - t.entryTime) / 1000),
      t.broker,
    ].join(','))
    .join('\n');

  return `${header}\n${rows}`;
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
