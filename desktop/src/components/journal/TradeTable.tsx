// Native port of `components/journal/TradeTable.tsx`. Drop the
// Zustand sort store dep — sort state lives locally in the table, the
// SQLite query orders by entry_time DESC for now (Day 2 will add
// server-side sort). Senzoukria palette substitutions:
//   --bull / --bear → #7ed321 / #ffffff
//   --error         → #ffffff (white = bearish in our scheme)

import { useState } from "react";
import type { JournalEntry } from "../../types/journal";

interface TradeTableProps {
  entries: JournalEntry[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (entry: JournalEntry) => void;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (id: string) => void;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  page: number;
  onPageChange: (page: number) => void;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatPnl = (pnl: number | null) => {
  if (pnl === null) return "—";
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${pnl.toFixed(2)}`;
};

type SortColumn =
  | "entryTime"
  | "symbol"
  | "side"
  | "entryPrice"
  | "exitPrice"
  | "quantity"
  | "pnl"
  | "setup";

const COLUMNS: { key: SortColumn; label: string; align: "left" | "right" }[] = [
  { key: "entryTime", label: "Date", align: "left" },
  { key: "symbol", label: "Symbol", align: "left" },
  { key: "side", label: "Side", align: "left" },
  { key: "entryPrice", label: "Entry", align: "right" },
  { key: "exitPrice", label: "Exit", align: "right" },
  { key: "quantity", label: "Qty", align: "right" },
  { key: "pnl", label: "P&L", align: "right" },
  { key: "setup", label: "Setup", align: "left" },
];

export default function TradeTable({
  entries,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  onEdit,
  onDelete,
  pagination,
  page,
  onPageChange,
}: TradeTableProps) {
  // Local sort state — Day 1 only flips the arrow visually; the actual
  // ORDER BY will be added server-side in Day 2 alongside the real
  // analytics. Existing list comes back DESC by entry_time.
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({
    column: "entryTime",
    direction: "desc",
  });

  const handleSort = (column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "desc" }
    );
  };

  const allSelected = entries.length > 0 && entries.every((e) => selectedIds.has(e.id));

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 bg-[#0a0a0a]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.03]">
              {/* Checkbox */}
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="rounded border-white/20 accent-[#7ed321]"
                />
              </th>

              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-xs font-medium text-white/55 cursor-pointer hover:text-white hover:bg-white/[0.04] transition-all select-none ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sort.column === col.key && (
                      <span className="text-[#7ed321]">
                        {sort.direction === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}

              <th className="px-4 py-3 text-right text-xs font-medium text-white/55">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-white/5">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div
                          className="h-3 rounded bg-white/[0.04]"
                          style={{ width: `${50 + ((i + j) * 13) % 40}%` }}
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
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(255,255,255,0.30)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      opacity="0.6"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="text-sm text-white/55">No trades found</span>
                    <span className="text-xs text-white/35">
                      Click "+ New Trade" above to log your first entry.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => onRowClick(entry)}
                  className={`border-t border-white/5 transition-all cursor-pointer hover:bg-white/[0.03] ${
                    selectedIds.has(entry.id) ? "bg-[#7ed321]/[0.06]" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => onToggleSelect(entry.id)}
                      className="rounded border-white/20 accent-[#7ed321]"
                    />
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-sm text-white/55 whitespace-nowrap">
                    {formatDate(entry.entryTime)}
                  </td>

                  {/* Symbol */}
                  <td className="px-4 py-3 text-sm font-mono font-bold text-white">
                    <span className="inline-flex items-center gap-1.5">
                      {entry.symbol}
                      {entry.externalSource === "rithmic" && (
                        <span
                          className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded"
                          style={{
                            background: "rgba(126, 211, 33, 0.10)",
                            color: "#7ed321",
                            border: "1px solid rgba(126, 211, 33, 0.25)",
                          }}
                          title={`Synced from Rithmic${entry.accountId ? ` · ${entry.accountId}` : ""}`}
                        >
                          sync
                        </span>
                      )}
                    </span>
                  </td>

                  {/* Side */}
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        background:
                          entry.side === "LONG"
                            ? "rgba(126, 211, 33, 0.15)"
                            : "rgba(255, 255, 255, 0.10)",
                        color: entry.side === "LONG" ? "#7ed321" : "#ffffff",
                      }}
                    >
                      {entry.side}
                    </span>
                  </td>

                  {/* Entry Price */}
                  <td className="px-4 py-3 text-sm text-right font-mono text-white">
                    {entry.entryPrice}
                  </td>

                  {/* Exit Price */}
                  <td className="px-4 py-3 text-sm text-right font-mono text-white/55">
                    {entry.exitPrice ?? "—"}
                  </td>

                  {/* Quantity */}
                  <td className="px-4 py-3 text-sm text-right text-white/55">
                    {entry.quantity}
                  </td>

                  {/* P&L */}
                  <td
                    className="px-4 py-3 text-sm text-right font-bold font-mono"
                    style={{
                      color:
                        entry.pnl === null
                          ? "rgba(255,255,255,0.40)"
                          : entry.pnl >= 0
                            ? "#7ed321"
                            : "#ffffff",
                    }}
                  >
                    {formatPnl(entry.pnl)}
                  </td>

                  {/* Setup */}
                  <td className="px-4 py-3 text-sm text-white/40">
                    {entry.setup || "—"}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEdit(entry)}
                        className="j-btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="j-btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/[0.02]">
          <span className="text-xs text-white/55">
            {pagination.total} trades total — Page {page + 1} of {pagination.pageCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 0}
              className="px-3 py-1 rounded text-xs text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-30"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(5, pagination.pageCount) }, (_, i) => {
              const startPage = Math.max(0, Math.min(page - 2, pagination.pageCount - 5));
              const p = startPage + i;
              if (p >= pagination.pageCount) return null;
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                    p === page
                      ? "bg-[#7ed321] text-[#0a0a0a]"
                      : "text-white/55 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page + 1 >= pagination.pageCount}
              className="px-3 py-1 rounded text-xs text-white/55 hover:text-white hover:bg-white/[0.04] transition-colors disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
