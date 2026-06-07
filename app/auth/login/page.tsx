'use client';

/**
 * /auth/login — Editorial Terminal v2.
 *
 * Pushback on v1 : a single 480-px card centred in a 1920-wide black
 * void read as empty / underdesigned. The wordmark + form stacked
 * vertically lost both the brand panel and the form to the dead
 * space around them.
 *
 * v2 commits to a magazine split :
 *   • LEFT  → brand panel. Big Instrument Serif italic title, status
 *             line, system stats. Lives at 50 % on desktop, collapses
 *             above the form on tablet, hidden on mobile (the form
 *             becomes the only thing on screen).
 *   • RIGHT → form column, compact. JetBrains Mono labels + buttons,
 *             Geist body. No "S logo + SENZOUKRIA + NATIVE ORDER FLOW"
 *             stack — that triple-stamp read as desperate.
 *
 * NextAuth flow, error mapping, fingerprint logic — unchanged.
 */

import { Suspense, useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { DashboardAtmosphere } from '@/components/dashboard/DashboardAtmosphere';
import { AnimatedChars } from '@/components/ui/AnimatedChars';
import { cn } from '@/lib/utils';
import {
  generateAdvancedFingerprint,
  storeFingerprint,
  getStoredFingerprint,
  shouldRefreshFingerprint,
  updateFingerprintTimestamp,
} from '@/lib/auth/fingerprint-client';

// ── Google icon ────────────────────────────────────────────────────────────
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

// ── Mono kicker (small uppercase tracked label) ────────────────────────────
function MonoKicker({ children, dim = false, className = '' }: { children: React.ReactNode; dim?: boolean; className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-jetbrains-mono)',
        fontSize: 11,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: dim ? 'var(--text-dimmed)' : 'var(--text-muted)',
      }}
    >
      {children}
    </span>
  );
}

// ── Field label ────────────────────────────────────────────────────────────
function FieldLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <MonoKicker>{children}</MonoKicker>
      {action}
    </div>
  );
}

// ── Inline divider OR ──────────────────────────────────────────────────────
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
            background: 'var(--background)',
            color: 'var(--text-dimmed)',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 10,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// ── Brand panel (left column on desktop) ───────────────────────────────────
