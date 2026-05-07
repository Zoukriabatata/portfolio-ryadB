import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { WelcomeScreen } from "./WelcomeScreen";
import { useUpdateCheck, UpdateModal } from "./UpdateChecker";
import "./App.css";

interface LicenseSnapshot {
  license_key:     string;
  status:          string;
  max_machines:    number;
  active_machines: number;
}

interface Session {
  token:      string;
  expires_at: string;
  license:    LicenseSnapshot;
}

type HandoffState = { phase: 'loading' | 'failed'; token: string };

const API_BASE     = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000';
const HEARTBEAT_MS = 4 * 60 * 60 * 1000; // 4h

function App() {
  const [session, setSession]     = useState<Session | null>(null);
  const [machineId, setMachineId] = useState<string>("");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [handoff, setHandoff]     = useState<HandoffState | null>(null);
  const [firstLaunchCompleted, setFirstLaunchCompleted] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // Updater check fires once bootstrap is done. Auto-handoff (below) is
  // gated on `updateChecked && (no update || dismissed)` so the modal
  // takes precedence over the bridge to the web dashboard.
  const { update, checked: updateChecked } = useUpdateCheck(true);

  // Load any persisted session + machineId on mount.
  useEffect(() => {
    (async () => {
      try {
        const s = await invoke<Session | null>("cmd_get_session");
        setSession(s);
      } catch (e) {
        console.error("get_session failed", e);
      }
      try {
        const id = await invoke<string>("cmd_get_machine_id");
        setMachineId(id);
      } catch (e) {
        console.error("get_machine_id failed", e);
      }
      try {
        const flag = await invoke<boolean>("cmd_get_first_launch_completed");
        setFirstLaunchCompleted(flag);
      } catch (e) {
        console.error("get_first_launch_completed failed", e);
        // On IPC failure, default to dismissed — less annoying than
        // re-showing the welcome on every launch when the bridge is broken.
        setFirstLaunchCompleted(true);
      }
      setBootstrapped(true);
    })();
  }, []);

  // If a session was restored from storage at boot, re-bridge directly
  // to the web dashboard. The Welcome screen never shows in normal flow.
  // Gated on `updateChecked && !pendingUpdate` so a queued update modal
  // can render BEFORE the webview takes over the React tree.
  useEffect(() => {
    if (!bootstrapped || !session || handoff) return;
    if (!updateChecked) return;
    if (update && !updateDismissed) return;
    setHandoff({ phase: 'loading', token: session.token });
  }, [bootstrapped, session, handoff, updateChecked, update, updateDismissed]);

  // Run the actual handoff (with cleanup on unmount / re-trigger).
  useEffect(() => {
    if (!handoff || handoff.phase !== 'loading') return;
    return navigateBridge(handoff.token, setHandoff);
  }, [handoff]);

  // Periodic heartbeat — refreshes the JWT every 4h while the app is open.
  useEffect(() => {
    if (!session) return;
    const tick = async () => {
      try {
        const refreshed = await invoke<{ token: string; expiresAt: string; license: LicenseSnapshot }>("cmd_heartbeat");
        setSession({ token: refreshed.token, expires_at: refreshed.expiresAt, license: refreshed.license });
      } catch (e) {
        console.warn("heartbeat failed", e);
        const msg = String(e);
        if (msg.includes("NOT_SUBSCRIBED") ||
            msg.includes("LICENSE_INACTIVE") ||
            msg.includes("LICENSE_NOT_FOUND") ||
            msg.includes("MACHINE_NOT_FOUND") ||
            msg.includes("EXPIRED") ||
            msg.includes("INVALID_SIGNATURE") ||
            msg.includes("LICENSE_MISMATCH")) {
          await invoke("cmd_logout").catch(() => {});
          setSession(null);
        }
      }
    };
    const id = window.setInterval(tick, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [session]);

  if (!bootstrapped) return <main className="boot">Loading…</main>;

  // Update modal takes precedence over every other branch — the user
  // installs or dismisses before the app proceeds. This is the only
  // reliable mount point: by the time `handoff` fires, navigateBridge
  // is about to swap the entire webview to the Vercel /live page.
  if (update && !updateDismissed) {
    return (
      <main className="container">
        <UpdateModal update={update} onDismiss={() => setUpdateDismissed(true)} />
      </main>
    );
  }

  if (handoff) return (
    <main className="container">
      <HandoffSplash
        phase={handoff.phase}
        onRetry={() => setHandoff({ phase: 'loading', token: handoff.token })}
      />
    </main>
  );

  if (!session && !firstLaunchCompleted) {
    return (
      <main className="container">
        <WelcomeScreen onDismiss={() => setFirstLaunchCompleted(true)} />
      </main>
    );
  }

  return (
    <main className="container">
      {session ? (
        <Welcome
          session={session}
          machineId={machineId}
          onLogout={async () => { await invoke("cmd_logout"); setSession(null); }}
        />
      ) : (
        <Login onLogin={(s) => {
          setSession(s);
          setHandoff({ phase: 'loading', token: s.token });
        }} />
      )}
    </main>
  );
}

/**
 * After license/login the desktop hands off to the web backend's
 * /api/auth/desktop-bridge so the webview gets a NextAuth session
 * cookie and lands on /live. Splash is shown 1s minimum; if the
 * navigation hasn't taken over after another 5s we surface a Retry
 * control. Returns a cleanup that cancels both timers — designed to
 * be the body of a useEffect (React strict-mode safe).
 */
function navigateBridge(
  token: string,
  setHandoff: (h: HandoffState | null) => void,
): () => void {
  const url = `${API_BASE}/api/auth/desktop-bridge`
    + `?token=${encodeURIComponent(token)}`
    + `&next=${encodeURIComponent('/live')}`;

  let failTimerId: number | null = null;

  const navTimerId = window.setTimeout(() => {
    failTimerId = window.setTimeout(() => {
      setHandoff({ phase: 'failed', token });
    }, 5000);
    window.location.href = url;
  }, 1000);

  return () => {
    window.clearTimeout(navTimerId);
    if (failTimerId !== null) window.clearTimeout(failTimerId);
  };
}

function HandoffSplash({
  phase, onRetry,
}: {
  phase: 'loading' | 'failed';
  onRetry: () => void;
}) {
  return (
    <div className="card">
      <h1>{phase === 'loading' ? 'Loading dashboard…' : 'Connection failed'}</h1>
      {phase === 'loading'
        ? <p className="muted">Setting up your secure session.</p>
        : (
          <>
            <p className="muted">Could not reach the dashboard. Check your connection and retry.</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </>
        )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await invoke<{ token: string; expiresAt: string; license: LicenseSnapshot }>(
        "cmd_login",
        { email: email.trim(), password },
      );
      onLogin({ token: resp.token, expires_at: resp.expiresAt, license: resp.license });
    } catch (raw) {
      const msg = String(raw);
      setError(prettifyError(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h1>OrderflowV2</h1>
      <p className="muted">Sign in with your web account to unlock the desktop app.</p>

      <label>
        <span>Email</span>
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={busy}
        />
      </label>

      <label>
        <span>Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          disabled={busy}
        />
      </label>

      {error && <div className="error">{error}</div>}

      <button type="submit" disabled={busy || !email || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="muted small">
        No account yet?{" "}
        <button
          type="button"
          className="link"
          onClick={() => {
            void openUrl("https://orderflow-v2.vercel.app/auth/register").catch(err =>
              console.error("openUrl failed:", err),
            );
          }}
        >
          Sign up on the web
        </button>
      </p>
    </form>
  );
}

function Welcome({
  session,
  machineId,
  onLogout,
}: {
  session: Session;
  machineId: string;
  onLogout: () => void;
}) {
  const expires = new Date(session.expires_at);
  return (
    <div className="card">
      <h1>Welcome back</h1>
      <p className="muted">Your desktop license is active.</p>

      <dl>
        <dt>License key</dt>
        <dd><code>{session.license.license_key}</code></dd>

        <dt>Status</dt>
        <dd>{session.license.status}</dd>

        <dt>Machines in use</dt>
        <dd>{session.license.active_machines} / {session.license.max_machines}</dd>

        <dt>This machine</dt>
        <dd><code>{machineId.slice(0, 16)}…</code></dd>

        <dt>Token expires</dt>
        <dd>{expires.toLocaleString()}</dd>
      </dl>

      <button type="button" onClick={onLogout}>Sign out</button>
    </div>
  );
}

function prettifyError(raw: string): string {
  if (raw.includes("INVALID_CREDENTIALS"))   return "Invalid email or password.";
  if (raw.includes("ACCOUNT_LOCKED"))        return "Account temporarily locked. Try again in a few minutes.";
  if (raw.includes("NOT_SUBSCRIBED"))        return "A PRO subscription is required to use the desktop app.";
  if (raw.includes("SUBSCRIPTION_EXPIRED"))  return "Your subscription has expired.";
  if (raw.includes("LICENSE_INACTIVE"))      return "Your license is suspended. Contact support.";
  if (raw.includes("MAX_MACHINES_REACHED"))  return "This license is already in use on the maximum number of machines.";
  if (raw.includes("network error"))         return "Network error — is the backend running?";
  return raw;
}

export default App;
