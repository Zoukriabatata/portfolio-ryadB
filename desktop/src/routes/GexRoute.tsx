import { useEffect, useState } from "react";
import { useGexStore } from "../lib/gex/useGexStore";
import { useGexPolling } from "../lib/gex/useGexPolling";
import { hasApiKey } from "../lib/gex/api";
import { GexHeader } from "../components/gex/GexHeader";
import { GexKeyLevels } from "../components/gex/GexKeyLevels";
import { GexBarChart } from "../components/gex/GexBarChart";
import { GexIvSmile } from "../components/gex/GexIvSmile";
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

  return (
    <div className="gex-route">
      <GexHeader />
      {error && <div className="gex-error-banner">{error}</div>}
      <GexKeyLevels />
      <GexBarChart />
      <GexIvSmile />
    </div>
  );
}
