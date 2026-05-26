'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

export function DeleteAccountForm({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
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
        body: JSON.stringify({ confirm, password }),
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
