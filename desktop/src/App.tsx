import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { WelcomeScreen } from "./WelcomeScreen";
import { useUpdateCheck, UpdateModal } from "./UpdateChecker";
import { Layout } from "./routes/Layout";
import { WelcomeRoute } from "./routes/WelcomeRoute";
import { FootprintRoute } from "./routes/FootprintRoute";
import { AccountRoute } from "./routes/AccountRoute";
import { GexRoute } from "./routes/GexRoute";
import { NewsRoute } from "./routes/NewsRoute";
import { OptionFlowRoute } from "./routes/OptionFlowRoute";
import { ComingSoonRoute } from "./routes/ComingSoonRoute";
import { AIRoute } from "./routes/AIRoute";
import { JournalRoute } from "./routes/JournalRoute";
import {
  useFootprintBarsCacheStore,
  CACHE_HARD_EXPIRY_MS,
} from "./stores/useFootprintBarsCacheStore";
import { SessionProvider, RequireSession } from "./lib/auth/SessionContext";
import "./App.css";

// Phase 7.7.3 dev flag — when false, the desktop app stays inside the
// Tauri webview and shows the local RithmicFootprint screen post-login
// instead of bridging to the Vercel /live page. Phase 7.7.4 will
// introduce a proper router so both views are reachable; for now we
// prefer the local footprint because that's what we're actively
// validating against MNQ live.
const BRIDGE_TO_WEB = false;

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
  email:      string | null;
}

type HandoffState = { phase: 'loading' | 'failed'; token: string };

const API_BASE     = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000';
// Heartbeat every 5 min — keeps the JWT (15 min server TTL) fresh
// with a 3x safety margin, and surfaces server-side subscription
// changes (cancel, refund, ban) within minutes instead of hours.
const HEARTBEAT_MS = 5 * 60 * 1000;
// Forced-logout threshold: if no successful heartbeat for this long
// (network blocked, offline, server unreachable, …), the client
// kicks the user out. Set to 2x the server JWT TTL so transient
// network blips don't punish honest users, but a sustained
// firewall block can't keep an expired session alive forever.
const HEARTBEAT_HARD_FAIL_MS = 30 * 60 * 1000;

