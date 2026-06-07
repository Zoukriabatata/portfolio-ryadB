'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ReactNode, useState, useEffect } from 'react';

const MONO = 'var(--font-jetbrains-mono)';
// Dark text on an --accent (teal) background — better contrast than white.
const ON_ACCENT = '#04161a';

/* ------------------------------------------------------------------ */
/*  Feature list for the paywall CTA                                   */
/* ------------------------------------------------------------------ */

const PACK_FEATURES = [
  '17 academic papers analyzed and synthesized',
  'Insights filtered for CVD, Volume Profile, Absorption, DOM, Heatmap',
  'ATAS-style footprint charts with Entry / Target / Stop',
  'Matrix of ideal timeframes by tool and trading style',
  '36 concrete implementation ideas',
  'Essential formulas (Hawkes, Propagator, OFI, Square-root law)',
  'A practical 6-step framework to combine the tools',
  'Lifetime updates included',
];

const PREVIEW_QUOTES = [
  { text: 'OFI linearly predicts high-frequency price changes with a significant R².', src: 'Cont et al., Coxon, Veldman' },
  { text: 'Buy/sell order flow exhibits self-excitement (Hawkes processes) — a large buy triggers child buys.', src: 'Tiwari, Chen-Horst-Tran' },
  { text: 'Only 1-3% of daily volume is visible in the LOB at any instant t.', src: 'Bouchaud-Bonart, Coxon' },
];

/* ------------------------------------------------------------------ */
/*  Anti-download CSS injection                                        */
/* ------------------------------------------------------------------ */

