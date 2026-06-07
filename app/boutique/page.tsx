'use client';

export const dynamic = 'force-dynamic';

// ─── Senzoukria — Data Feeds ("boutique") ─────────────────────────────
// Refonte 2026-06 : l'offre s'est resserrée aux 3 voies réelles de
// connexion. On ne propose plus dxFeed / Databento / IB / CQG / AMP /
// Tradovate ni les prop firms. La page reste un hub FONCTIONNEL (la
// connexion crypto + Rithmic passe toujours par ConfigureModal /
// /api/datafeed), mais redessinée dans la charte « Editorial Terminal ».
//
//   1. Crypto       — Binance · Bybit · Deribit. Instantané, sans compte.
//   2. Rithmic direct — R | Protocol, credentials Apex/Rithmic (PRO).
//   3. NinjaTrader Bridge — install desktop (NinjaScript). Guidé → /download.

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useDataFeedStore } from '@/stores/useDataFeedStore';
import { getProviderById } from '@/lib/boutique/providers';
import ProviderCard from '@/components/boutique/ProviderCard';
import ConfigureModal from '@/components/boutique/ConfigureModal';

const MONO = 'var(--font-jetbrains-mono)';

const CRYPTO_IDS = ['binance', 'bybit', 'deribit'] as const;
const RITHMIC_ID = 'rithmic';

const CONNECTION_FAQ = [
  {
    question: 'Which feed should I use?',
    answer:
      'Trading crypto? Connect Binance, Bybit or Deribit in one click — no account, no key. Trading futures on an Apex / Rithmic account? Use the NinjaTrader Bridge (easiest, reads the feed you already run) or plug your Rithmic login directly into the desktop.',
  },
  {
    question: 'Do crypto feeds need an account or API key?',
    answer:
      'No. Binance, Bybit and Deribit stream over public WebSocket — orderbook, trade tape and options chain come online within seconds of clicking Connect. Nothing to sign, nothing to pay.',
  },
  {
    question: 'How does the NinjaTrader Bridge work?',
    answer:
      'You already run NinjaTrader. Drop our NinjaScript file in, F5 compile, attach the indicator — Senzoukria reads the same tick feed NT shows you, locally over loopback (127.0.0.1). No order routing, no broker credentials touched. The 5-step walkthrough lives on the download page.',
  },
  {
    question: 'Is Rithmic direct included?',
    answer:
      'Yes. Bring your Rithmic / Apex login and the desktop speaks R | Protocol natively — Protocol Buffers over WebSocket, separate sessions for market data and order routing. No NinjaTrader required for this path.',
  },
];

