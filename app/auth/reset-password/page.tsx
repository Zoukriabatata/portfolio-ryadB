'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthShell, { AuthHeading } from '@/components/auth/AuthShell';

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  // Reject obviously malformed token early
  const tokenLooksValid = token.length >= 32 && /^[a-f0-9]+$/i.test(token);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push('/auth/login'), 3000);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? 'An error occurred. Please try again.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      {!tokenLooksValid ? (
        <>
          <AuthHeading
            eyebrow="· Reset password"
            title="Invalid link"
            subtitle="This reset link is invalid or incomplete. Request a new one."
          />
          <Link
            href="/auth/forgot-password"
            className="btn-brand block w-full text-center py-3 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            Request a new link
          </Link>
        </>
      ) : success ? (
        <>
          <AuthHeading
            title="Password reset"
            subtitle="Your password has been updated. Redirecting to sign in…"
          />
          <Link
            href="/auth/login"
            className="btn-brand block w-full text-center py-3 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            Sign in now
          </Link>
        </>
      ) : (
        <>
          <AuthHeading
            eyebrow="· Reset password"
            title="New password"
            subtitle="Choose a new password for your account. Minimum 8 characters."
          />

          {error && (
            <div
              className="mb-4 p-3 rounded-lg text-sm animate-error-shake"
              role="alert"
              style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-brand w-full py-3 rounded-lg transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent opacity-60" />
                  Updating…
                </span>
              ) : (
                'Reset my password'
              )}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--primary)]" role="status" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
