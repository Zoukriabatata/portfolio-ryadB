const SITE_URL = 'https://senzoukria.com';

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Senzoukria',
  url: SITE_URL,
  description:
    'Institutional-grade orderflow analytics platform for futures and crypto traders',
  sameAs: [],
};

const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Senzoukria',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  description:
    'Professional orderflow analytics platform featuring real-time liquidity heatmaps, footprint charts, delta profiles, gamma exposure (GEX) dashboards, and volatility surface analysis for futures and crypto traders.',
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
      name: 'What is Senzoukria?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Senzoukria is an institutional-grade orderflow analytics platform with real-time heatmaps, footprint charts, delta profiles, and gamma exposure analysis.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which brokers are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Senzoukria supports Rithmic, Interactive Brokers, CQG, and AMP Futures.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need coding knowledge?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No, Senzoukria provides a visual point-and-click interface that requires no coding knowledge.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Senzoukria offers a free trial with no credit card required.',
      },
    },
    {
      '@type': 'Question',
      name: 'What markets are covered?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Senzoukria covers futures markets (ES, NQ, CL, GC) and crypto markets (BTC, ETH via Binance, Bybit, and Deribit).',
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
