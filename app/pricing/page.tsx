'use client';

// Was 'force-dynamic' — but the page is a client component (`useSession`,
// `inPreview` state), so the server pass renders an identical shell for
// every visitor. Letting Next.js statically prerender that shell + cache
// it on the CDN drops TTFB from ~200ms to ~20ms (better Core Web Vitals
// → better Google ranking). The session + preview-window check both
// hydrate client-side anyway.

import { useState, useEffect, Suspense } from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MarketingShell from '@/components/marketing/MarketingShell';

// ─── OrderflowV2 Pro single-plan pricing page ──────────────────────────
// Refonte 1.2.G — single $29/month plan with 14-day free trial.
// Promo codes, multi-tier comparison, and manual payment proofs were
// removed in this iteration; they will return in dedicated PRs if needed.

const PRICE_USD = 29;
const TRIAL_DAYS = 14;

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
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.08) 0%, transparent 70%)', filter: 'blur(80px)' }}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(168,139,250,0.05) 0%, transparent 70%)', filter: 'blur(80px)' }}
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
          className="leading-none animate-slideUp"
          style={{
            color: 'var(--text-primary)',
            fontFamily: mono,
            fontWeight: 500,
            fontSize: 'clamp(38px, 5.2vw, 64px)',
            letterSpacing: '-0.04em',
            textTransform: 'uppercase',
            WebkitFontSmoothing: 'subpixel-antialiased',
            animationDelay: '100ms',
            animationFillMode: 'both',
          }}
        >
          One plan.<br />Everything unlocked.
        </h1>

        <p
          className="mt-5 dash-text-sm md:dash-text-base max-w-md mx-auto animate-slideUp"
          style={{ color: 'var(--text-secondary)', animationDelay: '180ms', animationFillMode: 'both' }}
        >
          Start free for {TRIAL_DAYS} days. No card up front, cancel anytime.
        </p>
      </div>

      {/* ── Pricing card ─────────────────────────────────────────── */}
      <div
        className="w-full max-w-lg rounded-2xl p-8 md:p-10 relative z-10 animate-slideUp"
        style={{
          background:    'var(--surface)',
          border:        '1px solid var(--primary)',
          boxShadow:     '0 20px 60px rgba(0,0,0,0.35), 0 0 50px rgba(74,222,128,0.10)',
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
              OrderflowV2
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
              background: 'rgba(74,222,128,0.15)',
              color: 'var(--primary)',
              border: '1px solid rgba(74,222,128,0.35)',
            }}
          >
            {inPreview ? 'Free until 17/06' : `${TRIAL_DAYS}-day free trial`}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span
            className="tabular-nums"
            style={{ fontFamily: mono, fontWeight: 600, fontSize: 60, letterSpacing: '-0.04em', lineHeight: 1, color: 'var(--text-primary)' }}
          >
            ${PRICE_USD}
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
          className="w-full py-4 rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'linear-gradient(135deg, var(--primary-light), var(--primary))',
            color:      '#06140b',
            boxShadow:  '0 0 30px rgb(var(--primary-rgb) / 0.25)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 50px rgb(var(--primary-rgb) / 0.45)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 30px rgb(var(--primary-rgb) / 0.25)'; }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-t-2" style={{ borderColor: 'rgba(6,20,11,0.5)' }} />
              Redirecting to Stripe…
            </span>
          ) : (
            ctaLabel
          )}
        </button>

        {cancelled && (
          <p className="mt-3 text-center" style={{ fontFamily: mono, fontSize: 12, color: '#fbbf24' }}>
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
        <span style={{ color: 'var(--primary-light)' }}>OrderflowV2</span> $29/mo, native Windows, on the NinjaTrader feed you already own.
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
                  : 'border border-transparent border-b-white/[0.06]'
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
