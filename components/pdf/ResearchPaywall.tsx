'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ReactNode, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  Feature list for the paywall CTA                                   */
/* ------------------------------------------------------------------ */

const PACK_FEATURES = [
  '17 papers académiques analysés et synthétisés',
  'Insights filtrés pour CVD, Volume Profile, Absorption, DOM, Heatmap',
  'Schémas footprint style ATAS avec Entry / Target / Stop',
  'Matrice de timeframes idéaux par outil et style de trading',
  '36 idées d\'implémentation concrètes',
  'Formules essentielles (Hawkes, Propagator, OFI, Square-root law)',
  'Framework pratique en 6 étapes pour combiner les outils',
  'Mises à jour incluses à vie',
];

const PREVIEW_QUOTES = [
  { text: 'L\'OFI prédit linéairement les variations de prix à haute fréquence avec un R² significatif.', src: 'Cont et al., Coxon, Veldman' },
  { text: 'Les flux d\'ordres buy/sell exhibent un "self-excitement" (processus de Hawkes) — un gros achat déclenche des achats enfants.', src: 'Tiwari, Chen-Horst-Tran' },
  { text: 'Seuls 1-3% du volume quotidien sont visibles dans le LOB à un instant t.', src: 'Bouchaud-Bonart, Coxon' },
];

/* ------------------------------------------------------------------ */
/*  Fake blurred preview — decorative only, contains NO real content   */
/* ------------------------------------------------------------------ */

function DecorativeBlur() {
  return (
    <div className="pointer-events-none select-none" aria-hidden="true" style={{ maxHeight: 480, overflow: 'hidden' }}>
      <div style={{ filter: 'blur(10px)', opacity: 0.25 }}>
        {/* Fake card blocks — purely decorative, no real data */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="mb-6 rounded-xl border p-6"
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
      {/* Gradient fade to background */}
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
  /** Content visible to everyone (header, intro) */
  preview: ReactNode;
  /** Content behind the paywall — NEVER rendered for non-authorized users */
  children: ReactNode;
}

export default function ResearchPaywall({ preview, children }: ResearchPaywallProps) {
  const { data: session, status } = useSession();

  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');

  const isLoading = status === 'loading';
  const isUltra = session?.user?.tier === 'ULTRA';
  const hasResearchPack = session?.user?.hasResearchPack === true;
  const hasAccess = isUltra || hasResearchPack;
  const isLoggedIn = !!session?.user;

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
        setPurchaseError(data.error || 'Erreur de paiement');
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setPurchaseError('Erreur réseau. Réessayez.');
    } finally {
      setPurchasing(false);
    }
  }

  // Authorized users see everything — children are rendered
  if (hasAccess) {
    return (
      <>
        {preview}
        {children}
      </>
    );
  }

  // NOT authorized — children are NEVER rendered, NEVER sent to the DOM
  // Only show the preview + decorative blur + paywall card
  return (
    <>
      {preview}

      <div className="relative mt-12">
        {/* Decorative blur — contains NO real content, just placeholder shapes */}
        <DecorativeBlur />

        {/* ── Paywall card ── */}
        <div className="absolute inset-x-0 top-8 flex justify-center px-4">
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(99,102,241,0.08)',
            }}
          >
            {/* Header */}
            <div
              className="px-6 py-5 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3
                className="text-xl font-bold tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Research Pack
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Accès complet à la bibliothèque de recherche orderflow
              </p>
            </div>

            {/* Price */}
            <div className="px-6 py-5 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>$39</span>
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>one-time</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Paiement unique — accès permanent, mises à jour incluses
              </p>
            </div>

            {/* Preview quotes */}
            <div className="space-y-3 px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Aperçu du contenu
              </p>
              {PREVIEW_QUOTES.map((q, i) => (
                <div key={i} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                  <p className="text-[12px] italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    &ldquo;{q.text}&rdquo;
                  </p>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    — {q.src}
                  </p>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Inclus dans le pack
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}
                  >
                    {purchasing ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Redirection vers Stripe...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                          <line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                        Acheter le Research Pack — $39
                      </>
                    )}
                  </button>
                  {purchaseError && (
                    <p className="text-center text-xs" style={{ color: '#ef4444' }}>{purchaseError}</p>
                  )}
                  <p className="text-center text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    Aussi inclus avec l&apos;abonnement{' '}
                    <Link href="/pricing" className="underline" style={{ color: 'var(--accent)' }}>
                      Ultra
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Link
                    href="/auth/login?callbackUrl=/pdf"
                    className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: 'var(--accent)' }}
                  >
                    Se connecter pour acheter
                  </Link>
                  <p className="text-center text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    Pas encore de compte ?{' '}
                    <Link href="/auth/register?callbackUrl=/pdf" className="underline" style={{ color: 'var(--accent)' }}>
                      Créer un compte
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
