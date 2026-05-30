// Phase B / M3 → Senzoukria simplification.
//
// Rithmic-only mode: the source switcher (Bybit / Binance / Rithmic)
// has been removed. We now route everything through Rithmic — CME
// futures for indices/energy/metals AND CME crypto futures
// (BTC, MBT, ETH, MET) for Bitcoin / Ether exposure.
//
// 2026-05-26 — Bridge NinjaTrader source added as a SECOND code path.
// Picks between Rithmic native (existing 2000-line component) and
// Bridge (focused new component) via a localStorage pref. The
// switcher lives at the top of this wrapper so neither child
// component owns the cross-source UX.

import { useCallback, useEffect, useState } from "react";
import { RithmicFootprint } from "./RithmicFootprint";
import { BridgeFootprint } from "./BridgeFootprint";
import "./RithmicFootprint.css";
import "./MultiSourceFootprint.css";

type DataSource = "rithmic" | "bridge";

const PREF_KEY = "orderflow.dataSource";

function readDataSourcePref(): DataSource {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "bridge" ? "bridge" : "rithmic";
  } catch {
    return "rithmic";
  }
}

function writeDataSourcePref(v: DataSource) {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    /* ignore */
  }
}

export function MultiSourceFootprint() {
  const [source, setSource] = useState<DataSource>(() => readDataSourcePref());

  useEffect(() => {
    writeDataSourcePref(source);
  }, [source]);

  const switchToBridge = useCallback(() => setSource("bridge"), []);
  const switchToRithmic = useCallback(() => setSource("rithmic"), []);

  return (
    <div className="multi-source-footprint">
      {source === "rithmic" ? (
        <RithmicWithBridgeOption onSwitchToBridge={switchToBridge} />
      ) : (
        <BridgeFootprint onSwitchToRithmic={switchToRithmic} />
      )}
    </div>
  );
}

// Wraps the existing Rithmic footprint with a small "Try NT Bridge"
// affordance. We intentionally do NOT touch RithmicFootprint.tsx —
// the switcher button is overlaid in a corner so the existing flow
// remains untouched. Cosmetic; the real switching logic is owned
// by the parent <MultiSourceFootprint>.
function RithmicWithBridgeOption({
  onSwitchToBridge,
}: {
  onSwitchToBridge: () => void;
}) {
  return (
    <div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0 }}>
      <button
        type="button"
        onClick={onSwitchToBridge}
        title="Use NinjaTrader Bridge — requires NinjaTrader running with the OrderflowBridge indicator on a Tick chart"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 50,
          background: "#1f2937",
          color: "#e5e7eb",
          border: "1px solid #374151",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        🔌 NT Bridge
      </button>
      <RithmicFootprint />
    </div>
  );
}
