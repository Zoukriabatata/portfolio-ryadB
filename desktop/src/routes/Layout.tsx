import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { AppNavbar } from "../components/AppNavbar";
import { BrokerSettings } from "../components/BrokerSettings";
import { MultiSourceFootprint } from "../components/MultiSourceFootprint";
import { useSession } from "../lib/auth/SessionContext";
import { ToolbarSlotContext } from "../lib/ui/ToolbarSlot";

// Projection redacted (sans password) renvoyée par load_broker_credentials.
// Le shape est dupliqué ici plutôt qu'importé pour éviter une dépendance
// croisée avec BrokerSettings.tsx — la source de vérité reste le côté
// Rust (BrokerCredentialsRedacted dans brokers/credentials.rs).
type RedactedCreds = {
  preset: string;
  gatewayUrl: string;
  systemName: string;
  username: string;
  hasPassword: boolean;
};

type BrokerStatus = "checking" | "connected" | "missing";

/**
 * Shell global de l'app post-login : monte la navbar en haut,
 * délègue le contenu aux routes enfants via <Outlet />, et héberge
 * une modale BrokerSettings accessible depuis n'importe quelle route.
 *
 * Le modèle "Layout en tant que route parente" est l'idiome
 * react-router v6+ pour partager une chrome entre plusieurs vues.
 */
export function Layout() {
  const [status, setStatus] = useState<BrokerStatus>("checking");
  const [label, setLabel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Published by AppNavbar's slot <div> — the portal target the
  // footprint connectors render their merged control row into.
  // State (not a ref) so consumers re-render once the node mounts.
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const location = useLocation();
  const session = useSession();
  // Footprint is the heaviest route to (re-)bootstrap — bridge TCP
  // socket / Rithmic subscription + history snapshot fetch + canvas
  // setup. Mounting it persistently at the Layout level lets the user
  // navigate away (Option Flow, GEX, News…) and come back without
  // re-paying any of that cost. The pane is hidden via display:none
  // when off-route; the IPC listener stays subscribed and bars keep
  // accumulating in the cache so coming back is instant.
  // Gated on `session` so the bridge/Rithmic connection only fires
  // post-login.
  const onFootprint = location.pathname.startsWith("/footprint");

  const refresh = useCallback(async () => {
    try {
      const creds = await invoke<RedactedCreds | null>(
        "load_broker_credentials",
      );
      if (creds) {
        setStatus("connected");
        setLabel(`${creds.systemName} · ${creds.username}`);
      } else {
        setStatus("missing");
        setLabel(null);
      }
    } catch (e) {
      console.warn("load_broker_credentials failed:", e);
      setStatus("missing");
      setLabel(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Esc ferme la modale — pattern UX standard.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  return (
    <div className="app-shell">
      <AppNavbar
        brokerStatus={status}
        brokerLabel={label}
        onOpenSettings={() => setSettingsOpen(true)}
        onSlotRef={setToolbarSlot}
      />
      {/* Expose the toolbar slot ONLY on the footprint route. The
          footprint pane stays mounted across routes (display:none when
          off-route), so without this gate its connector would keep
          portaling its control row into the bar on every page. */}
      <ToolbarSlotContext.Provider value={onFootprint ? toolbarSlot : null}>
      <main className="app-main">
        {/* Persistent footprint pane — mounted once per session, kept
            alive across route changes. Hidden via display:none when
            the user isn't on /footprint so the listener and bars
            cache survive. */}
        {session && (
          <div
            style={{
              display: onFootprint ? "flex" : "none",
              flex: 1,
              minHeight: 0,
              flexDirection: "column",
            }}
          >
            <MultiSourceFootprint />
          </div>
        )}
        {/* Other routes via Outlet. Hidden when the user is on
            /footprint so the persistent pane above takes the full
            viewport. */}
        <div
          style={{
            display: onFootprint ? "none" : "flex",
            flex: 1,
            minHeight: 0,
            flexDirection: "column",
          }}
        >
          <Outlet />
        </div>
      </main>
      </ToolbarSlotContext.Provider>
      {settingsOpen && (
        <div
          className="app-modal-backdrop"
          onClick={() => {
            setSettingsOpen(false);
            void refresh();
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <BrokerSettings
              onSaved={() => {
                void refresh();
                setSettingsOpen(false);
              }}
              onClose={() => {
                setSettingsOpen(false);
                void refresh();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
