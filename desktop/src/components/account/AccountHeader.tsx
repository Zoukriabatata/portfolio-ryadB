import { useAccountStore } from "../../lib/account/useAccountStore";

export function AccountHeader() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeId = useAccountStore((s) => s.activeAccountId);
  const feedStatus = useAccountStore((s) => s.feedStatus);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);

  const statusLabel = feedStatus.toUpperCase();
  const statusClass =
    feedStatus === "connected" ? "account-header-status-connected" :
    feedStatus === "error" ? "account-header-status-error" : "";

  return (
    <div className="account-header">
      <span className="account-header-title">Account</span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {accounts.length > 1 && (
          <select
            className="account-picker"
            value={activeId ?? ""}
            onChange={(e) => setActiveAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.systemName || a.id} · {a.id}
              </option>
            ))}
          </select>
        )}
        {accounts.length === 1 && (
          <span className="account-picker">
            {accounts[0].systemName || accounts[0].id} · {accounts[0].id}
          </span>
        )}
        <span className={`account-header-status ${statusClass}`}>
          <span className="account-header-status-dot" />
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
