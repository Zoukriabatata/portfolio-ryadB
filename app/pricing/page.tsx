'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/useTranslation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentProof {
  id: string;
  method: string;
  reference: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Feature lists
// ---------------------------------------------------------------------------

// Launch offer config
const LAUNCH_PRICE = 29;
const REGULAR_PRICE = 39;
const ANNUAL_PRICE = 279;
const LAUNCH_SPOTS = 50;

const PAYMENT_BRANDS = {
  stripe: { bg: '#635bff', text: '#fff', label: 'S' },
  paypal: { bg: '#0070ba', text: '#fff', label: 'PP' },
  revolut: { bg: '#191C1F', text: '#fff', label: 'R' },
  binance: { bg: '#F0B90B', text: '#000', label: 'B' },
} as const;

const FREE_FEATURES = [
  'Live crypto charts (Binance)',
  'Basic candlestick charts',
  '1 symbol at a time',
  'Standard timeframes',
];

const ULTRA_FEATURES = [
  'Everything in Free, plus:',
  'Footprint charts (delta, volume, imbalance)',
  'Liquidity heatmap (WebGL)',
  'GEX dashboard',
  'Volatility surface & IV analysis',
  'GVS Bias engine',
  'All crypto & futures symbols',
  'Drawing tools',
  'Backtesting & session replay',
  'Trading journal',
  'News calendar',
  'Up to 2 devices',
  'Priority support',
  'Multi-broker (IB, Rithmic, dxFeed, AMP)',
];

// ---------------------------------------------------------------------------
// Main inner component (uses useSearchParams, needs Suspense boundary)
// ---------------------------------------------------------------------------

