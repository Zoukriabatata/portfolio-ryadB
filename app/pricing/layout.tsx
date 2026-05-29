import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — OrderflowV2 PRO $29/month (free preview until 17 June)',
  description:
    'OrderflowV2 PRO — $29/month. Footprint charts, liquidity heatmap, GEX dashboard, trading journal, multi-broker (Rithmic, NinjaTrader Bridge, dxFeed, Binance). Free public preview until 17 June 2026 — no credit card required.',
  keywords: [
    'orderflow pricing',
    'footprint chart software price',
    'GEX dashboard subscription',
    'ATAS alternative price',
    'Bookmap alternative price',
    'Sierra Chart alternative pricing',
    'futures trading software',
  ],
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'OrderflowV2 PRO — $29/month · Free until 17 June 2026',
    description:
      'Footprint, heatmap, GEX, journal, multi-broker. Public preview free until 17/06/2026, no card required.',
    url: '/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OrderflowV2 PRO — $29/mo',
    description: 'Free preview until 17/06/2026, no card required.',
  },
};

// Product / Offer structured data — Google may show price + availability
// directly in the SERP card (rich result). Hardcoded values mirror the
// constants in app/pricing/page.tsx to keep the schema honest with what
// the user actually sees. The offer URL must resolve to the same origin
// the property is verified on in Search Console — see sitemap.ts for the
// same NEXT_PUBLIC_APP_URL → NEXTAUTH_URL → Vercel fallback chain.
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://orderflow-v2.vercel.app';

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'OrderflowV2 PRO',
  description:
    'Professional orderflow desktop platform — footprint charts, liquidity heatmap, GEX dashboard, multi-broker connectors, trading journal.',
  brand: { '@type': 'Brand', name: 'Senzoukria' },
  offers: {
    '@type': 'Offer',
    priceCurrency: 'USD',
    price: '29',
    availability: 'https://schema.org/InStock',
    priceValidUntil: '2027-12-31',
    url: `${SITE_URL}/pricing`,
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      {children}
    </>
  );
}
