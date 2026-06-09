// 2026-05-26 — Bridge NinjaTrader source added as a SECOND code path.
// 2026-06-09 — Quantower bridge added as a THIRD code path (port 7273).
// Switcher lives at the top of this wrapper; neither child owns the UX.

import { useCallback, useEffect, useState } from "react";
import { RithmicFootprint } from "./RithmicFootprint";
import { BridgeFootprint } from "./BridgeFootprint";
import { QuantowerFootprint } from "./QuantowerFootprint";
import "./RithmicFootprint.css";
import "./MultiSourceFootprint.css";

type DataSource = "rithmic" | "bridge" | "quantower";

const PREF_KEY = "orderflow.dataSource";

function readDataSourcePref(): DataSource {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === "bridge") return "bridge";
    if (v === "quantower") return "quantower";
    return "rithmic";
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

  const switchToBridge    = useCallback(() => setSource("bridge"),    []);
  const switchToQuantower = useCallback(() => setSource("quantower"), []);
  const switchToRithmic   = useCallback(() => setSource("rithmic"),   []);

  if (source === "bridge") {
    return (
      <div className="multi-source-footprint">
        <BridgeFootprint onSwitchToRithmic={switchToRithmic} />
      </div>
    );
  }

  if (source === "quantower") {
    return (
      <div className="multi-source-footprint">
        <QuantowerFootprint onSwitchToRithmic={switchToRithmic} />
      </div>
    );
  }

  return (
    <div className="multi-source-footprint">
      <RithmicFootprint
        onSwitchToBridge={switchToBridge}
        onSwitchToQuantower={switchToQuantower}
      />
    </div>
  );
}
