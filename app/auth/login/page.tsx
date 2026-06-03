'use client';

/**
 * /auth/login — Editorial Terminal redesign.
 *
 * The legacy login wore a "SaaS sign-in card" :
 *   • Two big ambient lime halos painting the background.
 *   • A "SENZOUKRIA" wordmark in a left-right lime gradient.
 *   • An "S" logo tile filled with a gradient + 0 0 40 px glow.
 *   • "Professional Order Flow Analytics" subtitle.
 *
 * That voice clashed with the editorial dashboard the user lands on
 * right after. This redesign keeps every form interaction and every
 * NextAuth flow intact and only changes :
 *   • Background → shared DashboardAtmosphere (Mono Editorial Depth).
 *   • Wordmark → clean Instrument Serif kicker, no gradient.
 *   • Form labels in JetBrains Mono uppercase tracked.
 *   • Inputs / buttons aligned with the dashboard's `--border-glow`,
 *     `--surface-elevated`, focus-ring lime.
 *   • Trust signals pinned bottom in mono uppercase.
 *   • "Professional" retired from the copy — replaced with a
 *     trader-coded subtitle.
 */

import { Suspense, useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { DashboardAtmosphere } from '@/components/dashboard/DashboardAtmosphere';
import { cn } from '@/lib/utils';
import {
  generateAdvancedFingerprint,
  storeFingerprint,
  getStoredFingerprint,
  shouldRefreshFingerprint,
  updateFingerprintTimestamp,
} from '@/lib/auth/fingerprint-client';

// ── Shared Google icon ─────────────────────────────────────────────────────
function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ── Editorial Divider ──────────────────────────────────────────────────────
function Divider({ label = 'OR' }: { label?: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full" style={{ borderTop: '1px solid var(--border)' }} />
      </div>
      <div className="relative flex justify-center">
        <span
          className="px-3"
          style={{
            background: 'var(--surface)',
            color: 'var(--text-dimmed)',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// ── Field label — mono kicker ──────────────────────────────────────────────
function FieldLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <span
        style={{
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {children}
      </span>
      {action}
    </div>
  );
}

// ── Main login form ────────────────────────────────────────────────────────
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [fingerprint, setFingerprint] = useState('');

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const errorParam = searchParams.get('error');
  const ERROR_LABELS: Record<string, string> = {
    OAuthAccountNotLinked: 'An account already exists with this email — sign in with email & password instead.',
    OAuthSignin:           'Could not start Google sign-in. Please try again.',
    OAuthCallback:         'Google sign-in failed. Please try again.',
    oauth_error:           'Google sign-in failed. Try email & password instead.',
    account_locked:        'Your account is temporarily locked. Please try again later.',
    desktop_bridge_no_token:            'Missing authentication token. Please open the desktop app and login again.',
    desktop_bridge_stale_handoff:       'Login expired. Please retry from the desktop app.',
    desktop_bridge_user_not_found:      'Account not found. Please contact support.',
    desktop_bridge_not_subscribed:      'Your Pro subscription is not active.',
    desktop_bridge_license_inactive:    'Your license has been suspended. Please contact support.',
    desktop_bridge_machine_not_found:   'This device is not registered. Please open the desktop app and login again.',
    desktop_bridge_db_unavailable:      'Service temporarily unavailable. Please retry in a moment.',
    desktop_bridge_encode_error:        'Service temporarily unavailable. Please retry in a moment.',
    desktop_bridge_invalid_signature:   'Invalid session. Please retry from the desktop app.',
    desktop_bridge_expired:             'Login expired. Please retry from the desktop app.',
    desktop_bridge_bad_payload:         'Invalid session. Please retry from the desktop app.',
    desktop_bridge_keys_not_configured: 'Service misconfigured. Please contact support.',
  };

  const sessionData = useSession();
  const status = sessionData?.status || 'loading';

  useEffect(() => {
    if (status === 'authenticated') router.push(callbackUrl);
  }, [status, router, callbackUrl]);

  useEffect(() => {
    const init = async () => {
      try {
        const stored = getStoredFingerprint();
        if (stored && !shouldRefreshFingerprint()) {
          setFingerprint(stored);
        } else {
          const fp = await generateAdvancedFingerprint();
          storeFingerprint(fp);
          updateFingerprintTimestamp();
          setFingerprint(fp);
        }
      } catch {
        setFingerprint('fp_fallback');
      }
    };
    init();
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--primary)]" role="status" />
      </div>
    );
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError('');
    await signIn('google', { callbackUrl });
    setIsGoogleLoading(false);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        deviceFingerprint: fingerprint,
        redirect: false,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const oauthError = errorParam ? (ERROR_LABELS[errorParam] || 'Authentication error. Please try again.') : '';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      <DashboardAtmosphere />

      <div className="w-full max-w-md animate-fadeIn relative z-10">

        {/* Wordmark — minimal kicker. The S mark loses its gradient
            fill + neon glow for a clean lime-bordered square; the
            "SENZOUKRIA" rainbow wordmark is replaced by an
            Instrument Serif italic line. */}
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 mx-auto mb-4 rounded-xl grid place-items-center"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-glow)',
              boxShadow: '0 0 24px rgba(74, 222, 128, 0.18)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-instrument-serif)',
                fontStyle: 'italic',
                fontSize: 22,
                color: 'var(--primary)',
                lineHeight: 1,
              }}
            >
              S
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            Senzoukria
          </div>
          <div
            className="mt-1"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--text-dimmed)',
            }}
          >
            Native order flow
          </div>
        </div>

        <div
          className="rounded-2xl p-7 animate-slideUp"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 32px rgba(74, 222, 128, 0.04)',
          }}
        >

          <div className="mb-6">
            <h1
              style={{
                fontFamily: 'var(--font-instrument-serif)',
                fontStyle: 'italic',
                fontSize: 28,
                lineHeight: 1.05,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Welcome back
            </h1>
            <p
              className="mt-2 dash-text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Sign in to open the bridge.
            </p>
          </div>

          {/* OAuth error from URL param */}
          {oauthError && (
            <div
              className="mb-4 p-3 rounded-lg dash-text-sm animate-error-shake"
              role="alert"
              style={{
                background: 'color-mix(in oklab, var(--bear) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--bear) 40%, transparent)',
                color: 'var(--bear)',
              }}
            >
              {oauthError}
            </div>
          )}

          {/* PRIMARY — Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className={cn(
              'w-full py-3 flex items-center justify-center gap-3',
              'rounded-xl transition-all duration-200',
              'active:scale-[0.98] disabled:opacity-60',
              'hover:border-[var(--border-glow)]',
            )}
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            {isGoogleLoading ? (
              <span
                className="animate-spin rounded-full h-4 w-4 border-t-2"
                style={{ borderColor: 'var(--text-muted)' }}
              />
            ) : (
              <GoogleIcon size={16} />
            )}
            {isGoogleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <p
            className="text-center mt-2 mb-1"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 'var(--text-xs)',
              letterSpacing: '0.12em',
              color: 'var(--text-dimmed)',
            }}
          >
            Fastest · no password needed
          </p>

          <Divider label="OR USE EMAIL" />

          {/* SECONDARY — Email/password, collapsed by default */}
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className={cn(
                'w-full py-2.5 rounded-xl transition-colors duration-200',
                'hover:border-[var(--border-glow)] hover:text-[var(--primary)]',
              )}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Email &amp; password
            </button>
          ) : (
            <>
              {error && (
                <div
                  className="mb-4 p-3 rounded-lg dash-text-sm animate-error-shake"
                  role="alert"
                  style={{
                    background: 'color-mix(in oklab, var(--bear) 10%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--bear) 40%, transparent)',
                    color: 'var(--bear)',
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    className={cn(
                      'w-full px-4 py-3 rounded-lg dash-text-sm',
                      'focus:outline-none transition-colors',
                      'focus:border-[var(--border-glow)]',
                    )}
                    style={{
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  />
                </div>
                <div>
                  <FieldLabel
                    action={
                      <Link
                        href="/auth/forgot-password"
                        className="hover:underline"
                        style={{
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: 'var(--text-xs)',
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: 'var(--primary)',
                        }}
                      >
                        Forgot?
                      </Link>
                    }
                  >
                    Password
                  </FieldLabel>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className={cn(
                      'w-full px-4 py-3 rounded-lg dash-text-sm',
                      'focus:outline-none transition-colors',
                      'focus:border-[var(--border-glow)]',
                    )}
                    style={{
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={cn(
                    'w-full py-3 rounded-lg transition-all duration-200',
                    'hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50',
                  )}
                  style={{
                    background: 'var(--primary)',
                    color: '#0a0a0a',
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 'var(--text-xs)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="animate-spin rounded-full h-3.5 w-3.5 border-t-2"
                        style={{ borderColor: 'rgba(0,0,0,0.55)' }}
                      />
                      Signing in…
                    </span>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <p className="dash-text-sm" style={{ color: 'var(--text-muted)' }}>
              No account?{' '}
              <Link
                href="/auth/register"
                className="font-medium hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                Create one free
              </Link>
            </p>
          </div>
        </div>

        {/* Trust signals — mono uppercase, sober */}
        <div className="mt-5 flex items-center justify-center gap-5">
          {[
            { path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', label: 'TLS encrypted' },
            { path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'No data sold' },
          ].map((item) => (
            <span
              key={item.label}
              className="flex items-center gap-1.5"
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--text-dimmed)',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d={item.path} />
              </svg>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--primary)]" role="status" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
