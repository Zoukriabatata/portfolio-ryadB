import { useOptionFlowStore } from "../../lib/option_flow/useOptionFlowStore";

const PREMIUM_PRESETS = [
  { label: "Any", value: 0 },
  { label: "≥$10K", value: 10_000 },
  { label: "≥$50K", value: 50_000 },
  { label: "≥$100K", value: 100_000 },
  { label: "≥$500K", value: 500_000 },
];

const SIZE_PRESETS = [
  { label: "Any", value: 0 },
  { label: "≥10", value: 10 },
  { label: "≥50", value: 50 },
  { label: "≥250", value: 250 },
];

export function OptionFlowFilters() {
  const minPremium = useOptionFlowStore((s) => s.minPremium);
  const minSize = useOptionFlowStore((s) => s.minSize);
  const contractFilter = useOptionFlowStore((s) => s.contractFilter);
  const sideFilter = useOptionFlowStore((s) => s.sideFilter);
  const setMinPremium = useOptionFlowStore((s) => s.setMinPremium);
  const setMinSize = useOptionFlowStore((s) => s.setMinSize);
  const setContractFilter = useOptionFlowStore((s) => s.setContractFilter);
  const setSideFilter = useOptionFlowStore((s) => s.setSideFilter);

  return (
    <div className="of-filters">
      <div className="of-filter-group">
        <span className="of-filter-label">Premium</span>
        <div className="of-filter-pills">
          {PREMIUM_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`of-filter-pill ${minPremium === p.value ? "of-filter-pill-active" : ""}`}
              onClick={() => setMinPremium(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="of-filter-group">
        <span className="of-filter-label">Size</span>
        <div className="of-filter-pills">
          {SIZE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`of-filter-pill ${minSize === p.value ? "of-filter-pill-active" : ""}`}
              onClick={() => setMinSize(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="of-filter-group">
        <span className="of-filter-label">Type</span>
        <div className="of-filter-pills">
          <button
            type="button"
            className={`of-filter-pill ${contractFilter === "all" ? "of-filter-pill-active" : ""}`}
            onClick={() => setContractFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`of-filter-pill of-filter-pill-call ${contractFilter === "call" ? "of-filter-pill-active" : ""}`}
            onClick={() => setContractFilter("call")}
          >
            Calls
          </button>
          <button
            type="button"
            className={`of-filter-pill of-filter-pill-put ${contractFilter === "put" ? "of-filter-pill-active" : ""}`}
            onClick={() => setContractFilter("put")}
          >
            Puts
          </button>
        </div>
      </div>

      <div className="of-filter-group">
        <span className="of-filter-label">Side</span>
        <div className="of-filter-pills">
          <button
            type="button"
            className={`of-filter-pill ${sideFilter === "all" ? "of-filter-pill-active" : ""}`}
            onClick={() => setSideFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`of-filter-pill of-filter-pill-buy ${sideFilter === "buy" ? "of-filter-pill-active" : ""}`}
            onClick={() => setSideFilter("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            className={`of-filter-pill of-filter-pill-sell ${sideFilter === "sell" ? "of-filter-pill-active" : ""}`}
            onClick={() => setSideFilter("sell")}
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}