export default function BoutiquePage() {
  const { data: session } = useSession();
  const configs = useDataFeedStore(s => s.configs);

  const [configureProvider, setConfigureProvider] = useState<string | null>(null);

  const userTier = (session?.user as { tier?: 'FREE' | 'PRO' } | undefined)?.tier || 'FREE';

  const cryptoProviders = CRYPTO_IDS.map(id => getProviderById(id)).filter(
    (p): p is NonNullable<ReturnType<typeof getProviderById>> => Boolean(p),
  );
  const rithmic = getProviderById(RITHMIC_ID);

  // Count only feeds we still surface here.
  const displayedIds = [...CRYPTO_IDS, RITHMIC_ID] as string[];
  const connectedCount = displayedIds.filter(id => configs[id as keyof typeof configs]?.status === 'connected').length;

  const activeProvider = configureProvider ? getProviderById(configureProvider) : null;

  return (
    <div
      className="h-full overflow-y-auto relative"
      style={{ background: 'var(--background)', color: 'var(--text-primary)' }}
    >
      {/* ── Atmosphere ───────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }} aria-hidden="true">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[55vh]"
          style={{ background: 'radial-gradient(ellipse at center top, var(--primary-glow) 0%, transparent 70%)', opacity: 0.4 }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse 90% 55% at 50% 0%, black 0%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 90% 55% at 50% 0%, black 0%, transparent 75%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div className="text-center mb-14">
          <div
            className="mb-4 animate-slideUp"
            style={{
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
              color: 'var(--text-muted)', animationDelay: '40ms', animationFillMode: 'both',
            }}
          >
            · Data Feeds
          </div>
          <h1
            className="font-display leading-none animate-slideUp text-[clamp(36px,5vw,60px)]"
            style={{
              color: 'var(--text-primary)',
              WebkitFontSmoothing: 'subpixel-antialiased', animationDelay: '100ms', animationFillMode: 'both',
            }}
          >
            Plug in<br />your <span className="font-display-accent">feed.</span>
          </h1>
          <p
            className="mt-5 dash-text-sm md:dash-text-base max-w-md mx-auto animate-slideUp"
            style={{ color: 'var(--text-secondary)', animationDelay: '180ms', animationFillMode: 'both' }}
          >
            Three ways to stream live market data into Senzoukria — crypto in one click,
            futures through the bridge you already run, or Rithmic direct.
          </p>

          {connectedCount > 0 && (
            <div
              className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-full"
              style={{
                fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success) 22%, transparent)', color: 'var(--success)',
              }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--success)' }} />
              {connectedCount} {connectedCount === 1 ? 'feed connected' : 'feeds connected'}
            </div>
          )}
        </div>

        {/* ── 1 · Crypto ─────────────────────────────────────────── */}
        <SectionHead index="01" label="Crypto" note="Instant · no account · free" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {cryptoProviders.map((provider, i) => (
            <div
              key={provider.id}
              className="animate-slideUp"
              style={{ animationDelay: `${120 + i * 70}ms`, animationFillMode: 'both' }}
            >
              <ProviderCard
                provider={provider}
                status={configs[provider.id]?.status || 'not_configured'}
                userTier={userTier}
                onConfigure={setConfigureProvider}
              />
            </div>
          ))}
        </div>

        {/* ── 2 · Rithmic direct ─────────────────────────────────── */}
        {rithmic && (
          <>
            <SectionHead index="02" label="Rithmic direct" note="R | Protocol · Apex / Rithmic login" />
            <div className="grid lg:grid-cols-[minmax(0,360px)_1fr] gap-6 items-stretch mb-16">
              <div className="animate-slideUp" style={{ animationFillMode: 'both' }}>
                <ProviderCard
                  provider={rithmic}
                  status={configs[rithmic.id]?.status || 'not_configured'}
                  userTier={userTier}
                  onConfigure={setConfigureProvider}
                />
              </div>
              <div
                className="card-lift rounded-2xl p-6 flex flex-col justify-center animate-slideUp"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', animationDelay: '80ms', animationFillMode: 'both' }}
              >
                <p className="dash-text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Bring your Rithmic / Apex credentials and the desktop speaks{' '}
                  <span style={{ color: 'var(--primary-light)' }}>R | Protocol</span> natively — Protocol
                  Buffers over WebSocket, separate sessions for market data and order routing. No NinjaTrader required.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['CME', 'CBOT', 'NYMEX', 'COMEX', 'Sub-ms', 'L2 DOM'].map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                      style={{
                        fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em',
                        color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface-elevated)',
                      }}
                    >
                      <span className="w-1 h-1 rounded-full" style={{ background: 'rgb(var(--primary-rgb) / 0.5)' }} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── 3 · NinjaTrader Bridge ─────────────────────────────── */}
        <SectionHead index="03" label="NinjaTrader Bridge" note="Easiest for Apex · reads your live feed" />
        <Link
          href="/download"
          className="group block rounded-2xl p-6 sm:p-8 mb-16 relative overflow-hidden transition-all duration-300 hover:translate-y-[-2px] animate-slideUp"
          style={{
            background: 'rgb(var(--primary-rgb) / 0.07)',
            border: '1px solid rgb(var(--primary-rgb) / 0.25)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 0 40px rgb(var(--primary-rgb) / 0.08)',
            animationFillMode: 'both',
          }}
        >
          {/* corner ticks */}
          {['top-3 left-3 border-t border-l', 'top-3 right-3 border-t border-r', 'bottom-3 left-3 border-b border-l', 'bottom-3 right-3 border-b border-r'].map(pos => (
            <span key={pos} aria-hidden="true" className={`absolute w-3 h-3 pointer-events-none ${pos}`} style={{ borderColor: 'rgb(var(--primary-rgb) / 0.35)' }} />
          ))}
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="px-2 py-0.5 rounded-full"
                  style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'rgb(var(--primary-rgb) / 0.15)', color: 'var(--primary)', border: '1px solid rgb(var(--primary-rgb) / 0.35)' }}
                >
                  Recommended
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Futures · Apex · Rithmic
                </span>
              </div>
              <h3 style={{ fontFamily: MONO, fontWeight: 600, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                NinjaTrader Bridge
              </h3>
              <p className="dash-text-sm mt-2 leading-relaxed max-w-xl" style={{ color: 'var(--text-secondary)' }}>
                Drop our NinjaScript file into NinjaTrader, hit F5, attach the indicator — Senzoukria reads
                the same tick feed NT shows you, locally over loopback. Sub-5ms, no extra credentials, no order
                routing touched. The setup is a desktop step, not a browser connect.
              </p>
            </div>
            <div
              className="btn-brand inline-flex items-center gap-2 px-5 py-3 rounded-xl shrink-0 self-start md:self-center transition-all duration-200 group-hover:gap-3"
              style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}
            >
              Get the bridge
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </div>
          </div>
        </Link>

        {/* ── How it works ───────────────────────────────────────── */}
        <SectionHead index="—" label="How it works" note="Choose · connect · stream" centered />
        <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto mb-20">
          {[
            { step: '1', title: 'Choose a path', desc: 'Crypto for one-click streaming, or futures through the bridge / Rithmic direct.' },
            { step: '2', title: 'Connect', desc: 'Crypto connects instantly — no key. Futures: your Rithmic login, or the NinjaScript bridge.' },
            { step: '3', title: 'Stream', desc: 'Real-time orderbook, tape and options flow straight into your footprint and heatmap.' },
          ].map((item, i) => (
            <div key={i} className="text-center group animate-slideUp" style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{ background: 'var(--primary-glow)', border: '1px solid color-mix(in srgb, var(--primary) 22%, transparent)', fontFamily: MONO, fontWeight: 600, fontSize: 16, color: 'var(--primary)' }}
              >
                {item.step}
              </div>
              <h3 className="dash-text-base font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
              <p className="dash-text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
            </div>
          ))}
        </div>

        {/* ── FAQ ────────────────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto">
          <div
            className="text-center mb-6"
            style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)' }}
          >
            · Connecting your data
          </div>
          {CONNECTION_FAQ.map((faq, i) => (
            <details
              key={i}
              className="group rounded-lg px-4 -mx-4 mb-1 transition-all duration-300 open:bg-white/[0.02] open:border open:border-[rgb(var(--primary-rgb)_/_0.15)] border border-transparent border-b-white/[0.06]"
            >
              <summary className="flex items-center justify-between py-4 cursor-pointer list-none select-none">
                <span className="dash-text-sm md:dash-text-base font-medium pr-4 group-open:text-[var(--primary-light)]" style={{ color: 'var(--text-primary)' }}>
                  {faq.question}
                </span>
                <span className="shrink-0 transition-transform duration-300 group-open:rotate-180" style={{ color: 'var(--primary)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
              </summary>
              <p className="dash-text-sm leading-relaxed pb-4" style={{ color: 'var(--text-secondary)' }}>
                {faq.answer}
              </p>
            </details>
          ))}

          <p className="mt-8 text-center dash-text-sm" style={{ color: 'var(--text-muted)' }}>
            New to Senzoukria?{' '}
            <Link href="/download" className="underline underline-offset-2 transition-colors hover:text-[var(--primary-light)]" style={{ color: 'rgb(var(--primary-light-rgb) / 0.75)' }}>
              Install the desktop
            </Link>{' '}·{' '}
            <Link href="/pricing" className="underline underline-offset-2 transition-colors hover:text-[var(--primary-light)]" style={{ color: 'rgb(var(--primary-light-rgb) / 0.75)' }}>
              See the plan
            </Link>
          </p>
        </div>
      </div>

      {/* Configure Modal — functional connect flow (unchanged) */}
      {activeProvider && (
        <ConfigureModal
          provider={activeProvider}
          onClose={() => setConfigureProvider(null)}
        />
      )}
    </div>
  );
}

// ─── Section heading — mono index + label + divider note ───────────────
function SectionHead({ index, label, note, centered = false }: { index: string; label: string; note: string; centered?: boolean }) {
  return (
    <div className={`flex items-center gap-3 mb-6 ${centered ? 'justify-center' : ''}`}>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--primary)' }}>
        {index}
      </span>
      <h2 style={{ fontFamily: MONO, fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
        {label}
      </h2>
      {!centered && <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />}
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {note}
      </span>
    </div>
  );
}
