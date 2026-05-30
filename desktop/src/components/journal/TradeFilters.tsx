// Native port of `components/journal/TradeFilters.tsx` — controlled
// component pattern (filters owned by parent TradesTab via props)
// instead of a Zustand store, since the desktop app has only one
// Journal route consuming filters.

import type { TradeFilter } from "../../types/journal";

const SYMBOLS = ["MNQ", "NQ", "MES", "ES", "RTY", "YM", "CL", "NG", "GC", "SI", "BTC", "MBT", "ETH", "MET"];
const SETUPS = ["breakout", "pullback", "reversal", "fade", "trend", "range", "news", "open"];
const EMOTIONS = ["calm", "confident", "fomo", "revenge", "fearful", "tilted", "patient"];

interface Props {
  value: TradeFilter;
  onChange: (next: TradeFilter) => void;
  onReset: () => void;
}

export default function TradeFilters({ value, onChange, onReset }: Props) {
  const hasActiveFilters =
    value.from ||
    value.to ||
    value.symbol ||
    value.setup ||
    value.timeframe ||
    value.outcome ||
    value.side ||
    value.query;

  const selectStyle =
    "px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-white/10 text-white focus:border-[#7ed321]/55 focus:outline-none transition-colors";
  const inputStyle =
    "px-2.5 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-white/10 text-white focus:border-[#7ed321]/55 focus:outline-none transition-colors w-32";

  function set<K extends keyof TradeFilter>(key: K, val: TradeFilter[K] | undefined) {
    onChange({ ...value, [key]: val });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Date Range */}
      <input
        type="date"
        value={value.from?.slice(0, 10) ?? ""}
        onChange={(e) => set("from", e.target.value ? `${e.target.value}T00:00:00Z` : undefined)}
        className={inputStyle}
        title="From date"
      />
      <span className="text-white/40 text-xs">to</span>
      <input
        type="date"
        value={value.to?.slice(0, 10) ?? ""}
        onChange={(e) => set("to", e.target.value ? `${e.target.value}T23:59:59Z` : undefined)}
        className={inputStyle}
        title="To date"
      />

      <div className="w-px h-5 bg-white/10" />

      {/* Symbol */}
      <select
        value={value.symbol ?? ""}
        onChange={(e) => set("symbol", e.target.value || undefined)}
        className={selectStyle}
      >
        <option value="">All Symbols</option>
        {SYMBOLS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Side */}
      <select
        value={value.side ?? ""}
        onChange={(e) =>
          set("side", (e.target.value || undefined) as TradeFilter["side"])
        }
        className={selectStyle}
      >
        <option value="">All Sides</option>
        <option value="LONG">Long</option>
        <option value="SHORT">Short</option>
      </select>

      {/* Setup */}
      <select
        value={value.setup ?? ""}
        onChange={(e) => set("setup", e.target.value || undefined)}
        className={selectStyle}
      >
        <option value="">All Setups</option>
        {SETUPS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Outcome */}
      <select
        value={value.outcome ?? ""}
        onChange={(e) =>
          set("outcome", (e.target.value || undefined) as TradeFilter["outcome"])
        }
        className={selectStyle}
      >
        <option value="">All Outcomes</option>
        <option value="win">Wins</option>
        <option value="loss">Losses</option>
        <option value="open">Open</option>
      </select>

      <div className="w-px h-5 bg-white/10" />

      {/* Free-text search */}
      <input
        type="text"
        value={value.query ?? ""}
        onChange={(e) => set("query", e.target.value || undefined)}
        className={`${inputStyle} w-44`}
        placeholder="Search notes / symbol…"
      />

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-white/5 transition-colors"
        >
          Clear
        </button>
      )}

      {/* Setups + emotions hint (used by FormModal, not active filters yet) */}
      <span className="hidden">{SETUPS.join(",")}{EMOTIONS.join(",")}</span>
    </div>
  );
}

export { SETUPS, EMOTIONS, SYMBOLS };
