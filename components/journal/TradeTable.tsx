'use client';

import { useJournalStore } from '@/stores/useJournalStore';
import type { JournalEntry } from '@/types/journal';

interface TradeTableProps {
  entries: JournalEntry[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (entry: JournalEntry) => void;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (id: string) => void;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  page: number;
  onPageChange: (page: number) => void;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

const formatPnl = (pnl: number | null) => {
  if (pnl === null) return '-';
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${pnl.toFixed(2)}`;
};

type SortColumn = 'entryTime' | 'symbol' | 'side' | 'entryPrice' | 'exitPrice' | 'quantity' | 'pnl' | 'setup';

const COLUMNS: { key: SortColumn; label: string; align: 'left' | 'right' }[] = [
  { key: 'entryTime', label: 'Date', align: 'left' },
  { key: 'symbol', label: 'Symbol', align: 'left' },
  { key: 'side', label: 'Side', align: 'left' },
  { key: 'entryPrice', label: 'Entry', align: 'right' },
  { key: 'exitPrice', label: 'Exit', align: 'right' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'pnl', label: 'P&L', align: 'right' },
  { key: 'setup', label: 'Setup', align: 'left' },
];

export default function TradeTable({
  entries, loading, selectedIds, onToggleSelect, onToggleSelectAll,
  onRowClick, onEdit, onDelete, pagination, page, onPageChange,
}: TradeTableProps) {
  const { tradeTableSort, setTradeTableSort } = useJournalStore();

  const handleSort = (column: string) => {
    if (tradeTableSort.column === column) {
      setTradeTableSort({
        column,
        direction: tradeTableSort.direction === 'asc' ? 'desc' : 'asc',
      });
    } else {
      setTradeTableSort({ column, direction: 'desc' });
    }
  };

  const allSelected = entries.length > 0 && entries.every(e => selectedIds.has(e.id));

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--surface-elevated)]">
              {/* Checkbox */}
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-[var(--border)] accent-[var(--primary)]"
                />
              </th>

              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-xs font-medium text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-primary)] transition-colors select-none ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {tradeTableSort.column === col.key && (
                      <span className="text-[var(--primary)]">
                        {tradeTableSort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </span>
                </th>
              ))}

              <th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div
                          className="h-3 rounded animate-shimmer"
                          style={{
                            backgroundColor: 'var(--surface-elevated)',
                            width: `${50 + ((i + j) * 13) % 40}%`,
                            animationDelay: `${(i * 10 + j * 5) * 10}ms`,
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-dimmed)" strokeWidth="1.5" strokeLinecap="round" opacity="0.35">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No trades found</span>
                  </div>
                </td>
              </tr>
            ) : entries.map((entry) => (
              <tr
                key={entry.id}
                onClick={() => onRowClick(entry)}
                className={`border-t border-[var(--border)] transition-colors cursor-pointer hover:bg-[var(--surface-hover)] ${
                  selectedIds.has(entry.id) ? 'bg-[var(--primary)]/5' : ''
                }`}
              >
                {/* Checkbox */}
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => onToggleSelect(entry.id)}
                    className="rounded border-[var(--border)] accent-[var(--primary)]"
                  />
                </td>

                {/* Date */}
                <td className="px-4 py-3 text-sm text-[var(--text-muted)] whitespace-nowrap">
                  {formatDate(entry.entryTime)}
                </td>

                {/* Symbol */}
                <td className="px-4 py-3 text-sm font-mono font-bold text-[var(--text-primary)]">
                  {entry.symbol}
                </td>

                {/* Side */}
                <td className="px-4 py-3">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{
                      background: entry.side === 'LONG' ? 'var(--bull-bg, rgba(34,197,94,0.15))' : 'var(--bear-bg, rgba(239,68,68,0.15))',
                      color: entry.side === 'LONG' ? 'var(--bull)' : 'var(--bear)',
                    }}
                  >
                    {entry.side}
                  </span>
                </td>

                {/* Entry Price */}
                <td className="px-4 py-3 text-sm text-right font-mono text-[var(--text-primary)]">
                  {entry.entryPrice}
                </td>

                {/* Exit Price */}
                <td className="px-4 py-3 text-sm text-right font-mono text-[var(--text-muted)]">
                  {entry.exitPrice ?? '-'}
                </td>

                {/* Quantity */}
                <td className="px-4 py-3 text-sm text-right text-[var(--text-muted)]">
                  {entry.quantity}
                </td>

                {/* P&L */}
                <td
                  className="px-4 py-3 text-sm text-right font-bold font-mono"
                  style={{ color: (entry.pnl || 0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}
                >
                  {formatPnl(entry.pnl)}
                </td>

                {/* Setup */}
                <td className="px-4 py-3 text-sm text-[var(--text-dimmed)]">
                  {entry.setup || '-'}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onEdit(entry)}
                      className="text-xs text-[var(--text-dimmed)] hover:text-[var(--primary)] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(entry.id)}
                      className="text-xs text-[var(--text-dimmed)] hover:text-[var(--error)] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-elevated)]">
          <span className="text-xs text-[var(--text-muted)]">
            {pagination.total} trades total — Page {page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors disabled:opacity-30"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const startPage = Math.max(1, Math.min(page - 2, pagination.totalPages - 4));
              const p = startPage + i;
              if (p > pagination.totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                    p === page
                      ? 'bg-[var(--primary)] text-[var(--background)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1 rounded text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
