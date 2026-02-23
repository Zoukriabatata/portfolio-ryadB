'use client';

import { useState } from 'react';

const FAQS = [
  {
    question: 'What is Senzoukria?',
    answer:
      'Senzoukria is an institutional-grade orderflow analytics platform. We provide real-time heatmaps, footprint charts, delta profiles, and gamma exposure analysis to help traders see the market microstructure.',
  },
  {
    question: 'Which brokers are supported?',
    answer:
      'We currently support Rithmic, Interactive Brokers, CQG, and AMP Futures. More integrations are coming soon.',
  },
  {
    question: 'Do I need coding knowledge?',
    answer:
      'No. Senzoukria is a visual platform with a point-and-click interface. No coding or API setup required.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes, you can start with a free trial. No credit card required to explore the platform.',
  },
  {
    question: 'What markets are covered?',
    answer:
      'We cover futures (ES, NQ, CL, GC, etc.), crypto derivatives (BTC, ETH via Binance, Bybit, Deribit), and more.',
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
                    ? 'bg-white/[0.02] border border-[rgba(var(--primary-rgb),0.15)] shadow-[0_0_15px_rgba(var(--primary-rgb),0.05)]'
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
              style={{ color: 'rgba(var(--primary-light-rgb), 0.7)' }}
            >
              Contact us
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
