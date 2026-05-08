import { NavLink } from "react-router-dom";
import "./AppNavbar.css";

type BrokerStatus = "checking" | "connected" | "missing";

const NAV_LINKS = [
  { to: "/", label: "Welcome", end: true },
  { to: "/footprint", label: "Footprint" },
  { to: "/live", label: "Live" },
  { to: "/account", label: "Account" },
];

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
      <div className="nav-brand">
        <span className="nav-brand-icon" aria-hidden>
          ⚡
        </span>
        <span className="nav-brand-text">OrderflowV2</span>
      </div>

      <ul className="nav-links">
        {NAV_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link-active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>

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
