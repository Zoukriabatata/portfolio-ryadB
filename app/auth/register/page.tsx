'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import Logotype from '@/components/ui/brand/Logotype';
import { AuthHeading } from '@/components/auth/AuthShell';
import {
  generateAdvancedFingerprint,
  storeFingerprint,
  updateFingerprintTimestamp,
} from '@/lib/auth/fingerprint-client';

// Hardcoded copy of PREVIEW_END from lib/auth/license.ts — the server
// is the source of truth (it gates the auto-grant), this is purely a
// UX hint so users see the offer instead of guessing why the account
// gives PRO access for free.
const PREVIEW_END_MS = new Date('2026-06-17T23:59:59.000Z').getTime();

function PreviewBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(Date.now() < PREVIEW_END_MS);
  }, []);
  if (!show) return null;
  return (
    <div
      className="mb-5 px-3 py-2 rounded-lg text-xs flex items-start gap-2"
      style={{
        background: 'rgb(var(--primary-rgb) / 0.08)',
        border: '1px solid rgb(var(--primary-rgb) / 0.3)',
        color: 'var(--primary-light)',
      }}
    >
      <span>
        <strong>Public preview</strong> — full PRO access free until <strong>17 June 2026</strong>.
        No payment required, no card asked.
      </span>
    </div>
  );
}

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full" style={{ borderTop: '1px solid var(--border)' }} />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="px-3" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>{label}</span>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [fingerprint, setFingerprint] = useState('');
  // GDPR-compliant consent — explicit affirmative action via checkboxes
  // (a passive "by continuing you agree" link is not a valid consent
  // under EU law since 2018). Without ticking these, the submit button
  // stays disabled, and the user can't proceed.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      try {
        const fp = await generateAdvancedFingerprint();
        storeFingerprint(fp);
        updateFingerprintTimestamp();
        setFingerprint(fp);
      } catch {
        setFingerprint('fp_fallback');
      }
    };
    init();
  }, []);

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    setError('');
    await signIn('google', { callbackUrl: '/dashboard' });
    setIsGoogleLoading(false);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, deviceFingerprint: fingerprint }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/auth/login'), 2000);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* Ambient glow */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb) / 0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb) / 0.03) 0%, transparent 70%)', filter: 'blur(80px)' }} />

      <div className="w-full max-w-md animate-fadeIn relative z-10">

        {/* Brand mark */}
        <div className="flex justify-center mb-8">
          <Link href="/" aria-label="Senzoukria">
            <Logotype fontSize={24} />
          </Link>
        </div>

        <div className="rounded-2xl p-8 animate-slideUp backdrop-blur-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          <AuthHeading eyebrow="· Create account" title="Create your account" subtitle="Free account · no credit card required." />
          {/* Public preview banner — visible only during the launch
              window. Renders client-side so the JIT date check below
              stays SSR-stable (no hydration mismatch from time-sensitive
              copy on the server). Hardcoded cutoff matches PREVIEW_END
              in lib/auth/license.ts. */}
          <PreviewBanner />


          {/* ── GDPR consent checkboxes — required before ANY sign-up
              method (Google or email). Placed here so the user sees
              them before interacting with either button.
              Both buttons stay disabled until both boxes are ticked. ── */}
          <div className="space-y-2 mb-5">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded cursor-pointer flex-shrink-0"
                style={{ accentColor: 'var(--primary)' }}
              />
              <span>
                I have read and accept the{' '}
                <Link
                  href="/legal/terms"
                  target="_blank"
                  className="underline"
                  style={{ color: 'var(--primary-light)' }}
                >
                  Terms of Service
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer text-xs" style={{ color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded cursor-pointer flex-shrink-0"
                style={{ accentColor: 'var(--primary)' }}
              />
              <span>
                I have read and accept the{' '}
                <Link
                  href="/legal/privacy"
                  target="_blank"
                  className="underline"
                  style={{ color: 'var(--primary-light)' }}
                >
                  Privacy Policy
                </Link>{' '}
                and consent to the processing of my personal data as described.
              </span>
            </label>
          </div>

          {/* ── PRIMARY: Google ── */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isGoogleLoading || !acceptTerms || !acceptPrivacy}
            className="w-full py-3 flex items-center justify-center gap-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            {isGoogleLoading ? (
              <span className="animate-spin rounded-full h-5 w-5 border-t-2" style={{ borderColor: 'var(--text-muted)' }} />
            ) : (
              <GoogleIcon size={20} />
            )}
            {isGoogleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
          </button>

          <p className="text-center text-[10px] mt-2 mb-1" style={{ color: 'var(--text-muted)' }}>
            One click · No password to remember
          </p>

          <Divider label="or register with email" />

          {/* ── SECONDARY: Email form — collapsed by default ── */}
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Create account with email
            </button>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg text-sm animate-error-shake" role="alert"
                  style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' }}>
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 rounded-lg text-sm animate-fadeIn"
                  style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', color: 'var(--success)' }}>
                  Account created! Redirecting…
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>Name (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    autoComplete="name"
                    placeholder="Your name"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>Email *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>Confirm password *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || success || !acceptTerms || !acceptPrivacy}
                  className="btn-brand w-full py-3 rounded-lg transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent opacity-60" />
                      Creating…
                    </span>
                  ) : 'Create account'}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Already have an account?{' '}
              <Link href="/auth/login" className="font-medium" style={{ color: 'var(--primary-light)' }}>
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Trading risk disclaimer */}
        <div
          className="mt-5 px-3 py-2.5 rounded-md text-[11px] leading-relaxed flex items-start gap-2"
          style={{
            background: 'var(--warning-bg)',
            border: '1px solid rgb(var(--warning-rgb) / 0.2)',
            color: 'var(--warning)',
            fontFamily: 'var(--font-jetbrains-mono)',
          }}
        >
          <AlertTriangle size={13} strokeWidth={2} className="flex-shrink-0 mt-0.5" />
          <span>Trading involves risk of loss. SENZOUKRIA is a visualization tool only — not financial advice.</span>
        </div>

        {/* Footnote — links to legal pages. GDPR consent captured via checkboxes above. */}
        <div className="mt-4 text-center">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dimmed)' }}>
            See our{' '}
            <Link href="/legal/terms" className="underline" style={{ color: 'var(--text-muted)' }}>Terms of Service</Link>
            ,{' '}
            <Link href="/legal/privacy" className="underline" style={{ color: 'var(--text-muted)' }}>Privacy&nbsp;&amp;&nbsp;Cookie&nbsp;Policy</Link>
            {' '}and{' '}
            <Link href="/legal/mentions-legales" className="underline" style={{ color: 'var(--text-muted)' }}>Mentions légales</Link>.
            <br />
            <span style={{ fontSize: 10, letterSpacing: '0.1em' }}>
              Essential cookies only (authentication session).
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