// Animations : each block enters via fadeInUp with a staggered delay,
// so the left column reads like a sentence being typed out instead of
// landing as a flat slab.
function BrandPanel() {
  const enter = (delay: number): React.CSSProperties => ({
    animation: `fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) ${delay}ms forwards`,
    opacity: 0,
  });

  return (
    <div className="relative flex flex-col justify-between h-full p-10 lg:p-14">
      {/* Top — wordmark */}
      <div className="flex items-center gap-3" style={enter(60)}>
        <div
          className="w-9 h-9 rounded-md grid place-items-center"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-glow)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontWeight: 600,
              fontSize: 15,
              color: 'var(--primary)',
              lineHeight: 1,
            }}
          >
            S
          </span>
        </div>
        <MonoKicker>Senzoukria</MonoKicker>
      </div>

      {/* Middle — mono terminal headline (matches hero) */}
      <div className="my-12 lg:my-0">
        <div style={enter(140)}>
          <MonoKicker dim>· Sign in</MonoKicker>
        </div>
        <h1
          className="mt-5 leading-none"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontSize: 'clamp(44px, 5.8vw, 80px)',
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
          }}
        >
          <span style={{ fontWeight: 400, color: 'var(--text-primary)' }}>
            <AnimatedChars text="Welcome" baseDelay={220} charDelay={36} />
          </span>
          <br />
          <span style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)', textShadow: '0 0 30px rgb(var(--primary-rgb) / 0.26)' }}>
            <AnimatedChars text="back" baseDelay={520} charDelay={36} />
          </span>
        </h1>
        <p
          className="mt-6 max-w-md"
          style={{
            ...enter(320),
            color: 'var(--text-secondary)',
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          Open the bridge. Footprint, depth, replay — one session, every
          chart you left running.
        </p>
      </div>

      {/* Bottom — system row */}
      <div
        className="flex items-center gap-5"
        aria-hidden="true"
        style={enter(560)}
      >
        <span className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: 'var(--primary)',
              boxShadow: '0 0 8px rgba(74, 222, 128, 0.55)',
              animation: 'pulse 1.6s ease-in-out infinite',
            }}
          />
          <MonoKicker>System · Online</MonoKicker>
        </span>
        <span style={{ color: 'var(--border)' }}>·</span>
        <MonoKicker dim>v2.4</MonoKicker>
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

  // Input shared style — JetBrains Mono so typed credentials read as code.
  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-jetbrains-mono)',
    fontSize: 13,
  };

  // Button mono uppercase shared style.
  const monoBtnStyle: React.CSSProperties = {
    fontFamily: 'var(--font-jetbrains-mono)',
    fontSize: 11,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    fontWeight: 600,
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      <DashboardAtmosphere />

      <div className="relative z-10 min-h-screen grid grid-cols-1 lg:grid-cols-2">
        {/* LEFT — brand panel (hidden on mobile, full panel on desktop) */}
        <div
          className="hidden lg:flex relative"
          style={{
            borderRight: '1px solid var(--border)',
          }}
        >
          <BrandPanel />
        </div>

        {/* RIGHT — form column. Staggered fade-in on every block via
            inline animation-delay. Form interactions stay snappy
            (200 ms hover, scale 0.99 on press) so the page never feels
            slow despite the entrance choreography. */}
        <div className="flex items-center justify-center px-6 py-12 lg:p-14">
          <div className="w-full max-w-sm">

            {/* Mobile brand strip — only shown when left panel is hidden */}
            <div
              className="lg:hidden mb-10 flex items-center gap-3"
              style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 60ms forwards', opacity: 0 }}
            >
              <div
                className="w-9 h-9 rounded-md grid place-items-center"
                style={{ border: '1px solid var(--border-glow)' }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontWeight: 600,
                    fontSize: 15,
                    color: 'var(--primary)',
                    lineHeight: 1,
                  }}
                >
                  S
                </span>
              </div>
              <MonoKicker>Senzoukria</MonoKicker>
            </div>

            {/* Form headline (mobile only — desktop has it on the left).
                Mono uppercase matches the hero / brand panel. */}
            <div
              className="lg:hidden mb-8"
              style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 180ms forwards', opacity: 0 }}
            >
              <h1
                className="leading-none"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  fontSize: 40,
                  letterSpacing: '-0.04em',
                  lineHeight: 0.95,
                }}
              >
                <span style={{ fontWeight: 400, color: 'var(--text-primary)' }}>
                  <AnimatedChars text="Welcome" baseDelay={220} charDelay={32} />
                </span>
                <br />
                <span style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)', textShadow: '0 0 30px rgb(var(--primary-rgb) / 0.26)' }}>
                  <AnimatedChars text="back" baseDelay={500} charDelay={32} />
                </span>
              </h1>
              <p
                className="mt-3"
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Open the bridge.
              </p>
            </div>

            {/* Desktop : a small kicker so the form column doesn't
                start cold. Replaces the prior italic-serif headline
                (which doubled the left panel's headline visually). */}
            <div
              className="hidden lg:block mb-10"
              style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 320ms forwards', opacity: 0 }}
            >
              <MonoKicker dim>· Authentication</MonoKicker>
              <h2
                className="mt-3 uppercase"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontWeight: 500,
                  fontSize: 18,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                <AnimatedChars text="Sign in" baseDelay={400} charDelay={42} />
              </h2>
            </div>

            {/* OAuth error from URL param */}
            {oauthError && (
              <div
                className="mb-5 px-3 py-2.5 rounded-md text-[13px] animate-error-shake"
                role="alert"
                style={{
                  background: 'color-mix(in oklab, var(--bear) 10%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--bear) 40%, transparent)',
                  color: 'var(--bear)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                }}
              >
                {oauthError}
              </div>
            )}

            {/* PRIMARY — Google */}
            <div style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 420ms forwards', opacity: 0 }}>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className={cn(
                  'w-full py-3 flex items-center justify-center gap-3 rounded-md group relative overflow-hidden',
                  'transition-all duration-200 active:scale-[0.99] disabled:opacity-60',
                  'hover:border-[var(--border-glow)] hover:bg-[var(--surface-elevated-hover,var(--surface-elevated))]',
                )}
                style={{
                  ...monoBtnStyle,
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                {/* Lime sweep on hover — pure CSS */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(74,222,128,0.08), transparent)',
                    transform: 'translateX(-100%)',
                    animation: 'loginSweep 1.6s ease-in-out infinite',
                  }}
                />
                {isGoogleLoading ? (
                  <span
                    className="animate-spin rounded-full h-4 w-4 border-t-2 relative z-10"
                    style={{ borderColor: 'var(--text-muted)' }}
                  />
                ) : (
                  <GoogleIcon size={15} />
                )}
                <span className="relative z-10">
                  {isGoogleLoading ? 'Redirecting' : 'Continue with Google'}
                </span>
              </button>

              <p
                className="text-center mt-3"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--text-dimmed)',
                }}
              >
                Fastest · no password needed
              </p>
            </div>

            <div style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 520ms forwards', opacity: 0 }}>
              <Divider label="OR USE EMAIL" />
            </div>

            {/* SECONDARY — Email/password, collapsed by default */}
            {!showEmailForm ? (
              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className={cn(
                  'w-full py-2.5 rounded-md transition-all duration-200',
                  'hover:border-[var(--border-glow)] hover:text-[var(--primary)]',
                )}
                style={{
                  ...monoBtnStyle,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 600ms forwards',
                  opacity: 0,
                }}
              >
                Email &amp; password
              </button>
            ) : (
              <>
                {error && (
                  <div
                    className="mb-4 px-3 py-2.5 rounded-md text-[13px] animate-error-shake"
                    role="alert"
                    style={{
                      background: 'color-mix(in oklab, var(--bear) 10%, transparent)',
                      border: '1px solid color-mix(in oklab, var(--bear) 40%, transparent)',
                      color: 'var(--bear)',
                      fontFamily: 'var(--font-jetbrains-mono)',
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
                        'w-full px-3.5 py-2.5 rounded-md',
                        'focus:outline-none transition-colors',
                        'focus:border-[var(--border-glow)]',
                      )}
                      style={inputStyle}
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
                            fontSize: 10,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: 'var(--primary)',
                          }}
                        >
                          Forgot
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
                        'w-full px-3.5 py-2.5 rounded-md',
                        'focus:outline-none transition-colors',
                        'focus:border-[var(--border-glow)]',
                      )}
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={cn(
                      'w-full py-3 rounded-md transition-all duration-200',
                      'active:scale-[0.99] disabled:opacity-50',
                    )}
                    style={{
                      ...monoBtnStyle,
                      background: 'var(--primary)',
                      color: '#0a0a0a',
                      fontWeight: 700,
                    }}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span
                          className="animate-spin rounded-full h-3.5 w-3.5 border-t-2"
                          style={{ borderColor: 'rgba(0,0,0,0.55)' }}
                        />
                        Signing in
                      </span>
                    ) : (
                      'Sign in'
                    )}
                  </button>
                </form>
              </>
            )}

            <div
              className="mt-7"
              style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 700ms forwards', opacity: 0 }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'var(--text-muted)',
                }}
              >
                No account?{' '}
                <Link
                  href="/auth/register"
                  className="hover:underline transition-colors"
                  style={{ color: 'var(--primary)', fontWeight: 600 }}
                >
                  Create one — free
                </Link>
              </p>
            </div>

            {/* ── Legal consent + risk disclaimer ─────────────────────── */}
            <div
              className="mt-6 space-y-3"
              style={{ animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 750ms forwards', opacity: 0 }}
            >
              {/* Trading risk disclaimer */}
              <div
                className="px-3 py-2.5 rounded-md text-[11px] leading-relaxed flex items-start gap-2"
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

              {/* Implied consent notice (returning users) */}
              <p
                className="text-center"
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: 'var(--text-dimmed)',
                  lineHeight: 1.6,
                }}
              >
                By signing in you agree to our{' '}
                <Link href="/legal/terms" className="underline hover:text-zinc-400 transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/legal/privacy" className="underline hover:text-zinc-400 transition-colors">
                  Privacy&nbsp;&amp;&nbsp;Cookie&nbsp;Policy
                </Link>
                .<br />
                We use essential cookies only (authentication session).
              </p>
            </div>

            {/* Trust signals — small mono baseline */}
            <div
              className="mt-8 pt-6 flex items-center gap-5"
              style={{
                borderTop: '1px solid var(--border)',
                animation: 'fadeInUp 0.7s cubic-bezier(.2,.7,.2,1) 800ms forwards',
                opacity: 0,
              }}
            >
              {[
                { path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', label: 'TLS' },
                { path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'No data sold' },
                { path: 'M3 12h18M3 6h18M3 18h18', label: 'SOC2 ready' },
              ].map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: 'var(--text-dimmed)',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d={item.path} />
                  </svg>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
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
