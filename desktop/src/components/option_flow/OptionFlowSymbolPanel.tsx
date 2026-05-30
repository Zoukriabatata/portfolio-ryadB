import { useEffect, useMemo, useRef, useState } from "react";
import { useOptionFlowStore } from "../../lib/option_flow/useOptionFlowStore";
import {
  SYMBOL_CATEGORIES,
  ALL_SYMBOLS,
  lookupSymbolName,
  type SymbolEntry,
} from "../../lib/gex/symbols";

/** Same UX as GexSymbolPanel but bound to the option_flow store. */
export function OptionFlowSymbolPanel() {
  const symbol = useOptionFlowStore((s) => s.symbol);
  const setSymbol = useOptionFlowStore((s) => s.setSymbol);
  const loading = useOptionFlowStore((s) => s.loading);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return null;
    const match = (e: SymbolEntry) =>
      e.ticker.includes(q) || e.name.toUpperCase().includes(q);
    return ALL_SYMBOLS.filter(match);
  }, [query]);

  const pick = (ticker: string) => {
    setOpen(false);
    setQuery("");
    void setSymbol(ticker);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const t = query.trim().toUpperCase();
      if (t) pick(t);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const currentName = lookupSymbolName(symbol);

  return (
    <div className="of-symbol-panel" ref={containerRef}>
      <button
        type="button"
        className={`of-symbol-trigger ${open ? "of-symbol-trigger-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
      >
        <span className="of-symbol-trigger-ticker">{symbol}</span>
        {currentName && (
          <span className="of-symbol-trigger-name">{currentName}</span>
        )}
        <span className="of-symbol-trigger-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="of-symbol-popover" role="dialog">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search ticker or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="of-symbol-search"
          />

          <div className="of-symbol-list">
            {filtered ? (
              filtered.length === 0 ? (
                <div className="of-symbol-empty">
                  No match — press Enter to use{" "}
                  <span className="of-symbol-empty-ticker">
                    {query.toUpperCase()}
                  </span>{" "}
                  anyway.
                </div>
              ) : (
                <div className="of-symbol-group">
                  {filtered.map((s) => (
                    <SymbolRow
                      key={s.ticker}
                      entry={s}
                      active={s.ticker === symbol}
                      onPick={pick}
                    />
                  ))}
                </div>
              )
            ) : (
              SYMBOL_CATEGORIES.map((cat) => (
                <div key={cat.id} className="of-symbol-group">
                  <div className="of-symbol-group-label">{cat.label}</div>
                  <div className="of-symbol-group-items">
                    {cat.symbols.map((s) => (
                      <SymbolRow
                        key={s.ticker}
                        entry={s}
                        active={s.ticker === symbol}
                        onPick={pick}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SymbolRow({
  entry,
  active,
  onPick,
}: {
  entry: SymbolEntry;
  active: boolean;
  onPick: (t: string) => void;
}) {
  return (
    <button
      type="button"
      className={`of-symbol-row ${active ? "of-symbol-row-active" : ""}`}
      onClick={() => onPick(entry.ticker)}
    >
      <span className="of-symbol-row-ticker">{entry.ticker}</span>
      <span className="of-symbol-row-name">{entry.name}</span>
    </button>
  );
}
