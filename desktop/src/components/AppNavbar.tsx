import { SenzoukriaLogo } from "./SenzoukriaLogo";
import { HamburgerMenu } from "./HamburgerMenu";
import { WindowControls } from "./WindowControls";
import "./AppNavbar.css";

type BrokerStatus = "checking" | "connected" | "missing";

/**
 * Single top bar for the whole desktop app. With the native OS
 * titlebar removed (`decorations: false`), this bar IS the titlebar:
 * it hosts the drag region + window controls, and on the footprint
 * route the connector teleports its compact control row into the
 * `#app-toolbar-slot` node via a portal (see ToolbarSlot). The bar
 * itself carries `data-tauri-drag-region` so empty areas move the
 * window; interactive children stay clickable (Tauri only drags on
 * the element that owns the attribute).
 */
export function AppNavbar({
  brokerStatus,
  brokerLabel,
  onOpenSettings,
  onSlotRef,
}: {
  brokerStatus: BrokerStatus;
  brokerLabel: string | null;
  onOpenSettings: () => void;
  onSlotRef: (el: HTMLElement | null) => void;
}) {
  return (
    <nav className="app-navbar">
      <HamburgerMenu />

      <div className="nav-brand" data-tauri-drag-region>
        <SenzoukriaLogo size={22} showText={false} />
        <span className="nav-brand-text">Senzoukria</span>
      </div>

      {/* Footprint connectors portal their control row in here. Empty
          (and draggable) on every other route — the slot itself is a
          drag handle so the window stays movable even when the merged
          toolbar fills the bar. */}
      <div
        className="nav-toolbar-slot"
        id="app-toolbar-slot"
        ref={onSlotRef}
        data-tauri-drag-region
      />

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
        <WindowControls />
      </div>
    </nav>
  );
}
