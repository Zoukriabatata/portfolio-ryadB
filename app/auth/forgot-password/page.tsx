'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthShell, { AuthHeading } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? 'An error occurred. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      {submitted ? (
        <>
          <AuthHeading
            title="Check your inbox"
            subtitle={`If an account exists for ${email}, a reset link is on its way. It expires in 24 hours.`}
          />

          <div
            className="p-4 rounded-lg mb-6 text-sm"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <p className="mb-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Didn&apos;t get it?</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Check your spam / junk folder</li>
              <li>Wait 1-2 minutes</li>
              <li>Double-check the email spelling</li>
            </ul>
          </div>

          <Link
            href="/auth/login"
            className="btn-brand block w-full text-center py-3 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
          >
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <AuthHeading
            eyebrow="· Reset password"
            title="Forgot your password?"
            subtitle="Enter your email — we'll send you a link to reset your password."
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
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="email"
                required
                placeholder="you@example.com"
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
                  Sending…
                </span>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/auth/login"
              className="text-sm font-medium"
              style={{ color: 'var(--primary-light)' }}
            >
              ← Back to sign in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
