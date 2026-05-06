'use client';

import { useState } from 'react';

const FAQS = [
  {
    question: 'What is Senzoukria?',
    answer:
      'Senzoukria is an institutional-grade orderflow analytics platform. We provide real-time heatmaps, footprint charts, delta profiles, and gamma exposure analysis to help traders see the market microstructure.',
  },
  {
    question: 'How does Senzoukria compare to ATAS or Sierra Chart?',
    answer:
      'Senzoukria runs entirely in the browser — no installation, no license dongles, no Windows-only limitation. The core tools (heatmap, footprint, delta profiles, GEX) are comparable in quality, while the price starts at $29/mo vs $150–$300/mo for desktop platforms. We focus on a cleaner, faster UI and real-time crypto + futures in one place.',
  },
  {
    question: 'What is the data latency?',
    answer:
      'Websocket feeds from Binance, Bybit, and Deribit are sub-5ms from exchange to your browser. Tick data is processed and rendered in real time with no perceptible lag at normal market speeds. During high-volatility spikes, we throttle rendering to 60fps to keep the interface responsive.',
  },
  {
    question: 'Which brokers are supported?',
    answer:
      'We currently support Rithmic, Interactive Brokers, CQG, and AMP Futures for live order routing. For market data (charts, heatmap, footprint) no broker connection is needed — Binance, Bybit, and Deribit feeds are built-in and always-on.',
  },
  {
    question: 'Can I use it on multiple devices?',
    answer:
      'Yes. Your account works on any browser on any device. Settings, layouts, and watchlists sync automatically via your account. There is no device limit.',
  },
  {
    question: 'Do I need coding knowledge?',
    answer:
      'No. Senzoukria is a visual platform with a point-and-click interface. No coding or API setup required.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes, you can start with a free plan. No credit card required to explore the platform. The free plan includes the live candlestick chart, basic order flow data, and the trading journal. PRO tools (footprint, heatmap, GEX, volatility surface) are available with the paid plan.',
  },
  {
    question: 'What markets are covered?',
    answer:
      'We cover futures (ES, NQ, CL, GC, etc.), crypto spot and derivatives (BTC, ETH, SOL via Binance Futures, Bybit, and Deribit), and options Greeks via Deribit. Forex and equities are on the roadmap.',
  },
  {
    question: 'How does the footprint chart work?',
    answer:
      'Each candle is split into a grid of price × time cells. Each cell shows the buy volume (aggressive buys at ask) vs sell volume (aggressive sells at bid), with delta (buy − sell) highlighted. Imbalances (cells where one side dominates by 3:1 or more) are flagged visually. You can configure the cell size, color scheme, and delta threshold in the settings panel.',
  },
  {
    question: 'What is the $29/mo launch offer?',
    answer:
      'We launched with a founding-member rate of $29/mo (or $290/yr), which is guaranteed for life as long as your subscription stays active. This price will increase as we add features. Locking in now means you pay the lowest rate forever.',
  },
  {
    question: 'How do I cancel?',
    answer:
      'You can cancel anytime from your Account page — no email required, no waiting period. Your access continues until the end of the current billing period. There are no cancellation fees.',
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
            Everything you need to know about Senzoukria
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
              href="mailto:ryad.bouderga78@gmail.com"
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
