'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

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
        alert(data.error || 'An error occurred. Please try again.');
        setStripeLoading(false);
      }
    } catch {
      alert('Failed to initiate checkout. Please try again.');
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
      className="min-h-screen py-16 px-4"
      style={{ background: 'var(--background)', color: 'var(--text-primary)', overflow: 'auto', height: '100vh' }}
    >
      <div className="max-w-6xl mx-auto">
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div className="text-center mb-14">
          <Link href="/" className="inline-block mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              SENZOUKRIA
            </h1>
          </Link>

          <h2
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            Choose Your Plan
          </h2>
          <p style={{ color: 'var(--text-muted)' }} className="max-w-xl mx-auto text-lg">
            Start for free. Upgrade when you need professional-grade order flow tools.
          </p>

          {/* Launch offer banner */}
          <div className="mt-6 mx-auto max-w-lg p-4 rounded-xl text-sm font-medium"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(168,85,247,0.1) 100%)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span style={{ color: 'var(--primary-light)' }} className="font-bold tracking-wide">LAUNCH OFFER</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>
              First {LAUNCH_SPOTS} subscribers get <strong style={{ color: '#fff' }}>${LAUNCH_PRICE}/mo</strong> locked for life
              <span style={{ color: 'var(--text-muted)' }}> (regular ${REGULAR_PRICE}/mo)</span>
            </p>
          </div>

          {/* Upgrade notice banner */}
          {upgrade === 'true' && from && (
            <div
              className="mt-6 mx-auto max-w-lg p-4 rounded-lg border text-sm font-medium"
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.25)',
                color: '#fbbf24',
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
            className="rounded-2xl p-8 flex flex-col"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="mb-8">
              <h3
                className="text-xl font-semibold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                FREE
              </h3>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                For exploring the platform
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
              className="block w-full py-3 text-center rounded-lg font-semibold transition-colors"
              style={{
                background: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover, #1e1e2e)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--border)';
              }}
            >
              Get Started Free
            </Link>
          </div>

          {/* SENULTRA Card */}
          <div
            className="rounded-2xl p-8 flex flex-col relative"
            style={{
              background: 'linear-gradient(170deg, rgba(16,185,129,0.06) 0%, var(--surface) 40%)',
              border: '2px solid var(--primary)',
              boxShadow: '0 0 40px rgba(16, 185, 129, 0.08)',
            }}
          >
            {/* Recommended badge */}
            <div
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-5 py-1 text-sm font-semibold rounded-full"
              style={{
                background: 'var(--primary)',
                color: '#000',
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
                For professional traders
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
                style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--primary-light)' }}>
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
                Subscribe Now
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

        {/* ----------------------------------------------------------------- */}
        {/* Payment Methods (hidden if already ULTRA)                          */}
        {/* ----------------------------------------------------------------- */}
        {!isUltra && (
          <div id="payment-methods" className="max-w-4xl mx-auto mb-20">
            <h2
              className="text-2xl font-bold text-center mb-10"
              style={{ color: 'var(--text-primary)' }}
            >
              Payment Methods
            </h2>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* Stripe (automatic) */}
              <div
                className="rounded-xl p-6"
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
                    Billing Period
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
                    Promo Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      setPromoError('');
                    }}
                    placeholder="SENBETA5"
                    maxLength={20}
                    className="w-full px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{
                      background: 'var(--surface-hover, #1e1e2e)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
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
                  {stripeLoading ? 'Redirecting...' : !session ? 'Sign in to pay' : 'Pay with Card'}
                </button>
              </div>

              {/* PayPal (manual) */}
              <div
                className="rounded-xl p-6"
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
                className="rounded-xl p-6"
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
                className="rounded-xl p-6"
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
                    onClick={() => { navigator.clipboard.writeText('1017835844'); }}
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
