import { useAccountStore } from "../lib/account/useAccountStore";
import { useAccountFeed } from "../lib/account/useAccountFeed";
import { AccountHeader } from "../components/account/AccountHeader";
import { AccountKpis } from "../components/account/AccountKpis";
import { PositionsTable } from "../components/account/PositionsTable";
import { WorkingOrdersTable } from "../components/account/WorkingOrdersTable";
import { EquityCurve } from "../components/account/EquityCurve";
import { DayStats } from "../components/account/DayStats";
import "../components/account/account.css";

export function AccountRoute() {
  useAccountFeed();
  const error = useAccountStore((s) => s.error);
  const accounts = useAccountStore((s) => s.accounts);
  const feedStatus = useAccountStore((s) => s.feedStatus);

  // First-mount loading state — before account_list returns.
  if (feedStatus === "disconnected" && accounts.length === 0 && !error) {
    return (
      <div className="account-route">
        <div className="account-empty-state">
          <div className="account-empty-state-title">Connecting to Rithmic…</div>
          <div>Fetching your accounts and starting live feed.</div>
        </div>
      </div>
    );
  }

  // No accounts at all (e.g. broker creds not configured, or login
  // returned an empty list).
  if (accounts.length === 0 && error) {
    return (
      <div className="account-route">
        <div className="account-empty-state">
          <div className="account-empty-state-title">No accounts available</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-route">
      <AccountHeader />
      {error && <div className="account-error-banner">{error}</div>}
      <AccountKpis />
      <div className="account-split">
        <PositionsTable />
        <WorkingOrdersTable />
      </div>
      <div className="account-bottom">
        <EquityCurve />
        <DayStats />
      </div>
    </div>
  );
}