function AntiDownloadShield({ userEmail }: { userEmail: string }) {
  useEffect(() => {
    // Disable right-click on research content
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-research-content]')) {
        e.preventDefault();
      }
    };
    // Disable keyboard shortcuts for save/print/copy
    const keyHandler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ['s', 'p', 'c', 'a', 'u'].includes(e.key.toLowerCase())
      ) {
        const target = e.target as HTMLElement;
        if (target.closest('[data-research-content]') || document.querySelector('[data-research-content]')) {
          e.preventDefault();
        }
      }
      // Disable print screen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
      }
    };
    // Disable drag
    const dragHandler = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-research-content]')) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handler);
    document.addEventListener('keydown', keyHandler);
    document.addEventListener('dragstart', dragHandler);
    return () => {
      document.removeEventListener('contextmenu', handler);
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('dragstart', dragHandler);
    };
  }, []);

  return (
    <>
      {/* Watermark overlay with user email — makes screenshots traceable */}
      <div
        className="pointer-events-none fixed inset-0 z-[9999] select-none"
        aria-hidden="true"
        style={{
          background: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 200px,
            rgba(255,255,255,0.015) 200px,
            rgba(255,255,255,0.015) 201px
          )`,
        }}
      >
        <div
          className="h-full w-full"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='11' fill='rgba(255,255,255,0.03)' transform='rotate(-35, 200, 100)' font-family='monospace'%3E${encodeURIComponent(userEmail)}%3C/text%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
          }}
        />
      </div>
      {/* Anti-copy CSS */}
      <style>{`
        [data-research-content] {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }
        [data-research-content] * {
          -webkit-user-select: none !important;
          user-select: none !important;
        }
        @media print {
          [data-research-content] {
            display: none !important;
          }
          body::after {
            content: 'Printing not allowed — Senzoukria Research Pack';
            display: block;
            text-align: center;
            font-size: 24px;
            padding: 100px;
          }
        }
      `}</style>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Fake blurred preview — decorative only, contains NO real content   */
/* ------------------------------------------------------------------ */

function DecorativeBlur() {
  return (
    <div className="pointer-events-none select-none" aria-hidden="true" style={{ maxHeight: 480, overflow: 'hidden' }}>
      <div style={{ filter: 'blur(10px)', opacity: 0.25 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="mb-6 rounded-[var(--radius-lg)] border p-6"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="mb-3 h-5 w-48 rounded" style={{ background: 'var(--border)' }} />
            <div className="mb-2 h-3 w-full rounded" style={{ background: 'var(--border)' }} />
            <div className="mb-2 h-3 w-5/6 rounded" style={{ background: 'var(--border)' }} />
            <div className="mb-2 h-3 w-4/6 rounded" style={{ background: 'var(--border)' }} />
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-16 rounded-lg" style={{ background: 'var(--border)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 0%, var(--background) 80%)' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ResearchPaywallProps {
  preview: ReactNode;
  children: ReactNode;
}

export default function ResearchPaywall({ preview, children }: ResearchPaywallProps) {
  const { data: session, status } = useSession();

  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');

  const isLoading = status === 'loading';
  const isUltra = session?.user?.tier === 'PRO';
  const hasResearchPack = session?.user?.hasResearchPack === true;
  const hasAccess = isUltra || hasResearchPack;
  const isLoggedIn = !!session?.user;
  const userEmail = session?.user?.email || '';

  async function handlePurchase() {
    setPurchasing(true);
    setPurchaseError('');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'research-pack' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPurchaseError(data.error || 'Payment error');
        return;
      }
      window.location.href = data.url;
    } catch {
      setPurchaseError('Network error. Please try again.');
    } finally {
      setPurchasing(false);
    }
  }

  // ── Authorized: show content with anti-download protection ──
  if (hasAccess) {
    return (
      <>
        <AntiDownloadShield userEmail={userEmail} />
        {preview}
        <div data-research-content="true">
          {/* View-only badge */}
          <div className="mb-6 flex items-center gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              View only — Content is protected and tied to your account ({userEmail})
            </span>
          </div>
          {children}
        </div>
      </>
    );
  }

  // ── NOT authorized — children are NEVER rendered ──
  return (
    <>
      {preview}

      <div className="relative mt-12">
        <DecorativeBlur />

        {/* ── Paywall card ── */}
        <div className="absolute inset-x-0 top-8 flex justify-center px-4">
          <div
            className="w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.55), 0 0 80px color-mix(in srgb, var(--accent) 8%, transparent)',
            }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 text-center"
              style={{
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent) 0%, color-mix(in srgb, var(--accent) 4%, transparent) 100%)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)]"
                style={{ background: 'var(--accent)', boxShadow: '0 0 18px color-mix(in srgb, var(--accent) 35%, transparent)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ON_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="font-display text-[26px]" style={{ color: 'var(--text-primary)' }}>
                Research Pack
              </h3>
              <p className="mt-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Full access to the order flow research library
              </p>
            </div>

            {/* Price */}
            <div className="px-6 py-5 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-4xl font-semibold tabular-nums" style={{ fontFamily: MONO, color: 'var(--text-primary)' }}>$39</span>
                <span className="text-[11px] uppercase" style={{ fontFamily: MONO, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>one-time</span>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                One-time payment — permanent online access
              </p>
              <div className="mt-3 flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2"
                style={{ background: 'color-mix(in srgb, var(--accent) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
                  Also included with the Pro subscription
                </span>
              </div>
            </div>

            {/* Preview quotes */}
            <div className="space-y-3 px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase" style={{ fontFamily: MONO, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>
                · Content preview
              </p>
              {PREVIEW_QUOTES.map((q, i) => (
                <div key={i} className="rounded-[var(--radius-md)] border px-3 py-2.5" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                  <p className="text-[12px] italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    &ldquo;{q.text}&rdquo;
                  </p>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    — {q.src}
                  </p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="mb-3 text-[10px] font-bold uppercase" style={{ fontFamily: MONO, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>
                · Included in the pack
              </p>
              <ul className="space-y-2">
                {PACK_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px]">
                    <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Security info */}
            <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  Online viewing only — tied to your account, not downloadable, not transferable
                </span>
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 py-5">
              {isLoading ? (
                <div className="flex justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                </div>
              ) : isLoggedIn ? (
                <div className="space-y-3">
                  <button
                    onClick={handlePurchase}
                    disabled={purchasing}
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{
                      color: 'var(--accent)',
                      background: 'rgb(var(--accent-rgb) / 0.12)',
                      border: '1px solid rgb(var(--accent-rgb) / 0.30)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 26px rgb(var(--accent-rgb) / 0.14)',
                    }}
                  >
                    {purchasing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                        Redirecting to Stripe...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                          <line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                        Buy the Research Pack — $39
                      </>
                    )}
                  </button>
                  {purchaseError && (
                    <p className="text-center text-xs" style={{ color: 'var(--bear)' }}>{purchaseError}</p>
                  )}
                  <p className="text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Or subscribe to{' '}
                    <Link href="/pricing" className="underline" style={{ color: 'var(--accent)' }}>
                      Pro
                    </Link>
                    {' '}to access everything
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Link
                    href="/auth/login?callbackUrl=/academy"
                    className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold transition-colors"
                    style={{
                      color: 'var(--accent)',
                      background: 'rgb(var(--accent-rgb) / 0.12)',
                      border: '1px solid rgb(var(--accent-rgb) / 0.30)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 26px rgb(var(--accent-rgb) / 0.14)',
                    }}
                  >
                    Sign in to buy
                  </Link>
                  <p className="text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Don&apos;t have an account yet?{' '}
                    <Link href="/auth/register?callbackUrl=/academy" className="underline" style={{ color: 'var(--accent)' }}>
                      Create an account
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
