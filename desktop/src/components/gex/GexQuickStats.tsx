import { useGexStore } from "../../lib/gex/useGexStore";

function fmtBig(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtShares(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtOi(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

function colorByValue(n: number, invertSign = false): string {
  const v = invertSign ? -n : n;
  if (v > 0) return "qs-pos";
  if (v < 0) return "qs-neg";
  return "";
}

export function GexQuickStats() {
  const snapshot = useGexStore((s) => s.snapshot);
  if (!snapshot) return null;

  const pcr = snapshot.putCallRatio;
  // Skew positive = put-heavy (typical) — show green when positive
  // (healthy skew), red if inverted.
  const skew = snapshot.skew25Delta;

  return (
    <div className="qs-row">
      <div className="qs-card">
        <div className="qs-label">Total DEX</div>
        <div className={`qs-value ${colorByValue(snapshot.totalDex)}`}>
          {fmtShares(snapshot.totalDex)}
        </div>
        <div className="qs-sub">shares</div>
      </div>

      <div className="qs-card">
        <div className="qs-label">Total VEX</div>
        <div className="qs-value">{fmtBig(snapshot.totalVex)}</div>
        <div className="qs-sub">per vol-pt</div>
      </div>

      <div className="qs-card">
        <div className="qs-label">Theta Decay</div>
        <div className="qs-value qs-neg">{fmtBig(snapshot.totalTex)}</div>
        <div className="qs-sub">$/day</div>
      </div>

      <div className="qs-card">
        <div className="qs-label">Put/Call OI</div>
        <div className={`qs-value ${pcr === null ? "" : pcr > 1 ? "qs-neg" : "qs-pos"}`}>
          {pcr === null ? "—" : pcr.toFixed(2)}
        </div>
        <div className="qs-sub">
          {fmtOi(snapshot.totalPutOi)} / {fmtOi(snapshot.totalCallOi)}
        </div>
      </div>

      <div className="qs-card">
        <div className="qs-label">25Δ Skew</div>
        <div className={`qs-value ${skew === null ? "" : skew > 0 ? "qs-pos" : "qs-neg"}`}>
          {skew === null ? "—" : `${(skew * 100).toFixed(2)}%`}
        </div>
        <div className="qs-sub">put − call IV</div>
      </div>

      <div className="qs-card">
        <div className="qs-label">ATM IV</div>
        <div className="qs-value">
          {snapshot.atmIvFront === null
            ? "—"
            : `${(snapshot.atmIvFront * 100).toFixed(2)}%`}
        </div>
        <div className="qs-sub">front month</div>
      </div>
    </div>
  );
}
