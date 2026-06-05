'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

// Churn reasons surfaced before deletion. The selected reason (+ optional
// details) is emailed to the team so we understand why people leave.
const REASONS = [
  'Too expensive',
  'Missing features I need',
  'Found a better alternative',
  'Not using it enough',
  'Technical issues / bugs',
  'Other',
] as const;

export function DeleteAccountForm({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    reason.length > 0 &&
    confirm.trim().toLowerCase() === email.toLowerCase() &&
    (!hasPassword || password.length > 0) &&
    !pending;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm, password, reason, details }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setError(body?.error || `HTTP ${res.status}`);
        return;
      }
      // Account row is gone — sign out the NextAuth session and bounce
      // to the marketing root so the now-empty session can't confuse
      // any client-side hook.
      await signOut({ redirect: false });
      router.push('/');
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="acct-delete-form" onSubmit={onSubmit}>
      {/* ── Exit survey (shown before the destructive confirmation) ── */}
      <div className="acct-delete-field">
        <span>Before you go — why are you leaving?</span>
        <div className="acct-delete-reasons">
          {REASONS.map((r) => (
            <button
              type="button"
              key={r}
              className={`acct-delete-reason ${reason === r ? 'acct-delete-reason-on' : ''}`}
              onClick={() => setReason(r)}
              disabled={pending}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <label className="acct-delete-field">
        <span>Anything else? (optional)</span>
        <textarea
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Tell us what we could have done better…"
          disabled={pending}
          maxLength={2000}
        />
      </label>

      <label className="acct-delete-field">
        <span>
          Type your email <code>{email}</code> to confirm
        </span>
        <input
          type="email"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={email}
          disabled={pending}
          required
        />
      </label>
      {hasPassword && (
        <label className="acct-delete-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            required
          />
        </label>
      )}
      {error && <div className="acct-delete-err">{error}</div>}
      <div className="acct-delete-actions">
        <a href="/account" className="acct-delete-cancel">Cancel</a>
        <button
          type="submit"
          className="acct-delete-submit"
          disabled={!canSubmit}
        >
          {pending ? 'Deleting…' : 'Permanently delete my account'}
        </button>
      </div>
    </form>
  );
}
