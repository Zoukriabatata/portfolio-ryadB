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
  name: 'Senzoukria',
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
  // The 6 highest-traffic questions from FAQSection.tsx — kept in
  // sync with the HTML rendering so Google's rich-result preview
  // matches what users actually see on the page.
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Senzoukria?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Senzoukria is a Windows desktop platform for native footprint charts — delta, imbalance, absorption detection — with the same daily volume NinjaTrader shows you on its Market Analyzer. Built for futures traders on Apex / Rithmic, with a crypto fallback for users without a broker.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is the public preview different from the paid plan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Between 30 May and 17 June 2026, every account gets full PRO access for free — no credit card, no commitment. After 17 June, the standard plan becomes $29/month.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does it compare to ATAS, Bookmap or Sierra Chart?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ATAS, Bookmap and Sierra Chart cost $50-$150/month. Senzoukria ships the orderflow features 95% of retail traders actually use (footprint, delta, imbalance) with a NinjaTrader bridge so you keep your existing Apex / Rithmic feed. $29/month after the preview.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I connect my data feed?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Three options. NinjaTrader Bridge: install our NinjaScript file in NT, Senzoukria reads your live feed locally — perfect for Apex accounts. Rithmic direct: sign in with R | Protocol credentials inside the app. Crypto: Binance, Bybit and Deribit work out of the box, no account required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which markets and symbols are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'All major CME / CBOT / NYMEX / COMEX futures: ES, MES, NQ, MNQ, RTY, YM, GC, MGC, SI, CL, MCL, NG, ZB, ZN, ZC, ZS, 6E, 6B, BTC, ETH and ~30 more. Plus crypto pairs on Binance, Bybit and Deribit (spot, perp, options).',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need coding knowledge?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Point-and-click throughout. The only setup step is copying one NinjaScript file if you use the NinjaTrader Bridge — a 5-step walkthrough lives at /download.',
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
