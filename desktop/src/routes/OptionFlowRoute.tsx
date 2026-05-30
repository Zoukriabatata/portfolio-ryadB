import { useEffect, useState } from "react";
import { hasApiKey } from "../lib/gex/api";
import { useOptionFlowStore } from "../lib/option_flow/useOptionFlowStore";
import { useOptionFlowPolling } from "../lib/option_flow/useOptionFlowPolling";
import { OptionFlowHeader } from "../components/option_flow/OptionFlowHeader";
import { OptionFlowStats } from "../components/option_flow/OptionFlowStats";
import { OptionFlowFilters } from "../components/option_flow/OptionFlowFilters";
import { OptionFlowTable } from "../components/option_flow/OptionFlowTable";
import "../components/option_flow/option_flow.css";

export function OptionFlowRoute() {
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasApiKey()
      .then(setKeyConfigured)
      .catch(() => setKeyConfigured(false));
  }, []);

  if (keyConfigured === false) {
    return (
      <div className="of-route">
        <div className="of-empty-state">
          <span className="of-empty-state-icon">◌</span>
          <div className="of-empty-state-title">Alpaca API keys required</div>
          <div className="of-empty-state-sub">
            Configure your free Alpaca paper trading keys (same as GEX) in
            Broker Settings to load the Option Flow feed.
          </div>
        </div>
      </div>
    );
  }

  if (keyConfigured === null) {
    return (
      <div className="of-route">
        <div className="of-empty-state">
          <span className="of-empty-state-icon">◌</span>
          <div className="of-empty-state-title">Loading…</div>
        </div>
      </div>
    );
  }

  return <OptionFlowConfigured />;
}

function OptionFlowConfigured() {
  useOptionFlowPolling();
  const error = useOptionFlowStore((s) => s.error);

  return (
    <div className="of-route">
      <OptionFlowHeader />
      {error && <div className="of-error-banner">{error}</div>}
      <OptionFlowStats />
      <OptionFlowFilters />
      <OptionFlowTable />
    </div>
  );
}
