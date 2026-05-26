import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number | null | undefined, withSign = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (withSign) {
    const sign = n >= 0 ? "+" : "-";
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }
  return `$${n.toFixed(2)}`;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "kpi-progress-bar-danger";
  if (pct >= 60) return "kpi-progress-bar-warn";
  return "kpi-progress-bar-safe";
}

export function AccountKpis() {
  const stats = useAccountStore((s) => s.stats);

  // Daily PnL : progress toward the loss limit. Loss limit is negative,
  // dailyPnl is negative when in drawdown — % used = |dailyPnl| / |limit|.
  const dailyPnl = stats?.dailyPnl ?? 0;
  const dailyLimit = stats?.dailyLossLimit ?? null;
  const dailyPctOfLimit =
    dailyLimit !== null && dailyLimit < 0 && dailyPnl < 0
      ? Math.min(100, (Math.abs(dailyPnl) / Math.abs(dailyLimit)) * 100)
      : 0;

  // Trailing drawdown — Apex/Rithmic reports `min_account_balance` =
  // the floor balance; remaining = current balance - floor.
  const balance = stats?.balance ?? 0;
  const trailing = stats?.trailingDrawdown ?? null;
  const trailingLimit = stats?.trailingDrawdownLimit ?? null;
  const trailingRemaining = trailing !== null ? balance - trailing : null;
  const trailingPctUsed =
    trailingLimit !== null && trailingRemaining !== null && trailingLimit > 0
      ? Math.min(100, Math.max(0, (1 - trailingRemaining / trailingLimit) * 100))
      : 0;

  const marginUsed = stats?.marginUsed ?? null;
  // Margin used vs balance — gives a rough % of capital deployed.
  const marginPct =
    marginUsed !== null && balance > 0
      ? Math.min(100, (marginUsed / balance) * 100)
      : 0;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-card-label">Daily PnL</div>
        <div
          className={`kpi-card-value ${
            dailyPnl >= 0 ? "kpi-card-value-pos" : "kpi-card-value-neg"
          }`}
        >
          {stats ? fmtMoney(stats.dailyPnl) : "—"}
        </div>
        {dailyLimit !== null ? (
          <>
            <div className="kpi-card-sub">
              Limit {fmtMoney(dailyLimit)} · {dailyPctOfLimit.toFixed(0)}% used
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(dailyPctOfLimit)}`}
                style={{ width: `${dailyPctOfLimit}%` }}
              />
            </div>
          </>
        ) : (
          <div className="kpi-card-sub">No daily loss limit reported.</div>
        )}
      </div>

      <div className="kpi-card">
        <div className="kpi-card-label">Trailing DD Remaining</div>
        <div className="kpi-card-value">
          {trailingRemaining !== null ? fmtMoney(trailingRemaining, false) : "—"}
        </div>
        {trailingLimit !== null ? (
          <>
            <div className="kpi-card-sub">
              Trail ${trailingLimit.toFixed(0)} · {trailingPctUsed.toFixed(0)}% used
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(trailingPctUsed)}`}
                style={{ width: `${trailingPctUsed}%` }}
              />
            </div>
          </>
        ) : (
          <div className="kpi-card-sub">No trailing drawdown reported.</div>
        )}
      </div>

      <div className="kpi-card">
        <div className="kpi-card-label">Margin Used</div>
        <div className="kpi-card-value">
          {marginUsed !== null ? fmtMoney(marginUsed, false) : "—"}
        </div>
        {marginUsed !== null && balance > 0 ? (
          <>
            <div className="kpi-card-sub">
              {marginPct.toFixed(1)}% of balance deployed
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(marginPct)}`}
                style={{ width: `${marginPct}%` }}
              />
            </div>
          </>
        ) : (
          <div className="kpi-card-sub">Flat. No margin in use.</div>
        )}
      </div>
    </div>
  );
}
