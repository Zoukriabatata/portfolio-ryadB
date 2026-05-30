// Native port of `components/journal/TradeDetailPanel.tsx` — slide-in
// panel from the right showing the full trade details (read-only).
// Uses our local Modal? No, the website renders a side drawer; we
// portal a fixed right panel for parity.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { JournalEntry } from "../../types/journal";

interface Props {
  trade: JournalEntry | null;
  onClose: () => void;
  onEdit: (trade: JournalEntry) => void;
}

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const formatPnl = (pnl: number | null) => {
  if (pnl === null) return "—";
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${pnl.toFixed(2)}`;
};

export default function TradeDetailPanel({ trade, onClose, onEdit }: Props) {
  useEffect(() => {
    if (!trade) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trade, onClose]);

  if (!trade) return null;

  const tagsList: string[] = trade.tags
    ? (() => {
        try {
          return JSON.parse(trade.tags);
        } catch {
          return [];
        }
      })()
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex justify-end bg-black/50 backdrop-blur-[2px] animate-[fadeIn_180ms_ease]"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="h-full w-full max-w-md bg-[#0a0a0a] border-l border-white/10 shadow-[-24px_0_60px_rgba(0,0,0,0.6)] flex flex-col animate-[panelIn_280ms_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-mono font-bold text-white">{trade.symbol}</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
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
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(trade)}
              className="text-xs px-3 py-1.5 rounded-md text-[#7ed321] hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              Edit
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-white/55 hover:text-white transition-colors w-7 h-7 inline-flex items-center justify-center rounded-md hover:bg-white/5"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4L12 12M12 4L4 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* P&L */}
          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">P&L</div>
            <div
              className="text-2xl font-bold font-mono"
              style={{
                color:
                  trade.pnl === null
                    ? "rgba(255,255,255,0.55)"
                    : trade.pnl >= 0
                      ? "#7ed321"
                      : "#ffffff",
              }}
            >
              {formatPnl(trade.pnl)}
            </div>
          </div>

          {/* Prices + qty */}
          <div className="grid grid-cols-3 gap-3">
            <Detail label="Entry" value={trade.entryPrice} mono />
            <Detail label="Exit" value={trade.exitPrice ?? "—"} mono />
            <Detail label="Qty" value={trade.quantity} mono />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <Detail label="Entry Time" value={formatDateTime(trade.entryTime)} />
            <Detail
              label="Exit Time"
              value={trade.exitTime ? formatDateTime(trade.exitTime) : "—"}
            />
          </div>

          {/* Setup row */}
          <div className="grid grid-cols-3 gap-3">
            <Detail label="Setup" value={trade.setup ?? "—"} />
            <Detail label="Timeframe" value={trade.timeframe ?? "—"} />
            <Detail label="Emotion" value={trade.emotions ?? "—"} />
          </div>

          {/* Rating */}
          {trade.rating !== null && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
                Rating
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className="text-xl"
                    style={{
                      color:
                        star <= (trade.rating ?? 0)
                          ? "#a3e635"
                          : "rgba(255,255,255,0.20)",
                    }}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {tagsList.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tagsList.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#7ed321]/10 text-[#7ed321] border border-[#7ed321]/20"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {trade.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
                Notes
              </div>
              <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">
                {trade.notes}
              </p>
            </div>
          )}

          {/* Meta */}
          <div className="pt-3 border-t border-white/5 text-[10px] text-white/30 space-y-0.5 font-mono">
            <div>id: {trade.id}</div>
            <div>created: {formatDateTime(trade.createdAt)}</div>
            <div>updated: {formatDateTime(trade.updatedAt)}</div>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes panelIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
        {label}
      </div>
      <div className={`text-sm text-white ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
