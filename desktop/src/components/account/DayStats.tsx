import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function DayStats() {
  const stats = useAccountStore((s) => s.dayStats);
  const wrPct = (stats.winRate * 100).toFixed(0);
  return (
    <div className="day-stats">
      <span className="day-stat-chip">
        <span className="day-stat-chip-label">Trades</span>
        {stats.tradesCount}
      </span>
      <span className="day-stat-chip">
        <span className="day-stat-chip-label">WR</span>
        {wrPct}%
      </span>
      <span className={`day-stat-chip ${stats.bestTrade >= 0 ? "day-stat-pos" : ""}`}>
        <span className="day-stat-chip-label">Best</span>
        {fmtMoney(stats.bestTrade)}
      </span>
      <span className={`day-stat-chip ${stats.worstTrade < 0 ? "day-stat-neg" : ""}`}>
        <span className="day-stat-chip-label">Worst</span>
        {fmtMoney(stats.worstTrade)}
      </span>
    </div>
  );
}
