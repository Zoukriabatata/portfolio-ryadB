'use client';

// Was 'force-dynamic' — but the page is a client component (`useSession`,
// `inPreview` state), so the server pass renders an identical shell for
// every visitor. Letting Next.js statically prerender that shell + cache
// it on the CDN drops TTFB from ~200ms to ~20ms (better Core Web Vitals
// → better Google ranking). The session + preview-window check both
// hydrate client-side anyway.

import { useState, useEffect, useRef, Suspense } from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MarketingShell from '@/components/marketing/MarketingShell';

const PRICE_USD      = 29;
const TRIAL_DAYS     = 14;
const PROMO_CODE     = 'SZK60';
const PROMO_DISCOUNT = 60;
const PRICE_PROMO    = +(PRICE_USD * (1 - PROMO_DISCOUNT / 100)).toFixed(2); // 11.60

// Hardcoded copy of PREVIEW_END from lib/auth/license.ts. Until this
// instant, the register endpoint auto-grants PRO with no Stripe step,
// so the pricing page must NOT push users into a checkout that gives
// them less than what they'd get from /auth/register.
const PREVIEW_END_MS = new Date('2026-06-17T23:59:59.000Z').getTime();

const PRO_FEATURES = [
  'Footprint charts (delta, volume, imbalance, absorption)',
  'Broker-side daily volume matched to NinjaTrader',
  'NinjaTrader Bridge for Apex / Rithmic accounts',
  'Rithmic direct (R | Protocol) — no NT required',
  'Crypto live feeds (Binance · Bybit · Deribit)',
  'Trading journal with session screenshots',
  'News & economic calendar',
  '2 machines (PC + laptop)',
  'Priority support on Discord',
];

// Billing-specific FAQ. Product/feature questions live in the landing
// FAQ (/#faq) — we link there rather than duplicating.
const BILLING_FAQS = [
  {
    question: 'Do I need a card to start?',
    answer:
      `No. During the public preview (until 17 June 2026) you get full PRO with no card and no payment. After that, the ${TRIAL_DAYS}-day trial also starts without charging anything — you only enter card details if you choose to subscribe.`,
  },
  {
    question: 'What happens on 17 June 2026?',
    answer:
      `The free preview ends. Accounts that don't subscribe drop to read-only — no lock-in, no surprise charge. Subscribing keeps full PRO at $${PRICE_USD}/month.`,
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Cancel in one click from your account page. You keep access until the end of the paid period, and you are never billed again after cancelling.',
  },
  {
    question: 'How is payment handled?',
    answer:
      'All payments run through Stripe — we never see or store your card. Major cards are accepted and the checkout is fully PCI-compliant.',
  },
];

// ─── Shared countdown type ────────────────────────────────────────────
interface Left { d: number; h: number; m: number; s: number }
const PROMO_TARGET = new Date('2026-07-17T23:59:59.000Z').getTime();

