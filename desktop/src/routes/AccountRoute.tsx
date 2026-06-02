// AccountRoute.tsx
// =====================================================================
// "My OrderflowV2 Account" — full account management hub.
//
// Sections:
//   1. Hero        — avatar, email, status badge, quick actions
//   2. Subscription— plan, renewal date, countdown, billing actions
//   3. License     — key, status, issued / expires
//   4. Devices     — slots used + this machine binding
//   5. Login & sec.— email, password reset link, 2FA placeholder
//   6. Danger zone — delete account
//
// Actions that require Stripe / billing flows open the OrderflowV2
// web dashboard in the user's browser (no Stripe SDK on desktop).

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Login } from "../App";
import {
  useSession,
  useSetSession,
  type Session,
} from "../lib/auth/SessionContext";
import "../components/account/account.css";
import "./AccountRoute.css";

const WEB_BASE = "https://orderflow-v2.vercel.app";
const URL_BILLING = `${WEB_BASE}/account/billing`;
const URL_PAYMENT_METHOD = `${WEB_BASE}/account/billing/payment-method`;
const URL_CANCEL_SUBSCRIPTION = `${WEB_BASE}/account/billing/cancel`;
const URL_RENEW = `${WEB_BASE}/account/billing/renew`;
const URL_PASSWORD = `${WEB_BASE}/account/security/password`;
const URL_2FA = `${WEB_BASE}/account/security/2fa`;
const URL_DELETE = `${WEB_BASE}/account/danger/delete`;
const URL_INVOICES = `${WEB_BASE}/account/billing/invoices`;

function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

type Countdown = {
  days: number;
  hours: number;
  totalMs: number;
  totalDays: number;
  past: boolean;
};
function countdownTo(iso: string | null | undefined): Countdown | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const totalMs = d.getTime() - Date.now();
  const past = totalMs < 0;
  const abs = Math.abs(totalMs);
  const days = Math.floor(abs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((abs / (1000 * 60 * 60)) % 24);
  return { days, hours, totalMs, totalDays: abs / (1000 * 60 * 60 * 24), past };
}

function initialsOf(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  if (!local) return "?";
  return local.slice(0, 2).toUpperCase();
}

type StatusTone = "ok" | "warn" | "bad" | "neutral";
function statusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s === "active") return "ok";
  if (s.includes("trial")) return "warn";
  if (s.includes("expired") || s.includes("cancel")) return "bad";
  return "neutral";
}

function openExternal(url: string) {
  void openUrl(url).catch((e) => console.error("openUrl failed:", e));
}

