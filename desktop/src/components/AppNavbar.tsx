import { SenzoukriaLogo } from "./SenzoukriaLogo";
import { HamburgerMenu } from "./HamburgerMenu";
import "./AppNavbar.css";

type BrokerStatus = "checking" | "connected" | "missing";

export function AppNavbar({
  brokerStatus,
  brokerLabel,
  onOpenSettings,
}: {
  brokerStatus: BrokerStatus;
  brokerLabel: string | null;
  onOpenSettings: () => void;
}) {
  return (
    <nav className="app-navbar">
      <HamburgerMenu />

      <div className="nav-brand">
        <SenzoukriaLogo size={26} showText={false} />
        <span className="nav-brand-text">Senzoukria</span>
      </div>

      <div className="nav-status">
        <span
          className={`nav-broker-badge nav-broker-${brokerStatus}`}
          title={brokerLabel ?? undefined}
        >
          {brokerStatus === "connected"
            ? "CONNECTED"
            : brokerStatus === "missing"
              ? "No broker"
              : "…"}
        </span>
        <button
          type="button"
          className="nav-settings-link"
          onClick={onOpenSettings}
        >
          Edit broker settings
        </button>
      </div>
    </nav>
  );
}
