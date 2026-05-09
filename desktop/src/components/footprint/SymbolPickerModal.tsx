// Phase B / M4.7a — symbol picker modal for the crypto branch.
//
// Backdrop click + Esc both close. Search is upper-case, matches
// against ticker (BTCUSDT) and label ("BTC / USDT") so a user can
// type "BTC" or "BTCUSDT" or "btc" interchangeably.
//
// The modal is render-only when `open` so React doesn't keep a
// hidden ref alive between sessions.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterSymbols,
  type CryptoExchange,
  type SymbolDef,
} from "../../lib/footprint/symbols";
import "./SymbolPickerModal.css";

type Props = {
  open: boolean;
  exchange: CryptoExchange;
  currentSymbol: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
};

const CATEGORY_ORDER: SymbolDef["category"][] = ["majors", "alts", "memes"];
const CATEGORY_LABEL: Record<SymbolDef["category"], string> = {
  majors: "Majors",
  alts: "Alts",
  memes: "Memes",
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

  // Reset the search box and grab focus on every open. setTimeout
  // because the input isn't mounted yet on the same tick.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  // Esc closes from anywhere. Listening on `window` keeps the
  // shortcut alive even when focus has wandered to a body element.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const grouped = useMemo(() => {
    const filtered = filterSymbols(exchange, query);
    const groups: Record<SymbolDef["category"], SymbolDef[]> = {
      majors: [],
      alts: [],
      memes: [],
    };
    for (const s of filtered) groups[s.category].push(s);
    return groups;
  }, [exchange, query]);

  if (!open) return null;

  const empty = CATEGORY_ORDER.every((c) => grouped[c].length === 0);

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
          <h3>
            Select symbol ·{" "}
            {exchange === "bybit" ? "Bybit Linear" : "Binance Spot"}
          </h3>
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
          placeholder="Search BTC, ETH, SOL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />

        <div className="sp-list">
          {CATEGORY_ORDER.map(
            (cat) =>
              grouped[cat].length > 0 && (
                <section key={cat} className="sp-section">
                  <h4 className="sp-cat">{CATEGORY_LABEL[cat]}</h4>
                  {grouped[cat].map((s) => {
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
                        {s.tickSizeHint !== undefined && (
                          <span className="sp-row-tick">
                            tick {s.tickSizeHint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </section>
              ),
          )}
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
