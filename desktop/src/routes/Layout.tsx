import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { AppNavbar } from "../components/AppNavbar";
import { BrokerSettings } from "../components/BrokerSettings";

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
      />
      <Outlet />
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
