// Same resolution as app/sitemap.ts — see there for the rationale.
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://orderflow-v2.vercel.app';

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Senzoukria',
  url: SITE_URL,
  description:
    'Professional orderflow desktop platform for futures and crypto traders',
  sameAs: [],
};

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'OrderflowV2',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Windows',
  description:
    'Professional orderflow desktop platform — footprint charts, delta, imbalance and absorption detection with broker-side session volume. Connects via NinjaTrader Bridge, Rithmic direct, or crypto (Binance / Bybit / Deribit).',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

const faqPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is OrderflowV2?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'OrderflowV2 (by Senzoukria) is a professional desktop platform for orderflow analysis — footprint charts with broker-side session volume, delta, imbalance and absorption detection for futures and crypto traders.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I connect my data feed?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Three ways. NinjaTrader Bridge: install our NinjaScript indicator if you already trade through NinjaTrader (Apex / Rithmic). Rithmic direct: sign in with your R | Protocol credentials. Crypto: live trades and orderbook from Binance, Bybit and Deribit work without any broker account.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need coding knowledge?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Point-and-click interface throughout. The only setup step is copying one NinjaScript file if you go via the NinjaTrader Bridge — a guided walkthrough lives at /download.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. A public preview runs until 17 June 2026 — full PRO access, no credit card required. After that, $29/month if you want to keep it.',
      },
    },
    {
      '@type': 'Question',
      name: 'What markets are covered?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Futures: ES, NQ, MNQ, MES, MGC, GC and other CME / CBOT / NYMEX / COMEX symbols via NinjaTrader Bridge or Rithmic direct. Crypto: BTC, ETH and other major pairs via Binance, Bybit and Deribit (options included).',
      },
    },
  ],
};

export function JsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqPageSchema),
        }}
      />
    </>
  );
}
