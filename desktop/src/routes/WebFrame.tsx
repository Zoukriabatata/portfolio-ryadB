import { useEffect, useState } from "react";
import "./WebFrame.css";

// Composant partagé par LiveRoute + AccountRoute. On embed la webapp
// publique dans une <iframe> standard plutôt que d'ouvrir une seconde
// `tauri::WebviewWindow` parce que :
//   - une iframe partage le viewport et la chrome (navbar) avec le
//     reste de l'app — comportement attendu par l'utilisateur,
//   - une seconde WebviewWindow forcerait une fenêtre OS distincte,
//     ce qui n'est pas ce qu'on veut côté UX,
//   - la session NextAuth est de toute façon par-cookie, et
//     l'iframe est anonyme — donc l'auth cross-frame n'est pas
//     résolue ici (TODO Phase 7.8+).
//
// On affiche un fallback explicite si l'iframe n'a pas chargé après
// LOAD_TIMEOUT_MS — utile sur réseau coupé ou si Vercel renvoie un
// 5xx silencieux.

const LOAD_TIMEOUT_MS = 8000;

export function WebFrame({
  url,
  title,
  emptyHint,
}: {
  url: string;
  title: string;
  emptyHint?: string;
}) {
  type Status = "loading" | "loaded" | "timeout";
  const [status, setStatus] = useState<Status>("loading");
  // bumper used to force the iframe to remount on retry
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setStatus("loading");
    const timer = window.setTimeout(() => {
      setStatus((s) => (s === "loading" ? "timeout" : s));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [retryKey, url]);

  return (
    <div className="web-frame">
      {status === "timeout" && (
        <div className="web-frame-fallback">
          <h2>Cannot load {title}</h2>
          <p>
            {emptyHint ??
              "Check your connection or the backend status, then retry."}
          </p>
          <pre className="web-frame-url">{url}</pre>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      )}
      <iframe
        key={retryKey}
        title={title}
        src={url}
        className="web-frame-iframe"
        // Allow the embedded site to operate fully — popups for
        // Stripe checkout, modals, opener targeting, etc.
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-storage-access-by-user-activation"
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setStatus("loaded")}
      />
    </div>
  );
}