function PricingContent() {
  const session = useSession()?.data;
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  const upgrade = searchParams.get('upgrade');
  const from = searchParams.get('from');

  const isUltra = session?.user?.tier === 'ULTRA';
  const { t } = useTranslation();

  // Payment proof form state
  const [proofMethod, setProofMethod] = useState('PayPal');
  const [proofReference, setProofReference] = useState('');
  const [proofNotes, setProofNotes] = useState('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofSuccess, setProofSuccess] = useState(false);
  const [proofError, setProofError] = useState('');

  // Existing proofs
  const [existingProofs, setExistingProofs] = useState<PaymentProof[]>([]);
  const [proofsLoading, setProofsLoading] = useState(false);

  // Stripe checkout loading
  const [stripeLoading, setStripeLoading] = useState(false);

  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoValid, setPromoValid] = useState<{ discount: string; remaining: number } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const promoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch existing payment proofs on mount (only if logged in)
  useEffect(() => {
    if (session?.user) {
      fetchProofs();
    }
  }, [session]);

  const fetchProofs = async () => {
    setProofsLoading(true);
    try {
      const res = await fetch('/api/payment/proof');
      if (res.ok) {
        const data = await res.json();
        setExistingProofs(data.proofs || []);
      }
    } catch {
      // silently ignore
    } finally {
      setProofsLoading(false);
    }
  };

  const validatePromoCode = async (code: string) => {
    if (!code.trim()) {
      setPromoValid(null);
      setPromoError('');
      return;
    }
    setPromoValidating(true);
    setPromoError('');
    setPromoValid(null);
    try {
      const res = await fetch(`/api/stripe/validate-promo?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.valid) {
        setPromoValid({ discount: data.discount, remaining: data.remaining });
        setPromoError('');
      } else {
        setPromoValid(null);
        setPromoError(data.error || 'Invalid code');
      }
    } catch {
      setPromoValid(null);
    } finally {
      setPromoValidating(false);
    }
  };

  const handleStripeCheckout = async () => {
    setStripeLoading(true);
    setPromoError('');

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'ULTRA',
          billingPeriod,
          promoCode: promoCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPromoError(data.error || 'Checkout error');
        setStripeLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'An error occurred. Please try again.');
        setStripeLoading(false);
      }
    } catch {
      toast.error('Failed to initiate checkout. Please try again.');
      setStripeLoading(false);
    }
  };

  const handleProofSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProofSubmitting(true);
    setProofError('');
    setProofSuccess(false);

    try {
      const res = await fetch('/api/payment/proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: proofMethod,
          reference: proofReference,
          notes: proofNotes,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setProofSuccess(true);
        setProofReference('');
        setProofNotes('');
        fetchProofs();
      } else {
        setProofError(data.error || 'Submission failed. Please try again.');
      }
    } catch {
      setProofError('Network error. Please try again.');
    } finally {
      setProofSubmitting(false);
    }
  };

  const pendingProofs = existingProofs.filter((p) => p.status === 'PENDING');

  return (
    <div
      className="min-h-screen py-8 sm:py-16 px-3 sm:px-4 relative"
      style={{ background: 'var(--background)', color: 'var(--text-primary)', overflow: 'auto', height: '100svh' }}
    >
      {/* Subtle grid background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
        <div className="absolute top-0 left-0 right-0 h-[500px] opacity-[0.06]" style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -20%, var(--primary), transparent)',
        }} />
      </div>
      <div className="max-w-6xl mx-auto">
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div className="text-center mb-14">
          <Link href="/" className="inline-block mb-6">
            <h1 className="text-3xl font-bold" style={{ background: 'linear-gradient(to right, var(--primary-light), var(--primary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              SENZOUKRIA
            </h1>
          </Link>

          <h2
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('pricing.chooseYourPlan')}
          </h2>
          <p style={{ color: 'var(--text-muted)' }} className="max-w-xl mx-auto text-lg">
            {t('pricing.subtitle')}
          </p>

          {/* Launch offer banner */}
          <div className="mt-6 mx-auto max-w-lg p-4 rounded-xl text-sm font-medium"
            style={{
              background: 'linear-gradient(135deg, var(--success-bg) 0%, var(--accent-bg, rgba(168,85,247,0.1)) 100%)',
              border: '1px solid var(--primary)',
            }}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--primary)' }} />
              <span style={{ color: 'var(--primary-light)' }} className="font-bold tracking-wide">{t('pricing.launchOffer')}</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>
              First {LAUNCH_SPOTS} subscribers get <strong style={{ color: 'var(--text-primary)' }}>${LAUNCH_PRICE}/mo</strong> locked for life
              <span style={{ color: 'var(--text-muted)' }}> (regular ${REGULAR_PRICE}/mo)</span>
            </p>
          </div>

          {/* Upgrade notice banner */}
          {upgrade === 'true' && from && (
            <div
              className="mt-6 mx-auto max-w-lg p-4 rounded-lg border text-sm font-medium"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning)',
                color: 'var(--warning)',
              }}
            >
              Upgrade required to access <strong>{from}</strong>. Choose the SENULTRA plan below.
            </div>
          )}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Pricing Cards                                                     */}
        {/* ----------------------------------------------------------------- */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-20">
          {/* FREE Card */}
          <div
            className="group stagger-fade-up rounded-2xl flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-xl overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="h-[2px] w-full" style={{ background: 'var(--border)' }} />
            <div className="p-8 flex flex-col flex-1">
            <div className="mb-8">
              <h3
                className="text-xl font-semibold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('pricing.freeTitle')}
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('pricing.freeDesc')}
              </p>
            </div>

            <div className="mb-8">
              <span
                className="text-5xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                $0
              </span>
              <span className="text-lg ml-1" style={{ color: 'var(--text-muted)' }}>
                /month
              </span>
            </div>

            <ul className="space-y-3 mb-10 flex-1">
              {FREE_FEATURES.map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span style={{ color: 'var(--primary)' }} className="mt-0.5 shrink-0">
                    &#10003;
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/auth/register"
              className="block w-full py-3 text-center rounded-lg font-semibold transition-all hover:brightness-110"
              style={{
                background: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              {t('pricing.getStartedFree')}
            </Link>
            </div>
          </div>

          {/* SENULTRA Card */}
          <div
            className="group stagger-fade-up rounded-2xl flex flex-col relative transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_40px_var(--primary-glow)] overflow-hidden"
            style={{
              background: 'linear-gradient(170deg, var(--success-bg) 0%, var(--surface) 40%)',
              border: '2px solid var(--primary)',
              boxShadow: '0 0 40px rgba(16, 185, 129, 0.08)',
            }}
          >
            <div className="h-[2px] w-full" style={{ background: 'var(--primary)' }} />
            {/* Hover glow overlay */}
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ boxShadow: 'inset 0 0 60px rgba(16,185,129,0.05)' }}
            />
            <div className="p-8 flex flex-col flex-1 relative">
            {/* Recommended badge */}
            <div
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-5 py-1 text-sm font-semibold rounded-full animate-glowPulse"
              style={{
                background: 'var(--primary)',
                color: '#000',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
              }}
            >
              Full Access
            </div>

            <div className="mb-8">
              <h3
                className="text-xl font-semibold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                SEN<span style={{ color: 'var(--primary-light)' }}>ULTRA</span>
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('pricing.ultraDesc')}
              </p>
            </div>

            <div className="mb-2">
              <div className="flex items-baseline gap-3">
                <span
                  className="text-5xl font-bold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  ${LAUNCH_PRICE}
                </span>
                <span className="text-lg line-through" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  ${REGULAR_PRICE}
                </span>
                <span className="text-lg" style={{ color: 'var(--text-muted)' }}>
                  /month
                </span>
              </div>
              <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: 'var(--success-bg)', color: 'var(--primary-light)' }}>
                LAUNCH PRICE &mdash; {LAUNCH_SPOTS} spots
              </span>
            </div>
            <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
              or <strong style={{ color: 'var(--text-secondary)' }}>${ANNUAL_PRICE}/year</strong>{' '}
              &mdash; ~${Math.round(ANNUAL_PRICE / 12)}/mo, 4 months free
            </p>

            <ul className="space-y-3 mb-10 flex-1">
              {ULTRA_FEATURES.map((feature, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span style={{ color: 'var(--primary)' }} className="mt-0.5 shrink-0">
                    &#10003;
                  </span>
                  <span
                    style={{
                      color:
                        i === 0 ? 'var(--primary-light)' : 'var(--text-secondary)',
                      fontWeight: i === 0 ? 600 : 400,
                    }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            {isUltra ? (
              <div
                className="w-full py-3 text-center rounded-lg font-semibold"
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: 'var(--primary-light)',
                }}
              >
                You already have SENULTRA
              </div>
            ) : session ? (
              <button
                onClick={() => {
                  const el = document.getElementById('payment-methods');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full py-3 rounded-lg font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: 'var(--primary)',
                  color: '#000',
                }}
              >
                {t('pricing.subscribeNow')}
              </button>
            ) : (
              <Link
                href="/auth/register"
                className="block w-full py-3 text-center rounded-lg font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: 'var(--primary)',
                  color: '#000',
                }}
              >
                Sign Up &amp; Subscribe
              </Link>
            )}
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Payment Methods (hidden if already ULTRA)                          */}
        {/* ----------------------------------------------------------------- */}
        {!isUltra && (
          <div id="payment-methods" className="max-w-4xl mx-auto mb-20">
            <h2
              className="text-2xl font-bold text-center mb-10"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('pricing.paymentMethods')}
            </h2>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* Stripe (automatic) */}
              <div
                className="stagger-fade-up rounded-xl p-6"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ background: '#635bff', color: '#fff' }}
                    >
                      S
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        Card / Stripe
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Visa, Mastercard, AMEX
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary-light)' }}
                  >
                    Instant Activation
                  </span>
                </div>

                {/* Billing Period Selector */}
                <div className="mb-4">
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {t('pricing.billingPeriod')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBillingPeriod('monthly')}
                      className="py-2 px-3 rounded-lg text-sm font-medium transition-all"
                      style={{
                        background: billingPeriod === 'monthly' ? 'rgba(99, 91, 255, 0.15)' : 'var(--surface-hover, #1e1e2e)',
                        color: billingPeriod === 'monthly' ? '#635bff' : 'var(--text-secondary)',
                        border: billingPeriod === 'monthly' ? '1px solid #635bff' : '1px solid var(--border)',
                      }}
                    >
                      ${LAUNCH_PRICE}/month
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingPeriod('yearly')}
                      className="py-2 px-3 rounded-lg text-sm font-medium transition-all relative"
                      style={{
                        background: billingPeriod === 'yearly' ? 'rgba(99, 91, 255, 0.15)' : 'var(--surface-hover, #1e1e2e)',
                        color: billingPeriod === 'yearly' ? '#635bff' : 'var(--text-secondary)',
                        border: billingPeriod === 'yearly' ? '1px solid #635bff' : '1px solid var(--border)',
                      }}
                    >
                      ${ANNUAL_PRICE}/year
                      <span className="absolute -top-2 -right-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: 'var(--primary)', color: '#000' }}>
                        SAVE 33%
                      </span>
                    </button>
                  </div>
                </div>

                {/* Promo Code Input */}
                <div className="mb-4">
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {t('pricing.promoCode')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setPromoCode(val);
                        setPromoError('');
                        setPromoValid(null);
                        if (promoTimerRef.current) clearTimeout(promoTimerRef.current);
                        if (val.trim().length >= 3) {
                          promoTimerRef.current = setTimeout(() => validatePromoCode(val), 600);
                        }
                      }}
                      placeholder="SENBETA5"
                      maxLength={20}
                      className="w-full px-3 py-2 rounded-lg text-sm transition-colors pr-10"
                      style={{
                        background: 'var(--surface-hover, #1e1e2e)',
                        border: `1px solid ${promoValid ? '#22c55e' : promoError ? '#ef4444' : 'var(--border)'}`,
                        color: 'var(--text-primary)',
                      }}
                    />
                    {promoValidating && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} />
                      </div>
                    )}
                    {promoValid && !promoValidating && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-lg">&#10003;</div>
                    )}
                    {promoError && !promoValidating && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-lg">&#10007;</div>
                    )}
                  </div>
                  {promoValid && (
                    <p className="mt-1.5 text-xs font-medium" style={{ color: '#22c55e' }}>
                      Code valid! {promoValid.discount} &mdash; {promoValid.remaining} spot{promoValid.remaining > 1 ? 's' : ''} remaining
                    </p>
                  )}
                  {promoError && (
                    <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>
                      {promoError}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleStripeCheckout}
                  disabled={stripeLoading || !session}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: '#635bff', color: '#fff' }}
                >
                  {stripeLoading ? 'Redirecting...' : !session ? t('pricing.signInToPay') : t('pricing.payWithCard')}
                </button>
              </div>

              {/* PayPal (manual) */}
              <div
                className="stagger-fade-up rounded-xl p-6"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ background: '#0070ba', color: '#fff' }}
                    >
                      PP
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        PayPal
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        @SENZOUKRIA
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}
                  >
                    Manual Verification
                  </span>
                </div>
                <a
                  href="https://paypal.me/SENZOUKRIA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2.5 rounded-lg font-semibold text-sm text-center transition-opacity hover:opacity-90"
                  style={{ background: '#0070ba', color: '#fff' }}
                >
                  Send via PayPal
                </a>
              </div>

              {/* Revolut (manual) */}
              <div
                className="stagger-fade-up rounded-xl p-6"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ background: '#191C1F', color: '#fff', border: '1px solid #333' }}
                    >
                      R
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        Revolut
                      </div>
                      <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        @senzoukria
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}
                  >
                    Manual Verification
                  </span>
                </div>
                <a
                  href="https://revolut.me/senzoukria"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-2.5 rounded-lg font-semibold text-sm text-center transition-opacity hover:opacity-90"
                  style={{ background: '#191C1F', color: '#fff', border: '1px solid #444' }}
                >
                  Send via Revolut
                </a>
              </div>

              {/* Binance Pay (manual) */}
              <div
                className="stagger-fade-up rounded-xl p-6"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ background: '#F0B90B', color: '#000' }}
                    >
                      B
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        Binance Pay
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Crypto payment
                      </div>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}
                  >
                    Manual Verification
                  </span>
                </div>
                <div className="flex gap-2">
                  <a
                    href="https://app.binance.com/en/usercenter/wallet/payment/send"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-center transition-opacity hover:opacity-90"
                    style={{ background: '#F0B90B', color: '#000' }}
                  >
                    Open Binance Pay
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText('1017835844'); toast.success('ID copied'); }}
                    className="px-4 py-2.5 rounded-lg text-sm font-mono transition-opacity hover:opacity-80"
                    style={{
                      background: 'var(--surface-elevated, #1a1a24)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                    }}
                    title="Copy Binance ID"
                  >
                    ID: 1017835844 &#128203;
                  </button>
                </div>
              </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* Payment Proof Submission Form                                  */}
            {/* ------------------------------------------------------------- */}
            {session && (
              <div
                className="mt-12 rounded-xl p-8"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <h3
                  className="text-lg font-semibold mb-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Submit Payment Proof
                </h3>
                <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                  After completing a manual payment (PayPal, Revolut, or Binance Pay), submit
                  your proof here for verification. Activation typically takes under 24 hours.
                </p>

                {proofSuccess && (
                  <div
                    className="mb-5 p-4 rounded-lg text-sm font-medium"
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      color: 'var(--primary-light)',
                    }}
                  >
                    Payment proof submitted successfully. We will review it shortly.
                  </div>
                )}

                {proofError && (
                  <div
                    className="mb-5 p-4 rounded-lg text-sm font-medium"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                    }}
                  >
                    {proofError}
                  </div>
                )}

                <form ref={formRef} onSubmit={handleProofSubmit} className="space-y-5">
                  {/* Payment method dropdown */}
                  <div>
                    <label
                      className="block text-sm mb-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Payment Method
                    </label>
                    <select
                      value={proofMethod}
                      onChange={(e) => setProofMethod(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none"
                      style={{
                        background: 'var(--surface-elevated, #1a1a24)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="PayPal">PayPal</option>
                      <option value="Revolut">Revolut</option>
                      <option value="Binance">Binance Pay</option>
                    </select>
                  </div>

                  {/* Transaction reference */}
                  <div>
                    <label
                      className="block text-sm mb-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Transaction Reference
                    </label>
                    <input
                      type="text"
                      required
                      value={proofReference}
                      onChange={(e) => setProofReference(e.target.value)}
                      placeholder="e.g. PayPal transaction ID, Revolut reference..."
                      className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none placeholder:opacity-40"
                      style={{
                        background: 'var(--surface-elevated, #1a1a24)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  {/* Additional notes */}
                  <div>
                    <label
                      className="block text-sm mb-1.5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      Additional Notes{' '}
                      <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                    </label>
                    <textarea
                      value={proofNotes}
                      onChange={(e) => setProofNotes(e.target.value)}
                      rows={3}
                      placeholder="Anything else we should know..."
                      className="w-full px-4 py-3 rounded-lg text-sm focus:outline-none resize-none placeholder:opacity-40"
                      style={{
                        background: 'var(--surface-elevated, #1a1a24)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={proofSubmitting}
                    className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: 'var(--primary)',
                      color: '#000',
                    }}
                  >
                    {proofSubmitting ? 'Submitting...' : 'Submit Payment Proof'}
                  </button>
                </form>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* Proof Status Tracker                                           */}
            {/* ------------------------------------------------------------- */}
            {session && !proofsLoading && pendingProofs.length > 0 && (
              <div
                className="mt-8 rounded-xl p-6"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <h3
                  className="text-lg font-semibold mb-4"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Proof Status
                </h3>

                <div className="space-y-3">
                  {pendingProofs.map((proof) => (
                    <div
                      key={proof.id}
                      className="flex items-center justify-between p-4 rounded-lg"
                      style={{
                        background: 'var(--surface-elevated, #1a1a24)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {proof.method} &mdash;{' '}
                          <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {proof.reference}
                          </span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          Submitted {new Date(proof.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                      <span
                        className="text-xs px-3 py-1 rounded-full font-medium"
                        style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#fbbf24',
                        }}
                      >
                        Under Review
                      </span>
                    </div>
                  ))}

                  <p className="text-xs pt-2" style={{ color: 'var(--text-muted)' }}>
                    Your payment proof is being reviewed. You will receive an email once your
                    account is activated. This usually takes less than 24 hours.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Feature Comparison Table                                          */}
        {/* ----------------------------------------------------------------- */}
        <div className="max-w-4xl mx-auto mb-20">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            Feature Comparison
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface-elevated)' }}>
                  <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-muted)' }}>Feature</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--text-muted)' }}>Free</th>
                  <th className="text-center py-3 px-4 font-medium" style={{ color: 'var(--primary-light)' }}>SENULTRA</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Live Candlestick Charts', true, true],
                  ['Crypto Symbols (Binance)', '1', 'All'],
                  ['Futures Symbols (CME)', false, true],
                  ['Footprint Charts', false, true],
                  ['Liquidity Heatmap (WebGL)', false, true],
                  ['GEX Dashboard', false, true],
                  ['Volatility Surface', false, true],
                  ['GVS Bias Engine', false, true],
                  ['Drawing Tools', false, true],
                  ['Trading Journal', false, true],
                  ['News Calendar', false, true],
                  ['Session Replay', false, true],
                  ['Multi-Broker (IB, Rithmic, Tradovate)', false, true],
                  ['Demo Trading', true, true],
                  ['Connected Devices', '1', '2'],
                  ['Priority Support', false, true],
                ].map(([feature, free, ultra], i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'transparent' }}>
                    <td className="py-2.5 px-4" style={{ color: 'var(--text-secondary)' }}>{feature as string}</td>
                    <td className="text-center py-2.5 px-4">
                      {free === true ? <span style={{ color: 'var(--primary)' }}>&#10003;</span>
                        : free === false ? <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>&mdash;</span>
                        : <span style={{ color: 'var(--text-secondary)' }}>{free as string}</span>}
                    </td>
                    <td className="text-center py-2.5 px-4">
                      {ultra === true ? <span style={{ color: 'var(--primary)' }}>&#10003;</span>
                        : <span style={{ color: 'var(--primary-light)' }}>{ultra as string}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* FAQ Section                                                        */}
        {/* ----------------------------------------------------------------- */}
        <div className="max-w-3xl mx-auto mb-20">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--text-primary)' }}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {[
              {
                q: 'Can I cancel my subscription anytime?',
                a: 'Yes, you can cancel at any time from your account settings. Your access continues until the end of the current billing period.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept Visa, Mastercard, AMEX via Stripe (instant activation), plus PayPal, Revolut, and Binance Pay (manual verification within 24h).',
              },
              {
                q: 'Is my data safe?',
                a: 'All data is encrypted in transit (TLS) and at rest. We never store your broker credentials on our servers — they stay in your browser\'s local storage.',
              },
              {
                q: 'Can I use SENULTRA on multiple devices?',
                a: 'SENULTRA supports up to 2 concurrent devices. If a third device connects, the oldest session is automatically disconnected.',
              },
              {
                q: 'Do I need a broker account to use the platform?',
                a: 'No! You can use all analysis tools with free market data from Binance. Broker connections are optional and only needed for live trading.',
              },
              {
                q: 'What is the SENBETA5 promo code?',
                a: 'SENBETA5 gives 100% off for the first month — limited to our first 5 beta testers. Enter it during checkout.',
              },
            ].map(({ q, a }, i) => (
              <details key={i} className="stagger-fade-up group rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none select-none">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{q}</span>
                  <span className="ml-4 flex-shrink-0 transition-transform group-open:rotate-45 text-lg" style={{ color: 'var(--text-muted)' }}>+</span>
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Anti-sharing notice                                               */}
        {/* ----------------------------------------------------------------- */}
        <div className="max-w-3xl mx-auto mb-10">
          <div
            className="rounded-xl p-6 text-center"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <h3
              className="text-base font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Anti-Sharing Policy
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Each SENULTRA account is limited to <strong style={{ color: 'var(--text-secondary)' }}>2 devices maximum</strong>.
              Account sharing is automatically detected and will result in immediate suspension.
            </p>
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Contact                                                           */}
        {/* ----------------------------------------------------------------- */}
        <div className="text-center mb-10">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Questions?{' '}
            <a
              href="mailto:ryad.bouderga78@gmail.com"
              className="underline underline-offset-2 transition-colors"
              style={{ color: 'var(--primary-light)' }}
            >
              ryad.bouderga78@gmail.com
            </a>
          </p>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Footer / Back to home                                             */}
        {/* ----------------------------------------------------------------- */}
        <div className="text-center">
          <Link
            href="/"
            className="text-sm underline underline-offset-2 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export with Suspense boundary (required for useSearchParams)
// ---------------------------------------------------------------------------

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: 'var(--background)' }}
        >
          <div
            className="animate-spin rounded-full h-8 w-8 border-t-2"
            style={{ borderColor: 'var(--primary)' }}
          />
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}
