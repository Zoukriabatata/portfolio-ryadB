import { useGexStore } from "../../lib/gex/useGexStore";

function fmtGex(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtDistance(level: number | null, spot: number): string {
  if (level === null || !Number.isFinite(level)) return "";
  const diff = level - spot;
  const pct = (diff / spot) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
}

export function GexKeyLevels() {
  const snapshot = useGexStore((s) => s.snapshot);
  if (!snapshot) {
    return (
      <div className="gex-key-levels">
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Zero Gamma</div>
          <div className="gex-kpi-value">—</div>
        </div>
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Call Wall</div>
          <div className="gex-kpi-value">—</div>
        </div>
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Put Wall</div>
          <div className="gex-kpi-value">—</div>
        </div>
      </div>
    );
  }

  const totalChipClass =
    snapshot.totalGex >= 0
      ? "gex-kpi-total-chip gex-kpi-total-chip-positive"
      : "gex-kpi-total-chip gex-kpi-total-chip-negative";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span className={totalChipClass}>
          Total GEX · {fmtGex(snapshot.totalGex)}
        </span>
      </div>
      <div className="gex-key-levels">
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Zero Gamma</div>
          <div className="gex-kpi-value">
            {snapshot.zeroGamma !== null
              ? `$${snapshot.zeroGamma.toFixed(2)}`
              : "—"}
          </div>
          <div className="gex-kpi-sub">
            {fmtDistance(snapshot.zeroGamma, snapshot.spot)}
          </div>
        </div>
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Call Wall</div>
          <div className="gex-kpi-value">
            {snapshot.callWall !== null
              ? `$${snapshot.callWall.toFixed(2)}`
              : "—"}
          </div>
          <div className="gex-kpi-sub">
            {fmtDistance(snapshot.callWall, snapshot.spot)}
          </div>
        </div>
        <div className="gex-kpi-card">
          <div className="gex-kpi-label">Put Wall</div>
          <div className="gex-kpi-value">
            {snapshot.putWall !== null
              ? `$${snapshot.putWall.toFixed(2)}`
              : "—"}
          </div>
          <div className="gex-kpi-sub">
            {fmtDistance(snapshot.putWall, snapshot.spot)}
          </div>
        </div>
      </div>
    </>
  );
}
