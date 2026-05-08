import { NavLink } from "react-router-dom";
import "./AppNavbar.css";

type BrokerStatus = "checking" | "connected" | "missing";

// Phase B / M1 — extended to 8 routes for the V1 Senzoukria migration.
// Heatmap / GEX / Volatility / Replay are placeholder routes today
// (see routes/PlaceholderRoute.tsx); they get filled in over M3-M9.
// Order matches the typical user funnel: orientation → real-time
// charts → analytics → replay → account.
const NAV_LINKS = [
  { to: "/", label: "Welcome", end: true },
  { to: "/live", label: "Live" },
  { to: "/footprint", label: "Footprint" },
  { to: "/heatmap", label: "Heatmap" },
  { to: "/gex", label: "GEX" },
  { to: "/volatility", label: "Volatility" },
  { to: "/replay", label: "Replay" },
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
        <span className="nav-brand-text">Senzoukria</span>
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
