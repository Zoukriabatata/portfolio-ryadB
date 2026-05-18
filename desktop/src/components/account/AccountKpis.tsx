import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "kpi-progress-bar-danger";
  if (pct >= 60) return "kpi-progress-bar-warn";
  return "kpi-progress-bar-safe";
}

export function AccountKpis() {
  const stats = useAccountStore((s) => s.stats);

  // Daily PnL → progress toward the loss limit (limit is a negative
  // number, e.g. -2500). When dailyPnl is also negative we show how
  // much of that runway is consumed.
  const dailyPnl = stats?.dailyPnl ?? 0;
  const dailyLimit = stats?.dailyLossLimit ?? null;
  const dailyPctOfLimit =
    dailyLimit !== null && dailyLimit < 0 && dailyPnl < 0
      ? Math.min(100, (Math.abs(dailyPnl) / Math.abs(dailyLimit)) * 100)
      : 0;

  // Trailing drawdown remaining = balance - trailingDrawdown (the
  // floor balance Rithmic reports as `min_account_balance`).
  const balance = stats?.balance ?? 0;
  const trailing = stats?.trailingDrawdown ?? null;
  const trailingLimit = stats?.trailingDrawdownLimit ?? null;
  const trailingRemaining = trailing !== null ? balance - trailing : null;
  const trailingPctUsed =
    trailingLimit !== null && trailingRemaining !== null && trailingLimit > 0
      ? Math.min(100, Math.max(0, (1 - trailingRemaining / trailingLimit) * 100))
      : 0;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-card-label">Account Balance</div>
        <div className="kpi-card-value">
          {stats ? `$${stats.balance.toFixed(2)}` : "—"}
        </div>
        <div className="kpi-card-sub">
          Start of day: {stats ? `$${stats.startOfDayBalance.toFixed(2)}` : "—"}
        </div>
      </div>

      <div className="kpi-card">
        <div className="kpi-card-label">Daily PnL</div>
        <div
          className={`kpi-card-value ${
            dailyPnl >= 0 ? "kpi-card-value-pos" : "kpi-card-value-neg"
          }`}
        >
          {stats ? fmtMoney(stats.dailyPnl) : "—"}
        </div>
        {dailyLimit !== null && (
          <>
            <div className="kpi-card-sub">
              Daily limit {fmtMoney(dailyLimit)} · {dailyPctOfLimit.toFixed(0)}% used
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(dailyPctOfLimit)}`}
                style={{ width: `${dailyPctOfLimit}%` }}
              />
            </div>
          </>
        )}
      </div>

      <div className="kpi-card">
        <div className="kpi-card-label">Trailing DD Remaining</div>
        <div className="kpi-card-value">
          {trailingRemaining !== null ? `$${trailingRemaining.toFixed(2)}` : "—"}
        </div>
        {trailingLimit !== null && (
          <>
            <div className="kpi-card-sub">
              Limit ${trailingLimit.toFixed(0)} · {trailingPctUsed.toFixed(0)}% used
            </div>
            <div className="kpi-progress">
              <div
                className={`kpi-progress-bar ${progressColor(trailingPctUsed)}`}
                style={{ width: `${trailingPctUsed}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
