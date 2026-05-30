// Native port of `components/journal/CalendarDaySummary.tsx`. Shows
// the trades log for a single selected day, with per-trade row + day
// total. Closeable.

import { formatCurrency } from "../../lib/journal/format";
import type { JournalEntry } from "../../types/journal";

interface Props {
  date: string;
  trades: JournalEntry[];
  onClose: () => void;
}

export default function CalendarDaySummary({ date, trades, onClose }: Props) {
  const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = trades.filter((t) => (t.pnl ?? 0) < 0).length;

  const dateFormatted = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border border-white/8 bg-[#0a0a0a] p-5 animate-[fadeIn_180ms_ease]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{dateFormatted}</p>
          <p className="text-xs text-white/55">
            {trades.length} trade{trades.length > 1 ? "s" : ""} — {wins}W / {losses}L
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-lg font-bold font-mono"
            style={{ color: totalPnl >= 0 ? "#7ed321" : "#ffffff" }}
          >
            {totalPnl >= 0 ? "+" : ""}
            {formatCurrency(totalPnl)}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/55 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Trades list */}
      <div className="space-y-2">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5"
          >
            <span className="text-xs font-mono font-bold text-white w-12">
              {trade.symbol}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background:
                  trade.side === "LONG"
                    ? "rgba(126, 211, 33, 0.15)"
                    : "rgba(255, 255, 255, 0.10)",
                color: trade.side === "LONG" ? "#7ed321" : "#ffffff",
              }}
            >
              {trade.side}
            </span>
            <span className="text-xs text-white/55 font-mono">{trade.entryPrice}</span>
            <span className="text-xs text-white/30">→</span>
            <span className="text-xs text-white/55 font-mono">
              {trade.exitPrice ?? "—"}
            </span>
            <span className="flex-1" />
            <span
              className="text-xs font-bold font-mono"
              style={{
                color:
                  trade.pnl === null
                    ? "rgba(255,255,255,0.40)"
                    : trade.pnl >= 0
                      ? "#7ed321"
                      : "#ffffff",
              }}
            >
              {trade.pnl !== null
                ? `${trade.pnl >= 0 ? "+" : ""}${formatCurrency(trade.pnl)}`
                : "—"}
            </span>
            {trade.setup && (
              <span className="text-[10px] text-white/30">{trade.setup}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
