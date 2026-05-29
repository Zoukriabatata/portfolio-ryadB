import type { MetadataRoute } from 'next';

// Same resolution as app/sitemap.ts — see there for the rationale.
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://orderflow-v2.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/account', '/account/setup', '/api/', '/test-dxfeed'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
