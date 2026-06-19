import type { MetadataRoute } from 'next';

// Resolution order matches lib/config/app-url.ts:
//   1. NEXT_PUBLIC_APP_URL  — explicit override (set if/when a real domain
//      is registered and pointed at Vercel)
//   2. NEXTAUTH_URL         — already set on Vercel Production to the
//      project's canonical URL (https://orderflow-v2.vercel.app today)
//   3. Hardcoded Vercel URL — last-resort default that at least returns
//      a reachable origin instead of a domain that doesn't resolve;
//      previously fell back to 'https://senzoukria.com' which is not
//      registered, so Search Console rejected the sitemap with
//      "Impossible de récupérer le sitemap".
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://orderflow-v2.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Public marketing / info pages
  const publicPages = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' as const },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/boutique', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/auth/login', priority: 0.6, changeFrequency: 'yearly' as const },
    { path: '/auth/register', priority: 0.7, changeFrequency: 'yearly' as const },
    { path: '/legal/terms', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/legal/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/academy', priority: 0.8, changeFrequency: 'monthly' as const },
    // Public SEO content cluster (educational order-flow guides).
    { path: '/learn', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/learn/how-to-read-a-footprint-chart', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/learn/cumulative-delta-explained', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/learn/order-flow-imbalance', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/learn/absorption-in-trading', priority: 0.7, changeFrequency: 'monthly' as const },
    // Comparison page (AI-citable: "best footprint software", "ATAS alternative").
    { path: '/compare', priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  // App pages (lower priority, still indexable for SEO value).
  // GEX / Bias / Volatility / Replay / Heatmap remain in the desktop
  // app but are intentionally NOT marketed on the site for this launch
  // — see components/landing/FeaturesSection.tsx for the public surface.
  // Add /download to the marketing list because that's where users land
  // from TikTok / Discord and where the NinjaScript bridge is fetched.
  const appPages = [
    { path: '/download', priority: 0.95, changeFrequency: 'weekly' as const },
    { path: '/dashboard', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/live', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/footprint', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/news', priority: 0.5, changeFrequency: 'daily' as const },
    { path: '/journal', priority: 0.4, changeFrequency: 'weekly' as const },
    { path: '/backtest', priority: 0.4, changeFrequency: 'weekly' as const },
  ];

  return [...publicPages, ...appPages].map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
