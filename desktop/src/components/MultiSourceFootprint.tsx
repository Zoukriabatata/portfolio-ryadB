// Phase B / M3 — top-level footprint shell with a source selector.
//
// Switches between three live data backends without unmounting any
// of them: the operator can keep Rithmic logged in (broker session
// is expensive to recreate) while idly looking at Bybit/Binance, and
// flip back at any time. Each branch gets its own component
// instance; CryptoFootprint handles its own crypto_connect lifecycle
// per exchange.

import { useState } from "react";
import { RithmicFootprint } from "./RithmicFootprint";
import { CryptoFootprint } from "./CryptoFootprint";
import "./RithmicFootprint.css";
import "./MultiSourceFootprint.css";

type Source = "rithmic" | "bybit" | "binance";

const SOURCES: { value: Source; label: string }[] = [
  { value: "rithmic", label: "Rithmic (CME futures)" },
  { value: "bybit", label: "Bybit (linear perps)" },
  { value: "binance", label: "Binance (spot)" },
];

const DEFAULT_SYMBOLS: Record<Source, string> = {
  rithmic: "MNQM6",
  bybit: "BTCUSDT",
  binance: "BTCUSDT",
};

export function MultiSourceFootprint() {
  const [source, setSource] = useState<Source>("rithmic");

  return (
    <div className="multi-source-footprint">
      <nav className="msf-source-bar" aria-label="Data source">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`msf-source-btn ${
              source === s.value ? "msf-source-btn-active" : ""
            }`}
            onClick={() => setSource(s.value)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {source === "rithmic" ? (
        <RithmicFootprint />
      ) : (
        <div className="rithmic-footprint">
          <CryptoFootprint
            exchange={source}
            defaultSymbol={DEFAULT_SYMBOLS[source]}
          />
        </div>
      )}
    </div>
  );
}
