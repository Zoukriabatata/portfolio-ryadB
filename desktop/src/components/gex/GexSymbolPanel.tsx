import { useEffect, useMemo, useRef, useState } from "react";
import { useGexStore } from "../../lib/gex/useGexStore";
import {
  SYMBOL_CATEGORIES,
  ALL_SYMBOLS,
  lookupSymbolName,
  type SymbolEntry,
} from "../../lib/gex/symbols";

/** Click on the current symbol → opens a categorized search panel.
 *  Click outside or pick a symbol → closes. */
export function GexSymbolPanel() {
  const symbol = useGexStore((s) => s.symbol);
  const setSymbol = useGexStore((s) => s.setSymbol);
  const loading = useGexStore((s) => s.loading);
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
      // Submit the typed symbol as-is (allow free entry beyond curated list).
      const t = query.trim().toUpperCase();
      if (t) pick(t);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const currentName = lookupSymbolName(symbol);

  return (
    <div className="gex-symbol-panel" ref={containerRef}>
      <button
        type="button"
        className={`gex-symbol-trigger ${open ? "gex-symbol-trigger-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
      >
        <span className="gex-symbol-trigger-ticker">{symbol}</span>
        {currentName && (
          <span className="gex-symbol-trigger-name">{currentName}</span>
        )}
        <span className="gex-symbol-trigger-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="gex-symbol-popover" role="dialog">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search ticker or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="gex-symbol-search"
          />

          <div className="gex-symbol-list">
            {filtered ? (
              filtered.length === 0 ? (
                <div className="gex-symbol-empty">
                  No match — press Enter to use{" "}
                  <span className="gex-symbol-empty-ticker">
                    {query.toUpperCase()}
                  </span>{" "}
                  anyway.
                </div>
              ) : (
                <div className="gex-symbol-group">
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
                <div key={cat.id} className="gex-symbol-group">
                  <div className="gex-symbol-group-label">{cat.label}</div>
                  <div className="gex-symbol-group-items">
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
      className={`gex-symbol-row ${active ? "gex-symbol-row-active" : ""}`}
      onClick={() => onPick(entry.ticker)}
    >
      <span className="gex-symbol-row-ticker">{entry.ticker}</span>
      <span className="gex-symbol-row-name">{entry.name}</span>
    </button>
  );
}
