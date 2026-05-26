import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Tiny circular gauge — 60×60 SVG, stroke from 0 to (winRate × 100)%. */
function WinRateGauge({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, value)));
  const pct = (value * 100).toFixed(0);
  const color =
    value >= 0.6 ? "#22c55e" : value >= 0.4 ? "#f5a623" : "#9ca3af";
  return (
    <div className="wr-gauge">
      <svg width={64} height={64} viewBox="0 0 64 64" aria-label={`Win rate ${pct}%`}>
        <circle
          cx={32} cy={32} r={r}
          fill="none" stroke="#1f1f1f" strokeWidth={6}
        />
        <circle
          cx={32} cy={32} r={r}
          fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
        <text
          x="50%" y="54%"
          textAnchor="middle"
          fontFamily="inherit"
          fontSize="13"
          fontWeight={700}
          fill={color}
        >
          {pct}%
        </text>
      </svg>
      <span className="wr-gauge-label">Win Rate</span>
    </div>
  );
}

export function DayStats() {
  const stats = useAccountStore((s) => s.dayStats);
  const hasTrades = stats.tradesCount > 0;

  return (
    <div className="day-stats-wrap">
      <div className="day-stats-title">Day Stats</div>
      <div className="day-stats-body">
        <WinRateGauge value={stats.winRate} />
        <div className="day-stats-cells">
          <div className="day-stat-cell">
            <span className="day-stat-cell-label">Trades</span>
            <span className="day-stat-cell-value">{stats.tradesCount}</span>
          </div>
          <div className="day-stat-cell">
            <span className="day-stat-cell-label">Best</span>
            <span
              className={`day-stat-cell-value ${
                hasTrades && stats.bestTrade > 0 ? "day-stat-pos" : ""
              }`}
            >
              {hasTrades ? fmtMoney(stats.bestTrade) : "—"}
            </span>
          </div>
          <div className="day-stat-cell">
            <span className="day-stat-cell-label">Worst</span>
            <span
              className={`day-stat-cell-value ${
                hasTrades && stats.worstTrade < 0 ? "day-stat-neg" : ""
              }`}
            >
              {hasTrades ? fmtMoney(stats.worstTrade) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
