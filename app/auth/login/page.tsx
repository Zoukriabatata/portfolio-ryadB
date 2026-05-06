'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  generateAdvancedFingerprint,
  storeFingerprint,
  getStoredFingerprint,
  shouldRefreshFingerprint,
  updateFingerprintTimestamp,
} from '@/lib/auth/fingerprint-client';

// ── Shared Google icon ─────────────────────────────────────────────────────
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

// ── Divider ────────────────────────────────────────────────────────────────
function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full" style={{ borderTop: '1px solid var(--border)' }} />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="px-3" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>
          {label}
        </span>
      </div>
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

  // Surface NextAuth error codes as human-readable messages
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
    // signIn redirects — if we reach here something went wrong
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
      {/* Ambient glow */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.03) 0%, transparent 70%)', filter: 'blur(80px)' }} />

      <div className="w-full max-w-md animate-fadeIn relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', boxShadow: '0 0 40px rgba(74,222,128,0.25)' }}>
            <span className="text-xl font-black text-white">S</span>
          </div>
          <h1 className="text-3xl font-bold"
            style={{ background: 'linear-gradient(to right, var(--primary-light), var(--primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            SENZOUKRIA
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Professional Order Flow Analytics</p>
        </div>

        <div className="rounded-2xl p-8 animate-slideUp backdrop-blur-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Welcome back</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>Sign in to access your dashboard</p>

          {/* OAuth error from URL param */}
          {oauthError && (
            <div className="mb-4 p-3 rounded-lg text-sm animate-error-shake" role="alert"
              style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' }}>
              {oauthError}
            </div>
          )}

          {/* ── PRIMARY: Google sign-in ── */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full py-3 flex items-center justify-center gap-3 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
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

          {/* Recommended badge */}
          <p className="text-center text-[10px] mt-2 mb-1" style={{ color: 'var(--text-muted)' }}>
            ✓ Fastest — no password needed
          </p>

          <Divider label="or use email" />

          {/* ── SECONDARY: Email/password — collapsed by default ── */}
          {!showEmailForm ? (
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              className="w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Sign in with email & password
            </button>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg text-sm animate-error-shake" role="alert"
                  style={{ background: 'var(--error-bg)', border: '1px solid var(--error)', color: 'var(--error)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1.5" style={{ color: 'var(--text-muted)' }}>Email</label>
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
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm" style={{ color: 'var(--text-muted)' }}>Password</label>
                    <Link
                      href="/auth/forgot-password"
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--primary-light)' }}
                    >
                      Forgot?
                    </Link>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 font-semibold rounded-lg transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(to right, var(--primary), var(--primary-dark))', color: '#fff' }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-white/50" />
                      Signing in…
                    </span>
                  ) : 'Sign In'}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No account?{' '}
              <Link href="/auth/register" className="font-medium" style={{ color: 'var(--primary-light)' }}>
                Create one free
              </Link>
            </p>
          </div>
        </div>

        {/* Trust signals */}
        <div className="mt-5 flex items-center justify-center gap-5">
          {[
            { path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', label: 'TLS Encrypted' },
            { path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'No data sold' },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
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
