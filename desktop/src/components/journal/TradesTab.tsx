// Native port of `components/journal/TradesTab.tsx` orchestrator.
// Owns: filter state, page, selection set, detail/edit modals.
// Children: TradeFilters, BulkActionsBar, TradeTable, TradeDetailPanel,
// TradeFormModal — all driven from this component's state.

import { useCallback, useMemo, useState } from "react";
import TradeFilters from "./TradeFilters";
import BulkActionsBar from "./BulkActionsBar";
import TradeTable from "./TradeTable";
import TradeDetailPanel from "./TradeDetailPanel";
import TradeFormModal from "./TradeFormModal";
import SyncRithmicButton from "./SyncRithmicButton";
import CsvImportModal from "./CsvImportModal";
import { useJournal } from "../../lib/journal/useJournal";
import { deleteTrade, bulkDeleteTrades } from "../../lib/journal/api";
import type { JournalEntry, TradeFilter } from "../../types/journal";

const DEFAULT_FILTER: TradeFilter = {};

export default function TradesTab() {
  const [pageSize, setPageSize] = useState(25);
  const [filter, setFilter] = useState<TradeFilter>(DEFAULT_FILTER);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailTrade, setDetailTrade] = useState<JournalEntry | null>(null);
  const [editTrade, setEditTrade] = useState<JournalEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  const { entries, stats, pagination, loading, page, setPage, refetch } = useJournal({
    pageSize,
    filter,
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (entries.every((e) => prev.has(e.id))) return new Set();
      return new Set(entries.map((e) => e.id));
    });
  }, [entries]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    await deleteTrade(id);
    setDetailTrade((d) => (d?.id === id ? null : d));
    refetch();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} trades?`)) return;
    await bulkDeleteTrades(Array.from(selectedIds));
    setSelectedIds(new Set());
    refetch();
  };

  const handleEdit = (trade: JournalEntry) => {
    setEditTrade(trade);
    setShowForm(true);
    setDetailTrade(null);
  };

  const formatPnl = (pnl: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}$${pnl.toFixed(2)}`;
  };

  const handleExportCsv = useCallback(() => {
    if (entries.length === 0) return;
    const cols: (keyof JournalEntry)[] = [
      "entryTime",
      "symbol",
      "side",
      "entryPrice",
      "exitPrice",
      "quantity",
      "pnl",
      "setup",
      "timeframe",
      "rating",
      "emotions",
      "notes",
    ];
    const lines = [cols.join(",")];
    for (const e of entries) {
      lines.push(
        cols
          .map((c) => {
            const v = e[c];
            if (v === null || v === undefined) return "";
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [entries]);

  // Reset filter helper
  const handleResetFilters = useCallback(() => setFilter(DEFAULT_FILTER), []);

  const bestTradeFmt = useMemo(() => formatPnl(stats.bestTrade), [stats.bestTrade]);
  const worstTradeFmt = useMemo(() => formatPnl(stats.worstTrade), [stats.worstTrade]);

  return (
    <div className="p-6 space-y-5 h-full overflow-y-auto">
      {/* Stat cards — gradient bg, hover lift, color-aware. */}
      <div className="j-stat-row">
        <div className="j-stat">
          <div className="j-stat-label">Total P&L</div>
          <div
            className={`j-stat-value ${stats.totalPnl >= 0 ? "is-pos" : "is-neg"}`}
          >
            {formatPnl(stats.totalPnl)}
          </div>
          <div className="j-stat-sub">{stats.totalTrades} trades</div>
        </div>

        <div className="j-stat">
          <div className="j-stat-label">Win Rate</div>
          <div className="j-stat-value">{stats.winRate.toFixed(1)}%</div>
          <div className="j-stat-sub">
            <span style={{ color: "#7ed321" }}>{stats.winCount}W</span>
            <span className="opacity-30 mx-1">/</span>
            <span className="text-white">{stats.lossCount}L</span>
            {stats.openCount > 0 && (
              <>
                <span className="opacity-30 mx-1">·</span>
                <span className="opacity-60">{stats.openCount} open</span>
              </>
            )}
          </div>
        </div>

        <div className="j-stat">
          <div className="j-stat-label">Avg Win / Loss</div>
          <div className="j-stat-value">
            <span style={{ color: "#7ed321" }}>{formatPnl(stats.avgWin)}</span>
            <span className="opacity-30 mx-1.5 text-base">·</span>
            <span>{formatPnl(stats.avgLoss)}</span>
          </div>
          <div className="j-stat-sub">expectancy per trade</div>
        </div>

        <div className="j-stat">
          <div className="j-stat-label">Best · Worst</div>
          <div className="j-stat-value">
            <span style={{ color: "#7ed321" }}>{bestTradeFmt}</span>
            <span className="opacity-30 mx-1.5 text-base">·</span>
            <span>{worstTradeFmt}</span>
          </div>
          <div className="j-stat-sub">extreme outcomes</div>
        </div>
      </div>

      {/* Action toolbar — sync, page size, export, new trade. */}
      <div className="flex items-center gap-2 flex-wrap">
        <SyncRithmicButton onSynced={refetch} />

        <div className="flex-1" />

        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(parseInt(e.target.value));
            setPage(0);
          }}
          className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.025] border border-white/10 text-white/62 hover:text-white hover:border-white/20 transition-colors cursor-pointer"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>

        <button onClick={() => setShowCsvImport(true)} className="j-btn-ghost">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import CSV
        </button>

        <button onClick={handleExportCsv} className="j-btn-ghost">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>

        <button
          type="button"
          onClick={() => {
            setEditTrade(null);
            setShowForm(true);
          }}
          className="j-btn-primary"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Trade
        </button>
      </div>

      {/* Filters */}
      <TradeFilters value={filter} onChange={setFilter} onReset={handleResetFilters} />

      {/* Bulk actions */}
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

      {/* Detail panel */}
      <TradeDetailPanel
        trade={detailTrade}
        onClose={() => setDetailTrade(null)}
        onEdit={handleEdit}
      />

      {/* Form modal */}
      <TradeFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditTrade(null);
        }}
        editTrade={editTrade}
        onSuccess={refetch}
      />

      {/* CSV import modal */}
      <CsvImportModal
        open={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        onImported={refetch}
      />
    </div>
  );
}
