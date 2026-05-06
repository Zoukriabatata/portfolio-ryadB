'use client';

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// ─── OrderflowV2 Pro single-plan pricing page ──────────────────────────
// Refonte 1.2.G — single $29/month plan with 14-day free trial.
// Promo codes, multi-tier comparison, and manual payment proofs were
// removed in this iteration; they will return in dedicated PRs if needed.

const PRICE_USD = 29;
const TRIAL_DAYS = 14;

const PRO_FEATURES = [
  'Live footprint charts (delta, volume, imbalance)',
  'Liquidity heatmap (WebGL, real-time)',
  'GEX dashboard & gamma exposure',
  'Volatility surface & IV skew analysis',
  'Multi-broker connectors (Rithmic · dxFeed · Binance)',
  'Trading journal & session replay',
  'Backtesting engine',
  'News & economic calendar',
  'Up to 2 machines (PC + laptop)',
  'Priority support',
];

function PricingContent() {
  const session = useSession()?.data;
  const params = useSearchParams();

  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!session?.user;
  const isPro = session?.user?.tier === 'PRO';
  const cancelled = params?.get('cancelled') === 'true';

  const handleSubscribe = async () => {
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative overflow-hidden"
      style={{ background: 'var(--background)' }}
    >
      {/* Ambient glow */}
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

      {/* Header */}
      <div className="text-center mb-10 relative z-10">
        <Link
          href="/"
          className="inline-block px-3 py-1 rounded-full text-[10px] tracking-widest mb-6"
          style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          ← BACK TO HOME
        </Link>
        <h1
          className="text-4xl md:text-5xl font-bold mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          One plan. Everything unlocked.
        </h1>
        <p className="text-base md:text-lg" style={{ color: 'var(--text-muted)' }}>
          Start free for {TRIAL_DAYS} days. Cancel anytime.
        </p>
      </div>

      {/* Pricing card */}
      <div
        className="w-full max-w-md rounded-2xl p-8 relative z-10 animate-slideUp"
        style={{
          background:    'var(--surface)',
          border:        '1px solid var(--primary)',
          boxShadow:     '0 20px 60px rgba(0,0,0,0.3), 0 0 40px rgba(74,222,128,0.10)',
        }}
      >
        {/* Plan name + trial pill */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>
              OrderflowV2
            </div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Pro</h2>
          </div>
          <span
            className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide"
            style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--primary)', border: '1px solid rgba(74,222,128,0.35)' }}
          >
            {TRIAL_DAYS}-DAY FREE TRIAL
          </span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-5xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            ${PRICE_USD}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>USD / month</span>
        </div>

        <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>
          No card charged for {TRIAL_DAYS} days. After the trial, you&apos;ll be billed ${PRICE_USD} every month.
          Cancel anytime from your account.
        </p>

        {/* CTA */}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="w-full py-3.5 rounded-lg font-bold text-[14px] tracking-wide transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            color:      '#fff',
            boxShadow:  '0 4px 16px rgba(74,222,128,0.25)',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-white/50" />
              Redirecting to Stripe…
            </span>
          ) : !isAuthenticated ? (
            'Create account to start trial'
          ) : isPro ? (
            'Manage subscription →'
          ) : (
            `Start ${TRIAL_DAYS}-day free trial`
          )}
        </button>

        {cancelled && (
          <p className="mt-3 text-[12px] text-center" style={{ color: '#fbbf24' }}>
            Checkout cancelled. You can try again anytime.
          </p>
        )}

        {/* Feature list */}
        <ul className="mt-8 space-y-2.5">
          {PRO_FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-[13px]">
              <span style={{ color: 'var(--primary)' }} className="mt-0.5 shrink-0">✓</span>
              <span style={{ color: 'var(--text-secondary)' }}>{f}</span>
            </li>
          ))}
        </ul>

        {/* Footer note */}
        <div
          className="mt-7 pt-5 text-center text-[11px] border-t"
          style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}
        >
          Secure checkout powered by Stripe.
          <br />
          Questions? <Link href="/contact" className="underline" style={{ color: 'var(--primary-light)' }}>Contact us</Link>
        </div>
      </div>

      {/* Trust strip */}
      <div className="flex items-center justify-center gap-6 mt-8 relative z-10">
        {[
          { label: 'Stripe-secured payments' },
          { label: 'Cancel anytime' },
          { label: 'No setup fees' },
        ].map(item => (
          <span
            key={item.label}
            className="flex items-center gap-1.5 text-[11px]"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <span style={{ color: 'var(--primary)' }}>•</span>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[var(--primary)]" role="status" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
