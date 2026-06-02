'use client';

import { useState } from 'react';

const FAQS = [
  {
    question: 'What is OrderflowV2?',
    answer:
      'OrderflowV2 (by Senzoukria) is a Windows desktop platform for native footprint charts — delta, imbalance, absorption detection — with the same daily volume NinjaTrader shows you on its Market Analyzer. Built for futures traders on Apex / Rithmic, with a crypto fallback for users without a broker.',
  },
  {
    question: 'How is the public preview different from the paid plan?',
    answer:
      'Between 30 May and 17 June 2026, every account gets full PRO access for free — no credit card, no commitment. After 17 June, the standard plan becomes $29/month. You\'re not locked in: if you don\'t want to pay you just don\'t subscribe and your account drops to a read-only state.',
  },
  {
    question: 'How does it compare to ATAS, Bookmap or Sierra Chart?',
    answer:
      'ATAS, Bookmap and Sierra Chart cost $50–$150/month and are powerful but heavy. OrderflowV2 ships the orderflow features 95% of retail traders actually use (footprint + delta + imbalance + heatmap), with the bridge to NinjaTrader so you keep your existing Apex / Rithmic data feed. At $29/month it sits cleanly under the alternatives.',
  },
  {
    question: 'How do I connect my data feed?',
    answer:
      'Three options. (1) NinjaTrader Bridge: install our NinjaScript file in NT, OrderflowV2 reads your live feed locally — no extra credentials, perfect for Apex accounts. (2) Rithmic direct: sign in with your R | Protocol login inside the app, no NT needed. (3) Crypto: Binance, Bybit and Deribit work out of the box, no account required for market data.',
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
      'Each candle is split into price-level cells. Each cell shows aggressive buy volume vs aggressive sell volume, with delta (buy − sell) highlighted. Imbalances (one side dominating 3:1 or more) are flagged visually. Cell size, color scheme and delta threshold are configurable. The bridge sends NinjaTrader\'s exact daily volume counter so the numbers match NT bar-for-bar.',
  },
  {
    question: 'Can I use it on multiple devices?',
    answer:
      'Yes, up to 2 machines (PC + laptop, same account). The license tracks active machines via hardware fingerprint and a 7-day heartbeat. Switching devices is automatic — no re-activation step.',
  },
  {
    question: 'Do I need coding knowledge?',
    answer:
      'No. Point-and-click throughout. The only "setup" step is copying one NinjaScript file if you use the NinjaTrader Bridge — a 5-step walkthrough lives at /download.',
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
          <h2
            data-animate="up"
            className="text-3xl md:text-4xl font-bold text-white tracking-tight"
          >
            Frequently Asked Questions
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm md:text-base text-white/50 max-w-lg mx-auto"
          >
            Everything you need to know before downloading OrderflowV2
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
                    className={`text-[14px] font-medium transition-colors duration-200 ${
                      isOpen
                        ? ''
                        : 'text-white group-hover:text-[var(--primary-light)]'
                    }`}
                    style={isOpen ? { color: 'var(--primary-light)' } : undefined}
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
                  <p className="text-[13px] text-white/45 leading-relaxed pb-5 mt-0">
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
          <p className="text-[13px] text-white/40">
            Still have questions?{' '}
            <a
              href="/contact"
              className="hover:text-[var(--primary-light)] transition-colors underline underline-offset-2"
              style={{ color: 'rgb(var(--primary-light-rgb) / 0.7)' }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