export function AccountRoute() {
  const session = useSession();
  const setSession = useSetSession();
  const [machineId, setMachineId] = useState<string>("");
  const [busy, setBusy] = useState<"none" | "refresh" | "logout">("none");
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  useEffect(() => {
    invoke<string>("cmd_get_machine_id")
      .then(setMachineId)
      .catch((e) => console.error("cmd_get_machine_id failed:", e));
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const reloadSessionFromBackend = useCallback(async () => {
    try {
      const s = await invoke<Session | null>("cmd_get_session");
      setSession(s);
    } catch (e) {
      console.error("cmd_get_session failed:", e);
    }
  }, [setSession]);

  const onRefresh = useCallback(async () => {
    setBusy("refresh");
    try {
      await invoke("cmd_heartbeat");
      await reloadSessionFromBackend();
      setFeedback({ kind: "ok", msg: "Session refreshed." });
    } catch (e) {
      setFeedback({ kind: "err", msg: `Refresh failed: ${e}` });
    } finally {
      setBusy("none");
    }
  }, [reloadSessionFromBackend]);

  const onLogout = useCallback(async () => {
    setBusy("logout");
    try {
      await invoke("cmd_logout");
      // Also drop the "remember me" entry — an explicit Sign out is
      // intent to forget the user. Without this the Login form would
      // immediately auto-login again on its next mount and the user's
      // Sign out would look like a no-op. Best-effort: keyring failures
      // here don't block the logout itself.
      try {
        await invoke("cmd_clear_credentials");
      } catch (e) {
        console.warn("clear saved credentials on logout failed:", e);
      }
      setSession(null);
      setFeedback({
        kind: "ok",
        msg: "Logged out — sign in below to restore access.",
      });
    } catch (e) {
      setFeedback({ kind: "err", msg: `Logout failed: ${e}` });
    } finally {
      setBusy("none");
    }
  }, [setSession]);

  // ── Unauthenticated state ──────────────────────────────────
  if (!session) {
    return (
      <div className="account-route">
        <div className="acct-login-wrap">
          <div className="acct-login-eyebrow">My OrderflowV2 Account</div>
          <div className="acct-login-title">Sign in to continue</div>
          <div className="acct-login-sub">
            The rest of the app is locked until you're authenticated.
            Use the email + password from your OrderflowV2 web account.
          </div>
          <div className="acct-login-card">
            <Login onLogin={(s) => setSession(s)} />
          </div>
          {feedback && (
            <div className={`acct-feedback acct-feedback-${feedback.kind}`}>
              {feedback.msg}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AccountAuthenticated
      session={session}
      machineId={machineId}
      busy={busy}
      onRefresh={onRefresh}
      onLogout={onLogout}
      feedback={feedback}
    />
  );
}

function AccountAuthenticated({
  session,
  machineId,
  busy,
  onRefresh,
  onLogout,
  feedback,
}: {
  session: Session;
  machineId: string;
  busy: "none" | "refresh" | "logout";
  onRefresh: () => void;
  onLogout: () => void;
  feedback: { kind: "ok" | "err"; msg: string } | null;
}) {
  const { email, expires_at, license } = session;
  const tone = statusTone(license.status);
  const countdown = useMemo(() => countdownTo(expires_at), [expires_at]);

  const machinesPct =
    license.max_machines > 0
      ? Math.round((license.active_machines / license.max_machines) * 100)
      : 0;
  const machinesFull = license.active_machines >= license.max_machines;

  // Subscription progress bar — assume a 30-day cycle for visual
  // approximation when we don't know the start date. Falls back to
  // a flat 50% if the cycle is malformed.
  const cyclePct = useMemo(() => {
    if (!countdown) return 0;
    if (countdown.past) return 100;
    const remainingDays = countdown.totalDays;
    if (remainingDays >= 30) return 0;
    return Math.round(((30 - remainingDays) / 30) * 100);
  }, [countdown]);

  const subStatusLabel =
    countdown?.past ? "EXPIRED" : license.status.toUpperCase();
  const subStatusTone = countdown?.past ? "bad" : tone;

  return (
    <div className="account-route">
      <div className="acct-page">
        {/* ───── Hero ────────────────────────────────────── */}
        <section className="acct-hero">
          <div className="acct-hero-avatar">{initialsOf(email)}</div>
          <div className="acct-hero-info">
            <div className="acct-hero-eyebrow">My OrderflowV2 Account</div>
            <div className="acct-hero-email">{email ?? "—"}</div>
            <div className="acct-hero-sub">
              <span className={`acct-badge acct-badge-${tone}`}>
                {license.status.toUpperCase()}
              </span>
              <span className="acct-hero-dot">·</span>
              <span>License {license.license_key}</span>
            </div>
          </div>
          <div className="acct-hero-actions">
            <button
              type="button"
              className="acct-btn"
              onClick={onRefresh}
              disabled={busy !== "none"}
              title="Renew the session token via heartbeat"
            >
              {busy === "refresh" ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              className="acct-btn acct-btn-danger"
              onClick={onLogout}
              disabled={busy !== "none"}
            >
              {busy === "logout" ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </section>

        {feedback && (
          <div className={`acct-feedback acct-feedback-${feedback.kind}`}>
            {feedback.msg}
          </div>
        )}

        {/* ───── Subscription ────────────────────────────── */}
        <section className="acct-card acct-card-wide">
          <header className="acct-card-h">
            <span>Subscription</span>
            <span className={`acct-badge acct-badge-${subStatusTone}`}>
              {subStatusLabel}
            </span>
          </header>

          <div className="acct-sub-grid">
            <div className="acct-sub-stat">
              <div className="acct-sub-stat-k">Plan</div>
              <div className="acct-sub-stat-v">Premium</div>
            </div>
            <div className="acct-sub-stat">
              <div className="acct-sub-stat-k">
                {countdown?.past ? "Expired on" : "Renews on"}
              </div>
              <div className="acct-sub-stat-v">{fmtDateLong(expires_at)}</div>
            </div>
            <div className="acct-sub-stat">
              <div className="acct-sub-stat-k">Time remaining</div>
              <div className="acct-sub-stat-v">
                {countdown
                  ? countdown.past
                    ? `Expired ${countdown.days}d ${countdown.hours}h ago`
                    : `${countdown.days}d ${countdown.hours}h`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="acct-sub-progress">
            <div
              className={`acct-sub-progress-fill ${countdown?.past ? "acct-sub-progress-fill-bad" : ""}`}
              style={{ width: `${Math.min(100, cyclePct)}%` }}
            />
          </div>

          <div className="acct-sub-actions">
            {countdown?.past ? (
              <button
                type="button"
                className="acct-btn acct-btn-primary"
                onClick={() => openExternal(URL_RENEW)}
              >
                Renew subscription ↗
              </button>
            ) : (
              <button
                type="button"
                className="acct-btn acct-btn-primary"
                onClick={() => openExternal(URL_BILLING)}
              >
                Manage subscription ↗
              </button>
            )}
            <button
              type="button"
              className="acct-btn"
              onClick={() => openExternal(URL_PAYMENT_METHOD)}
            >
              Payment method
            </button>
            <button
              type="button"
              className="acct-btn"
              onClick={() => openExternal(URL_INVOICES)}
            >
              Invoices
            </button>
            <span className="acct-sub-actions-spacer" />
            {!countdown?.past && (
              <button
                type="button"
                className="acct-btn acct-btn-danger-soft"
                onClick={() => openExternal(URL_CANCEL_SUBSCRIPTION)}
              >
                Cancel subscription
              </button>
            )}
          </div>
        </section>

        <div className="acct-grid">
          {/* ───── License ───────────────────────────────── */}
          <section className="acct-card">
            <header className="acct-card-h">License</header>
            <div className="acct-row">
              <span className="acct-row-k">Key</span>
              <span className="acct-row-v acct-mono">
                {license.license_key || "—"}
              </span>
            </div>
            <div className="acct-row">
              <span className="acct-row-k">Status</span>
              <span className={`acct-badge acct-badge-${tone}`}>
                {license.status.toUpperCase()}
              </span>
            </div>
            <div className="acct-row">
              <span className="acct-row-k">Expires</span>
              <span className="acct-row-v">{fmtDateShort(expires_at)}</span>
            </div>
          </section>

          {/* ───── Devices ───────────────────────────────── */}
          <section className="acct-card">
            <header className="acct-card-h">Devices</header>
            <div className="acct-row">
              <span className="acct-row-k">Active</span>
              <span className="acct-row-v">
                <strong>{license.active_machines}</strong>
                <span className="acct-row-muted"> / {license.max_machines}</span>
              </span>
            </div>
            <div className="acct-bar">
              <div
                className={`acct-bar-fill ${machinesFull ? "acct-bar-fill-full" : ""}`}
                style={{ width: `${Math.min(100, machinesPct)}%` }}
              />
            </div>
            <div className="acct-row">
              <span className="acct-row-k">This device</span>
              <span
                className="acct-row-v acct-mono acct-truncate"
                title={machineId}
              >
                {machineId
                  ? machineId.slice(0, 16) + "…"
                  : "—"}
              </span>
            </div>
            <button
              type="button"
              className="acct-btn acct-btn-link"
              onClick={() => openExternal(`${WEB_BASE}/account/devices`)}
            >
              Manage devices →
            </button>
          </section>

          {/* ───── Login & security ──────────────────────── */}
          <section className="acct-card">
            <header className="acct-card-h">Login & security</header>
            <div className="acct-row">
              <span className="acct-row-k">Email</span>
              <span className="acct-row-v acct-truncate" title={email ?? ""}>
                {email ?? "—"}
              </span>
            </div>
            <div className="acct-row">
              <span className="acct-row-k">Password</span>
              <button
                type="button"
                className="acct-row-link"
                onClick={() => openExternal(URL_PASSWORD)}
              >
                Change password ↗
              </button>
            </div>
            <div className="acct-row">
              <span className="acct-row-k">Two-factor</span>
              <button
                type="button"
                className="acct-row-link"
                onClick={() => openExternal(URL_2FA)}
              >
                Set up 2FA ↗
              </button>
            </div>
          </section>
        </div>

        {/* ───── Danger zone ─────────────────────────────── */}
        <section className="acct-card acct-card-wide acct-danger">
          <header className="acct-card-h acct-card-h-danger">
            Danger zone
          </header>
          <div className="acct-danger-row">
            <div className="acct-danger-text">
              <div className="acct-danger-title">Delete account</div>
              <div className="acct-danger-sub">
                Permanently removes your OrderflowV2 account, cancels any
                active subscription, and frees all device slots.
                This cannot be undone.
              </div>
            </div>
            <button
              type="button"
              className="acct-btn acct-btn-danger"
              onClick={() => openExternal(URL_DELETE)}
            >
              Delete account ↗
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