function usePromoCountdown(): Left {
  const [left, setLeft] = useState<Left>({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    const tick = () => {
      const diff = PROMO_TARGET - Date.now();
      if (diff <= 0) { setLeft({ d: 0, h: 0, m: 0, s: 0 }); return; }
      const s = Math.floor(diff / 1000);
      setLeft({ d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return left;
}

function PromoBanner({ mono }: { mono: string }) {
  const [copied, setCopied]   = useState(false);
  const [mounted, setMounted] = useState(false);
  const left                  = usePromoCountdown();

  useEffect(() => { setMounted(true); }, []);

  const copy = () => {
    navigator.clipboard.writeText(PROMO_CODE).then(() => {
      toast.success('Code copied!', { description: 'Paste SZK60 at checkout — 60% off your first month.' });
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    });
  };

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <style>{`
        @keyframes promo-border-breathe {
          0%,100% { opacity:.55 }
          50%      { opacity:1  }
        }
        @keyframes promo-shimmer {
          0%   { transform:translateX(-180%) }
          100% { transform:translateX(380%)  }
        }
        @keyframes promo-chip-pulse {
          0%,100% { box-shadow:0 0 0 0 rgb(var(--primary-rgb)/.0),  inset 0 0 12px rgb(var(--primary-rgb)/.12) }
          50%     { box-shadow:0 0 22px 4px rgb(var(--primary-rgb)/.18), inset 0 0 18px rgb(var(--primary-rgb)/.20) }
        }
        @keyframes promo-icon-glow {
          0%,100% { box-shadow:0 0 8px rgb(var(--primary-rgb)/.25) }
          50%     { box-shadow:0 0 18px rgb(var(--primary-rgb)/.55) }
        }
      `}</style>

      <div
        className="w-full max-w-lg mb-6 relative z-10 animate-slideUp"
        style={{ animationDelay: '220ms', animationFillMode: 'both' }}
      >
        {/* ── Animated gradient border ── */}
        <div style={{
          borderRadius: 20,
          padding: 1,
          background: 'linear-gradient(135deg, rgb(var(--primary-rgb)/.65) 0%, rgb(var(--primary-rgb)/.12) 45%, rgb(var(--primary-rgb)/.65) 100%)',
          animation: 'promo-border-breathe 2.8s ease-in-out infinite',
          boxShadow: '0 0 36px rgb(var(--primary-rgb)/.12)',
        }}>
          <div style={{
            borderRadius: 19,
            background: 'linear-gradient(150deg, rgb(var(--primary-rgb)/.09) 0%, var(--background) 55%)',
            backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            overflow: 'hidden', position: 'relative',
            padding: '18px 20px 16px',
          }}>

            {/* Shimmer sweep */}
            <div aria-hidden="true" style={{
              position: 'absolute', top: 0, left: 0, width: '38%', height: '100%',
              background: 'linear-gradient(90deg, transparent 0%, rgb(var(--primary-rgb)/.07) 50%, transparent 100%)',
              animation: 'promo-shimmer 4.5s ease-in-out 2.2s infinite',
              pointerEvents: 'none',
            }} />

            {/* ── Row 1: icon + label + countdown ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* SVG zap icon in glowing container */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: 'rgb(var(--primary-rgb)/.14)',
                  border: '1px solid rgb(var(--primary-rgb)/.42)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'promo-icon-glow 2.8s ease-in-out infinite',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 600 }}>
                    Limited Offer
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-muted)', marginTop: 2 }}>
                    First month only · expires 17/07
                  </div>
                </div>
              </div>

              {/* Countdown pills */}
              {mounted && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {([
                    { val: String(left.d), label: 'D' },
                    { val: pad(left.h),    label: 'H' },
                    { val: pad(left.m),    label: 'M' },
                    { val: pad(left.s),    label: 'S' },
                  ] as { val: string; label: string }[]).map(({ val, label }) => (
                    <div key={label} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      background: 'rgb(var(--primary-rgb)/.08)',
                      border: '1px solid rgb(var(--primary-rgb)/.20)',
                      borderRadius: 7, padding: '4px 6px', minWidth: 30,
                    }}>
                      <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--primary-light)', lineHeight: 1 }}>{val}</span>
                      <span style={{ fontFamily: mono, fontSize: 7, letterSpacing: '0.1em', color: 'var(--text-muted)', marginTop: 2 }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Row 2: 60% OFF headline ── */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
              <span style={{
                fontFamily: 'var(--font-fraunces, var(--font-display, Georgia))',
                fontStyle: 'italic', fontWeight: 600, fontSize: 34, lineHeight: 1,
                color: 'var(--primary)',
                textShadow: '0 0 28px rgb(var(--primary-rgb)/.45)',
                letterSpacing: '-0.02em',
              }}>
                60% off
              </span>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>
                your first month
              </span>
            </div>

            {/* ── Row 3: Big code chip — THE centerpiece ── */}
            <button
              onClick={copy}
              aria-label={`Copy promo code ${PROMO_CODE} for 60% off`}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: mono, fontWeight: 800, fontSize: 20, letterSpacing: '0.30em',
                color: 'var(--primary-light)',
                background: 'rgb(var(--primary-rgb)/.09)',
                border: '1.5px solid rgb(var(--primary-rgb)/.40)',
                borderRadius: 12, padding: '14px 20px', cursor: 'pointer',
                transition: 'background .18s, border-color .18s, transform .15s',
                animation: 'promo-chip-pulse 3s ease-in-out infinite',
              }}
              onMouseEnter={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background    = 'rgb(var(--primary-rgb)/.17)';
                b.style.borderColor   = 'rgb(var(--primary-rgb)/.65)';
                b.style.transform     = 'scale(1.015)';
              }}
              onMouseLeave={e => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background    = 'rgb(var(--primary-rgb)/.09)';
                b.style.borderColor   = 'rgb(var(--primary-rgb)/.40)';
                b.style.transform     = 'scale(1)';
              }}
            >
              <span>{PROMO_CODE}</span>

              <span style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: mono, fontWeight: 600, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: copied ? 'var(--primary)' : 'var(--text-muted)',
                transition: 'color .18s',
              }}>
                {copied ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Click to copy
                  </>
                )}
              </span>
            </button>

            {/* ── Row 4: Price comparison ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-dimmed)', textDecoration: 'line-through' }}>
                ${PRICE_USD}/mo
              </span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
              <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 16, color: 'var(--primary)', letterSpacing: '-0.01em' }}>
                ${PRICE_PROMO}/mo
              </span>
              <span style={{ fontFamily: mono, fontSize: 9, color: 'var(--text-dimmed)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                first month
              </span>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

function PricingContent() {
  const session = useSession()?.data;
  const params = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Client-side check on mount so SSR HTML doesn't depend on Date.now()
  // (would cause hydration mismatch + would crash a static export).
  const [inPreview, setInPreview] = useState(false);
  useEffect(() => {
    setInPreview(Date.now() < PREVIEW_END_MS);
  }, []);

  // Count-up on the headline price when the card scrolls into view.
  // SSR renders the final value (PRICE_USD) — the animation only runs
  // client-side after hydration, so no hydration mismatch and a graceful
  // fallback if IntersectionObserver is unavailable.
  const priceRef = useRef<HTMLSpanElement | null>(null);
  const [displayPrice, setDisplayPrice] = useState(PRICE_USD);
  useEffect(() => {
    const el = priceRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 700;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
          setDisplayPrice(Math.round(eased * PRICE_USD));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        setDisplayPrice(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const isAuthenticated = !!session?.user;
  const isPro = session?.user?.tier === 'PRO';
  const cancelled = params?.get('cancelled') === 'true';

  const handleSubscribe = async () => {
    // Public preview window: registration auto-grants PRO. Push every
    // guest to /auth/register and bypass Stripe entirely. Existing PROs
    // (preview-granted included) go to /account.
    if (inPreview) {
      if (isPro) {
        window.location.href = '/account';
        return;
      }
      window.location.href = '/auth/register';
      return;
    }

    if (!isAuthenticated) {
      // Send guest to register, with a return-to-pricing redirect after sign up
      window.location.href = '/auth/register?callbackUrl=/pricing';
      return;
    }
    if (isPro) {
      // Existing PRO subscriber → portal
      window.location.href = '/account';
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tier: 'PRO' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Checkout failed');
        setLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error('Checkout URL not returned');
        setLoading(false);
      }
    } catch {
      toast.error('Network error — please try again');
      setLoading(false);
    }
  };

  const ctaLabel = loading
    ? null
    : inPreview
      ? (isPro ? 'Manage account →' : 'Get free preview access')
      : !isAuthenticated
        ? 'Create account to start trial'
        : isPro
          ? 'Manage subscription →'
          : `Start ${TRIAL_DAYS}-day free trial`;

  // Mono kicker shared style — matches landing section heads.
  const mono = 'var(--font-jetbrains-mono)';

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-20 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* ── Atmosphere ───────────────────────────────────────────── */}
      {/* Ambient glows */}
      <div
        className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--primary-rgb) / 0.08) 0%, transparent 70%)', filter: 'blur(80px)' }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.05) 0%, transparent 70%)', filter: 'blur(80px)' }}
        aria-hidden="true"
      />
      {/* Terminal grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 0%, transparent 80%)',
          opacity: 0.5,
        }}
        aria-hidden="true"
      />
      {/* Top shimmer divider */}
      <div className="section-divider-shimmer" />

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="text-center mb-12 relative z-10 max-w-2xl">
        <div
          className="mb-4 animate-slideUp"
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            animationDelay: '40ms',
            animationFillMode: 'both',
          }}
        >
          · Pricing
        </div>

        <h1
          className="font-display leading-none animate-slideUp"
          style={{
            color: 'var(--text-primary)',
            fontSize: 'clamp(38px, 5.2vw, 64px)',
            WebkitFontSmoothing: 'subpixel-antialiased',
            animationDelay: '100ms',
            animationFillMode: 'both',
          }}
        >
          One plan.<br /><span className="font-display-accent">Everything unlocked.</span>
        </h1>

        <p
          className="mt-5 dash-text-sm md:dash-text-base max-w-md mx-auto animate-slideUp"
          style={{ color: 'var(--text-secondary)', animationDelay: '180ms', animationFillMode: 'both' }}
        >
          Start free for {TRIAL_DAYS} days. No card up front, cancel anytime.
        </p>
      </div>

      {/* ── Promo banner ─────────────────────────────────────────── */}
      <PromoBanner mono={mono} />

      {/* ── Pricing card ─────────────────────────────────────────── */}
      <div
        className="w-full max-w-lg rounded-2xl p-8 md:p-10 relative z-10 animate-slideUp"
        style={{
          background:     'rgb(var(--primary-rgb) / 0.07)',
          border:         '1px solid rgb(var(--primary-rgb) / 0.25)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow:      '0 20px 60px rgba(0,0,0,0.35), 0 0 50px rgb(var(--primary-rgb) / 0.10)',
          animationDelay: '260ms',
          animationFillMode: 'both',
        }}
      >
        {/* Corner ticks — terminal flourish */}
        {([
          'top-3 left-3 border-t border-l',
          'top-3 right-3 border-t border-r',
          'bottom-3 left-3 border-b border-l',
          'bottom-3 right-3 border-b border-r',
        ]).map((pos) => (
          <span
            key={pos}
            aria-hidden="true"
            className={`absolute w-3 h-3 pointer-events-none ${pos}`}
            style={{ borderColor: 'rgb(var(--primary-rgb) / 0.35)' }}
          />
        ))}

        {/* Plan identity + trial pill */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <div
              className="mb-1.5"
              style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
            >
              Senzoukria
            </div>
            <h2
              style={{ fontFamily: mono, fontWeight: 600, fontSize: 30, letterSpacing: '-0.03em', textTransform: 'uppercase', color: 'var(--text-primary)' }}
            >
              Pro
            </h2>
          </div>
          <span
            className="px-3 py-1 rounded-full"
            style={{
              fontFamily: mono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              background: 'rgb(var(--primary-rgb) / 0.15)',
              color: 'var(--primary)',
              border: '1px solid rgb(var(--primary-rgb) / 0.35)',
            }}
          >
            {inPreview ? 'Free until 17/06' : `${TRIAL_DAYS}-day free trial`}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span
            ref={priceRef}
            className="tabular-nums"
            style={{ fontFamily: mono, fontWeight: 600, fontSize: 60, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--text-primary)' }}
          >
            ${displayPrice}
          </span>
          <span style={{ fontFamily: mono, fontSize: 13, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
            USD / month
          </span>
        </div>
        <div
          className="mt-2"
          style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.05em', color: 'var(--text-dimmed)' }}
        >
          {'// billed monthly · cancel anytime · no setup fee'}
        </div>

        <p className="dash-text-sm mt-5 mb-6" style={{ color: 'var(--text-secondary)' }}>
          {inPreview
            ? `Full PRO access — no card required, no payment. Free until 17 June 2026. After that, $${PRICE_USD}/month if you want to keep it.`
            : `No card charged for ${TRIAL_DAYS} days. After the trial, you'll be billed $${PRICE_USD} every month. Cancel anytime from your account.`}
        </p>

        {/* CTA */}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="btn-brand w-full py-4 rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-t-2" style={{ borderColor: 'currentColor' }} />
              Redirecting to Stripe…
            </span>
          ) : (
            ctaLabel
          )}
        </button>

        {cancelled && (
          <p className="mt-3 text-center" style={{ fontFamily: mono, fontSize: 12, color: 'var(--warning)' }}>
            Checkout cancelled. You can try again anytime.
          </p>
        )}

        {/* Divider */}
        <div className="mt-8 mb-6 flex items-center gap-3">
          <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Included
          </span>
          <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* Feature grid */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 dash-text-sm">
              <svg
                className="mt-0.5 shrink-0"
                width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
            </li>
          ))}
        </ul>

        {/* Footer note */}
        <div
          className="mt-8 pt-5 text-center border-t"
          style={{ borderColor: 'var(--border)', fontFamily: mono, fontSize: 11, letterSpacing: '0.03em', color: 'var(--text-dimmed)' }}
        >
          Secure checkout powered by Stripe.
          <br />
          Questions?{' '}
          <Link href="/contact" className="underline" style={{ color: 'var(--primary-light)' }}>
            Contact us
          </Link>
        </div>
      </div>

      {/* ── Value framing strip ──────────────────────────────────── */}
      <p
        className="mt-8 text-center max-w-lg relative z-10"
        style={{ fontFamily: mono, fontSize: 11.5, lineHeight: 1.7, letterSpacing: '0.02em', color: 'var(--text-muted)' }}
      >
        <span style={{ color: 'var(--text-dimmed)' }}>ATAS · Bookmap · Sierra Chart </span>
        $50–150/mo, locked data layer.{' '}
        <span style={{ color: 'var(--primary-light)' }}>Senzoukria</span> $29/mo, native Windows, on the NinjaTrader feed you already own.
      </p>

      {/* ── Trust strip ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-7 relative z-10">
        {['Stripe-secured payments', 'Cancel anytime', 'No setup fees'].map((label, i) => (
          <span key={label} className="flex items-center gap-3">
            {i > 0 && <span style={{ color: 'var(--text-dimmed)' }}>·</span>}
            <span
              className="flex items-center gap-1.5"
              style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dimmed)' }}
            >
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgb(var(--primary-rgb) / 0.5)' }} />
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* ── Billing FAQ ──────────────────────────────────────────── */}
      <div className="w-full max-w-lg mt-16 relative z-10">
        <div
          className="text-center mb-6"
          style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
        >
          · Billing questions
        </div>

        {BILLING_FAQS.map((faq, i) => {
          const isOpen = openFaq === i;
          return (
            <div
              key={i}
              className={`rounded-lg px-4 -mx-4 transition-all duration-300 ${
                isOpen
                  ? 'bg-white/[0.02] border border-[rgb(var(--primary-rgb)_/_0.15)] shadow-[0_0_15px_rgb(var(--primary-rgb)_/_0.05)]'
                  : 'border border-transparent border-b-[var(--border)]'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenFaq((prev) => (prev === i ? null : i))}
                className="w-full flex items-center justify-between py-4 text-left group cursor-pointer"
              >
                <span
                  className="dash-text-sm md:dash-text-base font-medium transition-colors duration-200"
                  style={isOpen ? { color: 'var(--primary-light)' } : { color: 'var(--text-primary)' }}
                >
                  {faq.question}
                </span>
                <span
                  className={`flex-shrink-0 ml-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                  style={{ color: 'var(--primary)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{ maxHeight: isOpen ? '500px' : '0px', opacity: isOpen ? 1 : 0 }}
              >
                <p className="dash-text-sm leading-relaxed pb-4" style={{ color: 'var(--text-secondary)' }}>
                  {faq.answer}
                </p>
              </div>
            </div>
          );
        })}

        <p className="mt-8 text-center dash-text-sm" style={{ color: 'var(--text-muted)' }}>
          More about features & setup?{' '}
          <Link
            href="/#faq"
            className="underline underline-offset-2 transition-colors hover:text-[var(--primary-light)]"
            style={{ color: 'rgb(var(--primary-light-rgb) / 0.75)' }}
          >
            Full FAQ
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <MarketingShell>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--primary)]" role="status" />
        </div>
      }>
        <PricingContent />
      </Suspense>
    </MarketingShell>
  );
}
