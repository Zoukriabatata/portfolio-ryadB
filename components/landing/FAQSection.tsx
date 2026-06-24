'use client';

import { useState } from 'react';

const FAQS = [
  {
    question: 'What is Senzoukria?',
    answer:
      'A Windows desktop for native footprint charts — delta, imbalance, absorption, CVD — wired into your existing NinjaTrader feed via a NinjaScript bridge. Built for futures traders on Apex / Rithmic, with a crypto path for users without a broker.',
  },
  {
    question: 'Why NinjaTrader and not Sierra or ATAS?',
    answer:
      'Because Apex Trader Funding ships NinjaTrader by default — that is where the live tick stream already runs. Sierra / ATAS users pay $50–$150/month for a closed stack. We tap the feed you already trade on, render the footprint natively, and add nothing between the exchange and your canvas.',
  },
  {
    question: 'Does the bridge work on Apex evaluations?',
    answer:
      'Yes. The NinjaScript indicator runs inside any NinjaTrader instance — eval, PA, live. It only reads the tick stream and forwards it to Senzoukria over loopback (127.0.0.1). No order routing, no broker credentials touched.',
  },
  {
    question: 'Latency vs cloud platforms?',
    answer:
      'Sub-5ms on the bridge — TCP loopback, no proxy hop, no cloud round-trip. Cloud orderflow tools route the tick through their servers (typically 80–200ms) before it reaches your browser. We render on the same machine that receives the tick.',
  },
  {
    question: 'How much does Senzoukria cost?',
    answer:
      'Senzoukria is $29/month flat — vs $50–$150/month for ATAS, Bookmap or Sierra Chart. There is a free preview so you can try the full product first, no card to start. If you don\'t subscribe, the account drops to read-only — no lock-in.',
  },
  {
    question: 'How does it compare to ATAS, Bookmap or Sierra Chart?',
    answer:
      'ATAS, Bookmap and Sierra Chart sit at $50–$150/month and lock you into their data layer. Senzoukria ships the orderflow primitives 95% of retail traders actually use — footprint, delta, imbalance, CVD, heatmap — over the NinjaTrader feed you already own. $29/month, native Windows, no broker re-onboarding.',
  },
  {
    question: 'How do I connect my data feed?',
    answer:
      'Three options. (1) NinjaTrader Bridge: install our NinjaScript file in NT, Senzoukria reads your live feed locally — no extra credentials, perfect for Apex accounts. (2) Rithmic direct: sign in with your R | Protocol login inside the app, no NT needed. (3) Crypto: Binance, Bybit and Deribit work out of the box, no account required for market data.',
  },
  {
    question: 'Do I need NinjaTrader installed?',
    answer:
      'Only if you want to use the NinjaTrader Bridge. The bridge is the easiest path for Apex Trader Funding users (you already have NT). If you don\'t use NT, plug in Rithmic credentials directly or stay on crypto — both work without NinjaTrader.',
  },
  {
    question: 'Which markets and symbols are supported?',
    answer:
      'All major CME / CBOT / NYMEX / COMEX futures: ES, MES, NQ, MNQ, RTY, YM, GC, MGC, SI, CL, MCL, NG, ZB, ZN, ZC, ZS, 6E, 6B, BTC, ETH and ~30 more. Plus crypto pairs on Binance, Bybit and Deribit (spot + perp + options). The full list of contract specs lives in the app — adding a contract is a one-line change for us.',
  },
  {
    question: 'What are the system requirements?',
    answer:
      'Windows 10 or 11, 64-bit. The .msi installer is ~8 MB and takes 30 seconds to install. macOS and Linux builds are not yet shipped — they\'re on the roadmap after the public launch settles.',
  },
  {
    question: 'How does the footprint chart work?',
    answer:
      'Each candle splits into price-level cells. Each cell shows aggressive buy volume vs aggressive sell volume with delta (buy − sell) highlighted. Imbalances (one side dominating 3:1 or more) are flagged. Cell size, palette and threshold are user-configurable. The bridge forwards NinjaTrader\'s exact daily volume counter — numbers match NT bar-for-bar.',
  },
  {
    question: 'Can I use it on multiple devices?',
    answer:
      'Yes, up to 2 machines (PC + laptop, same account). The license tracks active machines via hardware fingerprint and a 7-day heartbeat. Switching devices is automatic — no re-activation step.',
  },
  {
    question: 'Do I need coding knowledge?',
    answer:
      'No. Point-and-click throughout. The only setup step is dropping one NinjaScript file into NT if you use the bridge — a 5-step walkthrough lives at /download.',
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="relative px-6 py-24" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
          zIndex: 1,
        }}
      />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-3xl mx-auto relative" style={{ zIndex: 10 }}>
        <div className="text-center mb-14">
          <div
            data-animate="up"
            className="mb-4"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            · Before you install
          </div>
          <h2
            data-animate="up"
            data-animate-delay="1"
            className="leading-none"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontWeight: 400,
              fontSize: 'clamp(36px, 4.5vw, 56px)',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            Questions, <span style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)' }}>answered</span>
          </h2>
          <p
            data-animate="up"
            data-animate-delay="2"
            className="mt-4 dash-text-sm md:dash-text-base max-w-lg mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Everything we get asked twice. Anything else — ping us.
          </p>
        </div>

        <div data-animate="up" data-animate-delay="2">
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;

            return (
              <div
                key={i}
                className={`
                  rounded-lg px-4 -mx-4 transition-all duration-300
                  ${isOpen
                    ? 'bg-white/[0.02] border border-[rgb(var(--primary-rgb)_/_0.15)] shadow-[0_0_15px_rgb(var(--primary-rgb)_/_0.05)]'
                    : 'border border-transparent border-b-white/[0.06]'
                  }
                `}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className="w-full flex items-center justify-between py-5 text-left group cursor-pointer"
                >
                  <span
                    className={`dash-text-base font-medium transition-colors duration-200 ${
                      isOpen
                        ? ''
                        : 'group-hover:text-[var(--primary-light)]'
                    }`}
                    style={isOpen ? { color: 'var(--primary-light)' } : { color: 'var(--text-primary)' }}
                  >
                    {faq.question}
                  </span>

                  {/* Chevron icon */}
                  <span
                    className={`flex-shrink-0 ml-4 transition-transform duration-300 ${
                      isOpen ? 'rotate-180' : 'rotate-0'
                    }`}
                    style={{ color: 'var(--primary)' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>

                {/* Collapsible answer */}
                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{
                    maxHeight: isOpen ? '500px' : '0px',
                    opacity: isOpen ? 1 : 0,
                  }}
                >
                  <p
                    className="dash-text-sm leading-relaxed pb-5 mt-0"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {faq.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Contact CTA */}
        <div
          data-animate="up"
          data-animate-delay="3"
          className="mt-12 text-center"
        >
          <p
            className="dash-text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            Still stuck?{' '}
            <a
              href="/contact"
              className="hover:text-[var(--primary-light)] transition-colors underline underline-offset-2"
              style={{ color: 'rgb(var(--primary-light-rgb) / 0.75)' }}
            >
              Ping us
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
