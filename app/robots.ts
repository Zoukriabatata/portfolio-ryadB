import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://senzoukria.com';

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
