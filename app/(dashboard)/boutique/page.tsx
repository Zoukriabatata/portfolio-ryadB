'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DataFeedIcon } from '@/components/ui/Icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Provider {
  id: string;
  name: string;
  letter: string;
  color: string;
  borderColor: string;
  markets: string[];
  price: string;
  description: string;
  latency: string;
  bestFor: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const PROVIDERS: Provider[] = [
  {
    id: 'ib',
    name: 'Interactive Brokers',
    letter: 'IB',
    color: '#dc2626',
    borderColor: '#ef4444',
    markets: ['Stocks', 'Options', 'Futures', 'Forex'],
    price: 'From $10/mo',
    description: 'Full market access with TWS API gateway. Industry-standard brokerage with global reach and comprehensive data coverage.',
    latency: '~10ms',
    bestFor: 'Multi-asset traders',
  },
  {
    id: 'dxfeed',
    name: 'dxFeed',
    letter: 'dX',
    color: '#2563eb',
    borderColor: '#3b82f6',
    markets: ['US Equities', 'Options', 'CME Futures'],
    price: 'Varies',
    description: 'Professional-grade market data with low-latency streaming. Trusted by institutional desks worldwide.',
    latency: '~5ms',
    bestFor: 'Options & equities',
  },
  {
    id: 'rithmic',
    name: 'Rithmic',
    letter: 'R',
    color: '#16a34a',
    borderColor: '#22c55e',
    markets: ['CME', 'CBOT', 'NYMEX', 'COMEX'],
    price: '~$50/mo',
    description: 'Ultra-low latency futures data with direct exchange connectivity. The gold standard for futures scalpers.',
    latency: '<1ms',
    bestFor: 'Futures scalpers',
  },
  {
    id: 'amp',
    name: 'AMP Futures',
    letter: 'A',
    color: '#9333ea',
    borderColor: '#a855f7',
    markets: ['CME Futures'],
    price: 'Included w/ account',
    description: 'Commission-free futures data bundled with your trading account. Zero additional data fees.',
    latency: '~3ms',
    bestFor: 'Cost-conscious traders',
  },
];

const FAQ_ITEMS = [
  {
    question: 'What data feeds are supported?',
    answer:
      'SENZOUKRIA currently supports Interactive Brokers (via TWS API), dxFeed, Rithmic, and AMP Futures. We are continuously adding new providers. Each integration is optimized for low-latency streaming with automatic reconnection and failover.',
  },
  {
    question: 'Do I need a separate subscription?',
    answer:
      'Yes. Data feed subscriptions are managed directly with the provider. SENZOUKRIA connects to your existing account -- we do not resell market data. You will need an active subscription or account with the provider you choose before configuring the connection here.',
  },
  {
    question: 'Can I use multiple data feeds?',
    answer:
      'Absolutely. You can configure multiple providers simultaneously. For example, you could use Rithmic for ultra-low latency CME futures while also pulling equity options data from dxFeed. SENZOUKRIA will merge and deduplicate the streams automatically.',
  },
  {
    question: 'What if my connection fails?',
    answer:
      'SENZOUKRIA includes automatic reconnection with exponential back-off. If a connection drops, the system will attempt to re-establish it within seconds. You will see a status indicator on the chart and receive a notification. Historical data is cached locally so there is no gap in your charts.',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <div
      className="relative rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{
        backgroundColor: 'var(--surface)',
        borderLeft: `4px solid ${provider.borderColor}`,
        border: `1px solid var(--border)`,
        borderLeftWidth: '4px',
        borderLeftColor: provider.borderColor,
      }}
    >
      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start gap-4 mb-4">
          {/* Logo placeholder */}
          <div
            className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-white text-sm"
            style={{ backgroundColor: provider.color }}
          >
            {provider.letter}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {provider.name}
            </h3>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {provider.description}
            </p>
          </div>
        </div>

        {/* Markets tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {provider.markets.map((market) => (
            <span
              key={market}
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{
                backgroundColor: `${provider.color}15`,
                color: provider.borderColor,
                border: `1px solid ${provider.color}30`,
              }}
            >
              {market}
            </span>
          ))}
        </div>

        {/* Price & status */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Indicative pricing
            </span>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {provider.price}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--text-muted)', opacity: 0.5 }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Not Configured
            </span>
          </div>
        </div>

        {/* Configure button */}
        <Link
          href={`/boutique/setup/${provider.id}`}
          className="block w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
          style={{
            backgroundColor: 'var(--primary)',
            color: '#000',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--primary-light)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--primary)';
          }}
        >
          Configure
        </Link>
      </div>
    </div>
  );
}

