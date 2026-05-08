import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./WebFrame.css";

// Composant partagé par LiveRoute + AccountRoute. Charge la webapp
// publique dans une <iframe>, mais via un bridge token côté Rust pour
// que la session NextAuth soit posée dans le contexte de l'iframe :
//
//   1. mount → invoke("cmd_get_bridge_url", { nextPath })
//   2. Rust → heartbeat() pour rotater le JWT (iat=now)
//          → build /api/auth/desktop-bridge?token=…&next=<path>
//   3. iframe.src = bridgeUrl
//   4. /api/auth/desktop-bridge → vérifie le JWT → set le cookie
//      `next-auth.session-token` → 302 vers `next`
//
// On choisit l'iframe plutôt qu'une seconde tauri::WebviewWindow pour
// garder l'UX dans un seul OS-window. Le compromis (cookies isolés
// par défaut) est résolu par le bridge.
//
// Si le bridge fail (réseau coupé, JWT invalide, sub annulée…) on
// surface l'erreur exacte via un fallback. Pas de masquage silencieux
// — l'utilisateur doit savoir pourquoi /live ou /account ne charge
// pas.

const LOAD_TIMEOUT_MS = 8000;

export function WebFrame({
  nextPath,
  title,
  emptyHint,
}: {
  /** Whitelisted path (e.g. "/live", "/account") that the bridge
   *  endpoint will redirect to after setting the cookie. */
  nextPath: string;
  title: string;
  emptyHint?: string;
}) {
  type Status =
    | { kind: "resolving" }
    | { kind: "loading"; url: string }
    | { kind: "loaded"; url: string }
    | { kind: "timeout"; url: string }
    | { kind: "failed"; error: string };

  const [status, setStatus] = useState<Status>({ kind: "resolving" });
  const [retryKey, setRetryKey] = useState(0);

  // Resolve the bridge URL via Rust. Re-runs on retry so the JWT we
  // hand to the bridge is always within the 60s freshness window.
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "resolving" });
    invoke<string>("cmd_get_bridge_url", { nextPath })
      .then((url) => {
        if (cancelled) return;
        setStatus({ kind: "loading", url });
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus({ kind: "failed", error: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [nextPath, retryKey]);

  // Watch for iframe-load timeout once we have a URL to point at.
  useEffect(() => {
    if (status.kind !== "loading") return;
    const timer = window.setTimeout(() => {
      setStatus((s) =>
        s.kind === "loading" ? { kind: "timeout", url: s.url } : s,
      );
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (status.kind === "resolving") {
    return (
      <div className="web-frame">
        <div className="web-frame-fallback">
          <p>Authenticating…</p>
        </div>
      </div>
    );
  }

  if (status.kind === "failed") {
    return (
      <div className="web-frame">
        <div className="web-frame-fallback">
          <h2>Cannot reach {title}</h2>
          <p>
            {emptyHint ??
              "Couldn't generate a session bridge. Check your connection."}
          </p>
          <pre className="web-frame-url">{status.error}</pre>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const url = status.url;

  return (
    <div className="web-frame">
      {status.kind === "timeout" && (
        <div className="web-frame-fallback">
          <h2>Cannot load {title}</h2>
          <p>
            {emptyHint ??
              "Check your connection or the backend status, then retry."}
          </p>
          <pre className="web-frame-url">{nextPath}</pre>
          <button type="button" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      )}
      <iframe
        key={retryKey}
        title={title}
        src={url}
        className="web-frame-iframe"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-storage-access-by-user-activation"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() =>
          setStatus((s) =>
            s.kind === "loading" || s.kind === "timeout"
              ? { kind: "loaded", url: s.url }
              : s,
          )
        }
      />
    </div>
  );
}
