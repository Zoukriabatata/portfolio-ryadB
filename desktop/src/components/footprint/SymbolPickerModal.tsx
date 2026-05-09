// Phase B / M4.7a + M5 — symbol picker modal.
//
// Multi-exchange aware: for crypto (bybit / binance) the sections are
// Majors / Alts / Memes; for rithmic (CME Group) they're Index Futures
// / Energy / Metals / Currencies. The CATEGORIES_BY_EXCHANGE map in
// `lib/footprint/symbols.ts` drives which sections to iterate.
//
// Backdrop click + Esc both close. Search is upper-case and matches
// ticker + label so "btc" / "BTCUSDT" / "Nasdaq" all work.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES_BY_EXCHANGE,
  filterSymbols,
  type Exchange,
  type SymbolCategory,
  type SymbolDef,
} from "../../lib/footprint/symbols";
import "./SymbolPickerModal.css";

type Props = {
  open: boolean;
  exchange: Exchange;
  currentSymbol: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
};

const EXCHANGE_LABEL: Record<Exchange, string> = {
  bybit: "Bybit Linear",
  binance: "Binance Spot",
  rithmic: "Rithmic CME",
};

const CATEGORY_LABEL: Record<SymbolCategory, string> = {
  majors: "Majors",
  alts: "Alts",
  memes: "Memes",
  indices: "Index Futures",
  energy: "Energy",
  metals: "Metals",
  currencies: "Currencies",
};

const SEARCH_PLACEHOLDER: Record<Exchange, string> = {
  bybit: "Search BTC, ETH, SOL…",
  binance: "Search BTC, ETH, SOL…",
  rithmic: "Search MNQ, ES, GC…",
};

export function SymbolPickerModal({
  open,
  exchange,
  currentSymbol,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const orderedCategories = CATEGORIES_BY_EXCHANGE[exchange];

  const grouped = useMemo(() => {
    const filtered = filterSymbols(exchange, query);
    const groups: Partial<Record<SymbolCategory, SymbolDef[]>> = {};
    for (const cat of orderedCategories) groups[cat] = [];
    for (const s of filtered) {
      const bucket = groups[s.category];
      if (bucket) bucket.push(s);
    }
    return groups;
  }, [exchange, query, orderedCategories]);

  if (!open) return null;

  const empty = orderedCategories.every(
    (c) => (grouped[c]?.length ?? 0) === 0,
  );

  return (
    <div className="sp-modal-backdrop" onClick={onClose}>
      <div
        className="sp-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Select symbol"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-modal-header">
          <h3>Select symbol · {EXCHANGE_LABEL[exchange]}</h3>
          <button
            type="button"
            onClick={onClose}
            className="sp-close"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <input
          ref={inputRef}
          className="sp-search"
          type="text"
          placeholder={SEARCH_PLACEHOLDER[exchange]}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />

        <div className="sp-list">
          {orderedCategories.map((cat) => {
            const items = grouped[cat] ?? [];
            if (items.length === 0) return null;
            return (
              <section key={cat} className="sp-section">
                <h4 className="sp-cat">{CATEGORY_LABEL[cat]}</h4>
                {items.map((s) => {
                  const isActive = s.symbol === currentSymbol;
                  return (
                    <button
                      key={`${s.exchange}-${s.symbol}`}
                      type="button"
                      className={`sp-row ${isActive ? "sp-row-active" : ""}`}
                      onClick={() => {
                        onSelect(s.symbol);
                        onClose();
                      }}
                    >
                      <span className="sp-row-label">{s.label}</span>
                      <span className="sp-row-sym">{s.symbol}</span>
                      {s.contractMonth && (
                        <span className="sp-row-contract">
                          {s.contractMonth}
                        </span>
                      )}
                      {s.tickSizeHint !== undefined && (
                        <span className="sp-row-tick">
                          tick {s.tickSizeHint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            );
          })}
          {empty && (
            <div className="sp-empty">
              No symbol matches &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