function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: 'var(--surface)' }}>
            {['Provider', 'Markets', 'Latency', 'Price', 'Best For'].map((header) => (
              <th
                key={header}
                className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROVIDERS.map((provider, idx) => (
            <tr
              key={provider.id}
              className="transition-colors duration-150"
              style={{
                borderBottom: idx < PROVIDERS.length - 1 ? '1px solid var(--border)' : undefined,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: provider.color }}
                  >
                    {provider.letter}
                  </div>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {provider.name}
                  </span>
                </div>
              </td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-1">
                  {provider.markets.map((m) => (
                    <span
                      key={m}
                      className="px-2 py-0.5 rounded text-xs"
                      style={{
                        backgroundColor: `${provider.color}15`,
                        color: provider.borderColor,
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-5 py-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                {provider.latency}
              </td>
              <td className="px-5 py-4" style={{ color: 'var(--text-secondary)' }}>
                {provider.price}
              </td>
              <td className="px-5 py-4" style={{ color: 'var(--text-muted)' }}>
                {provider.bestFor}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: '1',
      title: 'Choose a Data Provider',
      description: 'Choose your data provider and subscribe with them directly. Each provider offers different markets, latency profiles, and pricing.',
    },
    {
      number: '2',
      title: 'Enter Your Credentials',
      description: 'Enter your connection credentials in SENZOUKRIA. We securely store your API keys and authenticate with the provider on your behalf.',
    },
    {
      number: '3',
      title: 'Start Receiving Data',
      description: 'Start receiving real-time market data instantly. Streams are optimized for minimal latency with automatic reconnection.',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {steps.map((step, idx) => (
        <div key={step.number} className="relative">
          {/* Connector line between steps (hidden on mobile and after last step) */}
          {idx < steps.length - 1 && (
            <div
              className="hidden md:block absolute top-8 right-0 w-[calc(50%-16px)] h-px"
              style={{ backgroundColor: 'var(--border)', transform: 'translateX(100%)' }}
            />
          )}
          <div
            className="rounded-xl p-6 h-full transition-all duration-300 hover:-translate-y-1"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-4"
              style={{
                backgroundColor: 'var(--primary)',
                color: '#000',
              }}
            >
              {step.number}
            </div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {step.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="space-y-3">
      {FAQ_ITEMS.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div
            key={idx}
            className="rounded-xl overflow-hidden transition-all duration-200"
            style={{
              backgroundColor: 'var(--surface)',
              border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >
            <button
              onClick={() => toggle(idx)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="font-medium text-sm">{item.question}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="flex-shrink-0 ml-3 transition-transform duration-200"
                style={{
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  color: 'var(--text-muted)',
                }}
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {isOpen && (
              <div className="px-5 pb-4">
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {item.answer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DataFeedMarketplacePage() {
  return (
    <div
      className="h-full w-full overflow-auto p-6 md:p-8"
      style={{ backgroundColor: 'var(--background)', color: 'var(--text-primary)' }}
    >
      <div className="max-w-6xl mx-auto space-y-12">
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <DataFeedIcon size={28} color="var(--primary)" />
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Data Feed Marketplace
            </h1>
          </div>
          <p className="text-sm md:text-base" style={{ color: 'var(--text-muted)' }}>
            Connect your broker &amp; configure data feeds
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Provider Cards (2x2 grid)                                        */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Available Providers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {PROVIDERS.map((provider) => (
              <ProviderCard key={provider.id} provider={provider} />
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Comparison Table                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Provider Comparison
          </h2>
          <ComparisonTable />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How It Works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            How It Works
          </h2>
          <HowItWorks />
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* FAQ                                                               */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Frequently Asked Questions
          </h2>
          <FAQSection />
        </section>
      </div>
    </div>
  );
}
