import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function DayStats() {
  const stats = useAccountStore((s) => s.dayStats);
  const wrPct = (stats.winRate * 100).toFixed(0);

  return (
    <div className="day-stats-wrap">
      <div className="day-stats-title">Day Stats</div>
      <div className="day-stats">
        <div className="day-stat-cell">
          <span className="day-stat-cell-label">Trades</span>
          <span className="day-stat-cell-value">{stats.tradesCount}</span>
        </div>
        <div className="day-stat-cell">
          <span className="day-stat-cell-label">Win Rate</span>
          <span className="day-stat-cell-value">{wrPct}%</span>
        </div>
        <div className="day-stat-cell">
          <span className="day-stat-cell-label">Best Trade</span>
          <span
            className={`day-stat-cell-value ${
              stats.bestTrade > 0 ? "day-stat-pos" : ""
            }`}
          >
            {stats.tradesCount > 0 ? fmtMoney(stats.bestTrade) : "—"}
          </span>
        </div>
        <div className="day-stat-cell">
          <span className="day-stat-cell-label">Worst Trade</span>
          <span
            className={`day-stat-cell-value ${
              stats.worstTrade < 0 ? "day-stat-neg" : ""
            }`}
          >
            {stats.tradesCount > 0 ? fmtMoney(stats.worstTrade) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
