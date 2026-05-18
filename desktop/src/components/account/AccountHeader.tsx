import { useAccountStore } from "../../lib/account/useAccountStore";

function fmtBalance(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AccountHeader() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeId = useAccountStore((s) => s.activeAccountId);
  const feedStatus = useAccountStore((s) => s.feedStatus);
  const stats = useAccountStore((s) => s.stats);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);

  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  const statusClass =
    feedStatus === "connected" ? "account-hero-status-connected" :
    feedStatus === "error" ? "account-hero-status-error" : "";

  return (
    <div className="account-hero">
      <div className="account-hero-left">
        <div className="account-hero-badge">
          <span className="account-hero-badge-label">Active Account</span>
          {accounts.length > 1 ? (
            <select
              className="account-hero-picker"
              value={activeId ?? ""}
              onChange={(e) => setActiveAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} · {a.systemName}
                </option>
              ))}
            </select>
          ) : active ? (
            <div className="account-hero-id">
              <span className="account-hero-id-main">{active.id}</span>
              <span className="account-hero-id-sub">{active.systemName}</span>
            </div>
          ) : (
            <div className="account-hero-id">
              <span className="account-hero-id-main">—</span>
            </div>
          )}
        </div>
      </div>

      <div className="account-hero-balance">
        <span className="account-hero-balance-label">Net Liquidation</span>
        <span className="account-hero-balance-value">
          {fmtBalance(stats?.balance)}
        </span>
        {stats && (
          <span className="account-hero-balance-sub">
            SOD ${stats.startOfDayBalance.toFixed(2)} ·
            {" "}
            <span className={stats.dailyPnl >= 0 ? "day-stat-pos" : "day-stat-neg"}>
              {stats.dailyPnl >= 0 ? "+" : "-"}${Math.abs(stats.dailyPnl).toFixed(2)} today
            </span>
          </span>
        )}
      </div>

      <div className={`account-hero-status ${statusClass}`}>
        <span className="account-hero-status-dot" />
        <span className="account-hero-status-label">
          {feedStatus === "connected" ? "Live" : feedStatus.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
