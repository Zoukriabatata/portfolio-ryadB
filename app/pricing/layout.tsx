import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Senzoukria PRO, $29/month',
  description:
    'Senzoukria PRO — $29/month. Native orderflow & footprint software for futures and crypto: delta, imbalance, absorption, liquidity heatmap, GEX, journal.',
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
    title: 'Senzoukria PRO — $29/month',
    description:
      'Native orderflow & footprint software for futures and crypto — footprint, liquidity heatmap, GEX, journal, multi-broker.',
    url: '/pricing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Senzoukria PRO — $29/mo',
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
  name: 'Senzoukria PRO',
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