function App() {
  const [session, setSession]     = useState<Session | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [handoff, setHandoff]     = useState<HandoffState | null>(null);
  const [firstLaunchCompleted, setFirstLaunchCompleted] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);


  // Updater check fires once bootstrap is done. Auto-handoff (below) is
  // gated on `updateChecked && (no update || dismissed)` so the modal
  // takes precedence over the bridge to the web dashboard.
  const { update, checked: updateChecked } = useUpdateCheck(true);

  // Purge bars-cache entries older than the hard expiry on boot. The
  // persist middleware also drops them during its merge pass, but we
  // run an explicit sweep here so the dropped entries actually get
  // removed from localStorage instead of just being filtered on read.
  useEffect(() => {
    useFootprintBarsCacheStore
      .getState()
      .clearStaleEntries(CACHE_HARD_EXPIRY_MS);
  }, []);

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
  // Phase 7.7.3: skipped while BRIDGE_TO_WEB=false so the local
  // footprint UI gets to render instead.
  useEffect(() => {
    if (!BRIDGE_TO_WEB) return;
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

  // Periodic heartbeat — refreshes the JWT every 5 min while the
  // app is open. Two failure modes are handled:
  //
  //   1. Explicit auth errors (NOT_SUBSCRIBED, LICENSE_INACTIVE, …)
  //      from the server → forced logout immediately.
  //   2. Sustained network failure beyond HEARTBEAT_HARD_FAIL_MS
  //      (firewall block, offline, server down, …) → forced logout.
  //      Stops the "block heartbeats with hosts file to keep
  //      using the app forever" bypass.
  useEffect(() => {
    if (!session) return;
    // Reset the "last successful" clock to NOW when this session
    // starts — login is itself a successful auth touch.
    let lastSuccessfulHeartbeat = Date.now();

    const tick = async () => {
      try {
        const refreshed = await invoke<{ token: string; expiresAt: string; license: LicenseSnapshot }>("cmd_heartbeat");
        lastSuccessfulHeartbeat = Date.now();
        setSession((prev) => ({
          token: refreshed.token,
          expires_at: refreshed.expiresAt,
          license: refreshed.license,
          email: prev?.email ?? null,
        }));
      } catch (e) {
        console.warn("heartbeat failed", e);
        const msg = String(e);
        const authError =
          msg.includes("NOT_SUBSCRIBED") ||
          msg.includes("LICENSE_INACTIVE") ||
          msg.includes("LICENSE_NOT_FOUND") ||
          msg.includes("MACHINE_NOT_FOUND") ||
          msg.includes("EXPIRED") ||
          msg.includes("INVALID_SIGNATURE") ||
          msg.includes("LICENSE_MISMATCH") ||
          msg.includes("SUBSCRIPTION_EXPIRED");

        if (authError) {
          // Server said "no" — logout immediately.
          await invoke("cmd_logout").catch(() => {});
          setSession(null);
          return;
        }

        // Network / server-down failure. Logout only if we've been
        // unable to reach the server for too long — gives transient
        // hiccups a chance to recover but blocks the "kill the
        // network forever" bypass.
        const blockedFor = Date.now() - lastSuccessfulHeartbeat;
        if (blockedFor >= HEARTBEAT_HARD_FAIL_MS) {
          console.warn(
            `heartbeat unreachable for ${Math.round(blockedFor / 60000)} min — forcing logout`,
          );
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

  // 2026-05-26 — the router is ALWAYS mounted now, regardless of auth.
  // Logged-out users land on `/account` (the only route that renders
  // a sign-in form when there's no session), every other route is
  // wrapped in <RequireSession> and redirects there too. This keeps
  // the app shell (navbar, layout) stable across login/logout cycles
  // and lets the user re-authenticate without a window reload.
  //
  // MemoryRouter (not BrowserRouter) because Tauri serves the app
  // from a `tauri://` / `https://tauri.localhost` scheme without a
  // backing HTTP server — reloading on a path like `/footprint`
  // would otherwise 404. Memory keeps history in JS, URL stays at /.
  const initialEntry = session ? "/" : "/account";

  return (
    <SessionProvider value={{ session, setSession }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<Layout />}>
            {/* Account is the ONLY always-accessible route. When
                logged out it shows a sign-in form; when logged in,
                the user's profile / license / machine binding. */}
            <Route path="/account" element={<AccountRoute />} />

            {/* Every other route requires a session. Visitors without
                one get bounced to /account via <RequireSession>. */}
            <Route
              path="/"
              element={
                <RequireSession>
                  <WelcomeRoute />
                </RequireSession>
              }
            />
            <Route
              path="/footprint"
              element={
                <RequireSession>
                  <FootprintRoute />
                </RequireSession>
              }
            />
            <Route
              path="/heatmap"
              element={
                <RequireSession>
                  <ComingSoonRoute
                    title="Heatmap"
                    availableOn="17/09/2026"
                    description="Liquidity heatmap of the DOM over time — order book pressure visualization."
                  />
                </RequireSession>
              }
            />
            <Route
              path="/gex"
              element={
                <RequireSession>
                  <GexRoute />
                </RequireSession>
              }
            />
            <Route
              path="/news"
              element={
                <RequireSession>
                  <NewsRoute />
                </RequireSession>
              }
            />
            <Route
              path="/flow"
              element={
                <RequireSession>
                  <OptionFlowRoute />
                </RequireSession>
              }
            />
            <Route
              path="/replay"
              element={
                <RequireSession>
                  <ComingSoonRoute
                    title="Replay"
                    availableOn="17/09/2026"
                    description="Bar-by-bar replay of past sessions with footprint, flow and DOM playback."
                  />
                </RequireSession>
              }
            />
            <Route
              path="/ai"
              element={
                <RequireSession>
                  <AIRoute />
                </RequireSession>
              }
            />
            <Route
              path="/journal"
              element={
                <RequireSession>
                  <JournalRoute />
                </RequireSession>
              }
            />
            <Route
              path="*"
              element={<Navigate to={session ? "/" : "/account"} replace />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>
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

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // True between the moment we read saved creds from the keyring and
  // the moment the resulting auto-login attempt finishes. Used to
  // disable the form so the user doesn't double-submit.
  const [autoLogin, setAutoLogin] = useState(false);
  // Guards the auto-login attempt — fires at most once per mount so
  // a failed attempt (wrong password, server unreachable) doesn't
  // loop. The form stays pre-filled and the user can fix + retry.
  const autoAttemptedRef = useRef(false);

  /** Centralised login path: used by both the manual submit and the
   *  auto-login on mount. `shouldRemember` overrides the checkbox
   *  state — needed because React batches setRemember(true) before
   *  the auto-call runs, and reading the closure here would race. */
  const doLogin = async (
    emailIn: string,
    passwordIn: string,
    shouldRemember: boolean,
    fromAuto = false,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const cleanEmail = emailIn.trim();
      const resp = await invoke<{ token: string; expiresAt: string; license: LicenseSnapshot }>(
        "cmd_login",
        { email: cleanEmail, password: passwordIn },
      );
      // Save or wipe the credentials based on the user's choice. Both
      // calls are best-effort: a keyring failure here doesn't block
      // the user from getting in — the login itself succeeded.
      try {
        if (shouldRemember) {
          await invoke("cmd_save_credentials", { email: cleanEmail, password: passwordIn });
        } else {
          await invoke("cmd_clear_credentials");
        }
      } catch (kerr) {
        console.warn("credentials keyring write failed:", kerr);
      }
      onLogin({
        token: resp.token,
        expires_at: resp.expiresAt,
        license: resp.license,
        email: cleanEmail,
      });
    } catch (raw) {
      const msg = String(raw);
      setError(prettifyError(msg));
      // If an AUTO-login failed (stale or revoked password), wipe the
      // saved entry so we don't loop next launch. Manual failures
      // leave the entry alone — the user might be mistyping.
      if (fromAuto) {
        try {
          await invoke("cmd_clear_credentials");
        } catch (e) {
          console.warn("clear stale credentials failed:", e);
        }
      }
    } finally {
      setBusy(false);
      setAutoLogin(false);
    }
  };

  // On mount: pre-fill from the OS keyring + attempt auto-login.
  // We intentionally run this only once (autoAttemptedRef) so a
  // failed auto-attempt doesn't retry forever.
  useEffect(() => {
    if (autoAttemptedRef.current) return;
    autoAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const saved = await invoke<{ email: string; password: string } | null>(
          "cmd_load_credentials",
        );
        if (cancelled || !saved) return;
        setEmail(saved.email);
        setPassword(saved.password);
        setRemember(true);
        setAutoLogin(true);
        // Brief delay so the user sees the auto-fill happening before
        // we fire the request — keeps the UX legible.
        await new Promise((r) => setTimeout(r, 120));
        if (cancelled) return;
        await doLogin(saved.email, saved.password, true, true);
      } catch (e) {
        console.warn("load credentials failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(email, password, remember);
  };

  const disabled = busy || autoLogin || !email || !password;

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
          disabled={busy || autoLogin}
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
          disabled={busy || autoLogin}
        />
      </label>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={remember}
          onChange={e => setRemember(e.target.checked)}
          disabled={busy || autoLogin}
        />
        <span>Sauvegarder mes identifiants (keychain OS)</span>
      </label>

      {error && <div className="error">{error}</div>}

      <button type="submit" disabled={disabled}>
        {autoLogin ? "Connexion auto…" : busy ? "Signing in…" : "Sign in"}
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

// Exported (rather than removed) so Phase 7.7.4's router can mount it
// alongside the footprint when the user wants to inspect their license.
export function Welcome({
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
