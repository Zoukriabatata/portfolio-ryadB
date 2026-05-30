import { useMemo } from "react";
import { useOptionFlowStore } from "../../lib/option_flow/useOptionFlowStore";

function fmtMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function OptionFlowStats() {
  const trades = useOptionFlowStore((s) => s.trades);

  const stats = useMemo(() => {
    let callPrem = 0;
    let putPrem = 0;
    let mega = 0;
    let biggest = 0;
    let buyPrem = 0;
    let sellPrem = 0;
    for (const t of trades) {
      if (t.contractType === "call") callPrem += t.premium;
      else putPrem += t.premium;
      if (t.premium >= 500_000) mega++;
      if (t.premium > biggest) biggest = t.premium;
      if (t.side === "buy") buyPrem += t.premium;
      else if (t.side === "sell") sellPrem += t.premium;
    }
    const total = callPrem + putPrem;
    const callPct = total > 0 ? (callPrem / total) * 100 : 0;
    const putPct = total > 0 ? (putPrem / total) * 100 : 0;
    const pcRatio = callPrem > 0 ? putPrem / callPrem : null;
    return {
      total,
      callPrem,
      putPrem,
      callPct,
      putPct,
      pcRatio,
      mega,
      biggest,
      buyPrem,
      sellPrem,
    };
  }, [trades]);

  return (
    <div className="of-stats">
      <div className="of-stat-card">
        <div className="of-stat-label">Total premium</div>
        <div className="of-stat-value">{fmtMoney(stats.total)}</div>
        <div className="of-stat-bar">
          <div
            className="of-stat-bar-call"
            style={{ width: `${stats.callPct}%` }}
          />
          <div
            className="of-stat-bar-put"
            style={{ width: `${stats.putPct}%` }}
          />
        </div>
        <div className="of-stat-sub">
          <span className="of-stat-sub-call">
            C {fmtMoney(stats.callPrem)}
          </span>
          <span className="of-stat-sub-put">P {fmtMoney(stats.putPrem)}</span>
        </div>
      </div>

      <div className="of-stat-card">
        <div className="of-stat-label">Put / Call premium</div>
        <div
          className={`of-stat-value ${
            stats.pcRatio === null
              ? ""
              : stats.pcRatio > 1
              ? "of-stat-value-neg"
              : "of-stat-value-pos"
          }`}
        >
          {stats.pcRatio === null ? "—" : stats.pcRatio.toFixed(2)}
        </div>
        <div className="of-stat-sub">
          {stats.pcRatio === null
            ? "no data"
            : stats.pcRatio > 1
            ? "put-heavy"
            : "call-heavy"}
        </div>
      </div>

      <div className="of-stat-card">
        <div className="of-stat-label">Buy / Sell flow</div>
        <div className="of-stat-value of-stat-value-split">
          <span className="of-stat-value-pos">{fmtMoney(stats.buyPrem)}</span>
          <span className="of-stat-divider">/</span>
          <span className="of-stat-value-neg">{fmtMoney(stats.sellPrem)}</span>
        </div>
        <div className="of-stat-sub">aggressor side</div>
      </div>

      <div className="of-stat-card">
        <div className="of-stat-label">Biggest trade</div>
        <div className="of-stat-value of-stat-value-pos">
          {fmtMoney(stats.biggest)}
        </div>
        <div className="of-stat-sub">
          {stats.mega} mega ({"≥"}$500K)
        </div>
      </div>
    </div>
  );
}
