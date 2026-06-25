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
  logo: `${SITE_URL}/opengraph-image`,
  description:
    'Professional orderflow desktop platform for futures and crypto traders',
  // Official brand profiles — helps Google build the Senzoukria brand entity
  // and disambiguate it from the unrelated "Senzoukria" music artist.
  sameAs: [
    'https://x.com/Senzoukria',
    'https://www.youtube.com/@Zoukriabatata',
    'https://www.instagram.com/senzoukria',
    'https://www.tiktok.com/@zkb.trade',
    'https://discord.gg/ZcTVrpsG6',
    'https://www.linkedin.com/in/sen-zoukria-2a44b0386',
  ],
};

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Senzoukria',
  applicationCategory: 'FinanceApplication',
  applicationSubCategory: 'Order flow / footprint charting software',
  operatingSystem: 'Windows 10, Windows 11',
  url: SITE_URL,
  image: `${SITE_URL}/opengraph-image`,
  screenshot: `${SITE_URL}/opengraph-image`,
  description:
    'Senzoukria is a native footprint and order-flow charting software for futures and crypto traders — bid/ask volume, delta, imbalance, absorption, liquidity heatmap and integrated GEX. It bridges your existing NinjaTrader feed (Apex / Rithmic) with one NinjaScript file, connects to Rithmic directly, or to crypto (Binance / Bybit / Deribit) with no broker.',
  featureList: [
    'Native footprint charts (bid/ask volume, delta, imbalance, absorption)',
    'Cumulative volume delta (CVD)',
    'Liquidity heatmap',
    'Integrated GEX (gamma exposure)',
    'NinjaTrader bridge (Apex / Rithmic), sub-5ms, no proxy',
    'Direct Rithmic connection',
    'Crypto: Binance, Bybit, Deribit (no broker needed)',
  ],
  offers: {
    '@type': 'Offer',
    price: '29',
    priceCurrency: 'USD',
    category: 'Monthly subscription',
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
      name: 'How much does Senzoukria cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Senzoukria is $29/month flat — versus $50-150/month for ATAS, Bookmap or Sierra Chart. There is a free preview so you can try the full product before subscribing, no credit card to start.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does it compare to ATAS, Bookmap or Sierra Chart?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ATAS, Bookmap and Sierra Chart cost $50-$150/month. Senzoukria ships the orderflow features 95% of retail traders actually use (footprint, delta, imbalance) with a NinjaTrader bridge so you keep your existing Apex / Rithmic feed. $29/month flat.',
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
