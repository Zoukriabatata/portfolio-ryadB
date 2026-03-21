import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://senzoukria.com';

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
    { path: '/pdf', priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  // App pages (lower priority, still indexable for SEO value)
  const appPages = [
    { path: '/dashboard', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/live', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/footprint', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/liquidity', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/gex', priority: 0.6, changeFrequency: 'daily' as const },
    { path: '/volatility', priority: 0.6, changeFrequency: 'daily' as const },
    { path: '/bias', priority: 0.5, changeFrequency: 'daily' as const },
    { path: '/news', priority: 0.5, changeFrequency: 'daily' as const },
    { path: '/journal', priority: 0.4, changeFrequency: 'weekly' as const },
    { path: '/replay', priority: 0.4, changeFrequency: 'weekly' as const },
    { path: '/backtest', priority: 0.4, changeFrequency: 'weekly' as const },
  ];

  return [...publicPages, ...appPages].map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
