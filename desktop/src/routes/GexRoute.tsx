import { useEffect, useState } from "react";
import { useGexStore } from "../lib/gex/useGexStore";
import { useGexPolling } from "../lib/gex/useGexPolling";
import { hasApiKey, isOpra } from "../lib/gex/api";
import { GexHeader } from "../components/gex/GexHeader";
import { GexKeyLevels } from "../components/gex/GexKeyLevels";
import { GexQuickStats } from "../components/gex/GexQuickStats";
import { GexBarChart } from "../components/gex/GexBarChart";
import { GexIvSmile } from "../components/gex/GexIvSmile";
import { GexTermStructure } from "../components/gex/GexTermStructure";
import "../components/gex/gex.css";

export function GexRoute() {
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasApiKey()
      .then(setKeyConfigured)
      .catch(() => setKeyConfigured(false));
  }, []);

  if (keyConfigured === false) {
    return (
      <div className="gex-route">
        <div className="gex-empty-state">
          <span className="gex-empty-state-icon">◌</span>
          <div className="gex-empty-state-title">Alpaca API keys required</div>
          <div className="gex-empty-state-sub">
            Configure your free Alpaca paper trading keys in Broker Settings to
            load the GEX dashboard.
          </div>
        </div>
      </div>
    );
  }

  if (keyConfigured === null) {
    return (
      <div className="gex-route">
        <div className="gex-empty-state">
          <span className="gex-empty-state-icon">◌</span>
          <div className="gex-empty-state-title">Loading…</div>
        </div>
      </div>
    );
  }

  return <GexConfigured />;
}

function GexConfigured() {
  useGexPolling();
  const error = useGexStore((s) => s.error);
  const [opraMode, setOpraMode] = useState(false);

  useEffect(() => {
    void isOpra().then(setOpraMode).catch(() => {/* keep false */});
  }, []);

  return (
    <div className="gex-route">
      <GexHeader />
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 16px 4px" }}>
        {opraMode ? (
          <span style={{ background: "#14532d", color: "#22c55e", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.05em" }}>
            LIVE OPRA
          </span>
        ) : (
          <span style={{ background: "#1a1f2e", color: "#8a8f99", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>
            15 min delay
          </span>
        )}
      </div>
      {error && <div className="gex-error-banner">{error}</div>}
      <GexKeyLevels />
      <GexQuickStats />
      <GexBarChart />
      <div className="gex-iv-row">
        <GexIvSmile />
        <GexTermStructure />
      </div>
    </div>
  );
}
