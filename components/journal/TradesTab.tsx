'use client';

import { useState, useCallback } from 'react';
import { throttledFetch } from '@/lib/api/throttledFetch';
import { useJournal } from '@/hooks/useJournal';
import { useJournalStore } from '@/stores/useJournalStore';
import { exportToCsv } from '@/lib/journal/csvExport';
import TradeFilters from './TradeFilters';
import TradeTable from './TradeTable';
import TradeDetailPanel from './TradeDetailPanel';
import TradeFormModal from './TradeFormModal';
import BulkActionsBar from './BulkActionsBar';
import type { JournalEntry } from '@/types/journal';

export default function TradesTab() {
  const { entries, stats, pagination, loading, page, setPage, refetch } = useJournal();
  const { tradeTablePageSize, setTradeTablePageSize } = useJournalStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailTrade, setDetailTrade] = useState<JournalEntry | null>(null);
  const [editTrade, setEditTrade] = useState<JournalEntry | null>(null);
  const [showForm, setShowForm] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (entries.every(e => selectedIds.has(e.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  }, [entries, selectedIds]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trade?')) return;
    await throttledFetch(`/api/journal/${id}`, { method: 'DELETE' });
    refetch();
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} trades?`)) return;
    await throttledFetch('/api/journal/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    refetch();
  };

  const handleExport = () => {
    exportToCsv(entries);
  };

  const handleEdit = (trade: JournalEntry) => {
    setEditTrade(trade);
    setShowForm(true);
    setDetailTrade(null);
  };

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}$${pnl.toFixed(2)}`;
  };

  return (
    <div className="p-6 space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Total P&L</span>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: stats.totalPnl >= 0 ? 'var(--bull)' : 'var(--bear)' }}
          >
            {formatPnl(stats.totalPnl)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Win Rate</span>
          <span className="text-sm font-bold text-[var(--text-primary)]">{stats.winRate}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">Trades</span>
          <span className="text-sm font-bold text-[var(--text-primary)]">
            {stats.totalTrades}
            <span className="text-[var(--bull)] ml-1">{stats.winCount}W</span>
            <span className="text-[var(--text-dimmed)] mx-0.5">/</span>
            <span className="text-[var(--bear)]">{stats.lossCount}L</span>
          </span>
        </div>

        <div className="flex-1" />

        {/* Page Size */}
        <select
          value={tradeTablePageSize}
          onChange={(e) => setTradeTablePageSize(parseInt(e.target.value))}
          className="px-2 py-1 rounded text-xs bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-muted)]"
        >
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>

        {/* Export */}
        <button
          onClick={handleExport}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-light)] hover:border-[var(--border)] transition-colors"
        >
          Export CSV
        </button>

        {/* New Trade */}
        <button
          onClick={() => { setEditTrade(null); setShowForm(true); }}
          className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all hover:-translate-y-0.5 active:scale-[0.97]"
          style={{ background: 'var(--primary)', color: 'var(--background)' }}
        >
          + New Trade
        </button>
      </div>

      {/* Filters */}
      <TradeFilters />

      {/* Bulk Actions */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onBulkDelete={handleBulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Table */}
      <TradeTable
        entries={entries}
        loading={loading}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onRowClick={setDetailTrade}
        onEdit={handleEdit}
        onDelete={handleDelete}
        pagination={pagination}
        page={page}
        onPageChange={setPage}
      />

      {/* Detail Panel */}
      <TradeDetailPanel
        trade={detailTrade}
        onClose={() => setDetailTrade(null)}
        onEdit={handleEdit}
      />

      {/* Form Modal */}
      <TradeFormModal
        open={showForm}
        onClose={() => { setShowForm(false); setEditTrade(null); }}
        editTrade={editTrade}
        onSuccess={refetch}
      />
    </div>
  );
}
