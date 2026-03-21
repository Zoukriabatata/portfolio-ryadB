import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: false,
  poweredByHeader: false,

  productionBrowserSourceMaps: false,
  compress: true,

  images: {
    formats: ['image/avif', 'image/webp'],
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  experimental: {
    optimizePackageImports: ['@sentry/nextjs', 'lightweight-charts', 'regl', 'zustand', 'zod', 'lucide-react'],
  },

  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options',    value: 'nosniff' },
      { key: 'X-Frame-Options',           value: 'DENY' },
      { key: 'X-XSS-Protection',          value: '1; mode=block' },
      { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ];

    return [
      // Apply security headers to all routes
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // SEO: allow Google to index public pages
      {
        source: '/',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      {
        source: '/pricing',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      {
        source: '/pdf',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      {
        source: '/boutique',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      {
        source: '/auth/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      {
        source: '/legal/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }],
      },
      // Cache headers for data APIs
      {
        source: '/api/binance/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=30, stale-while-revalidate=60' },
        ],
      },
      {
        source: '/api/history/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=120' },
        ],
      },
    ];
  },
};

// Wrapping avec Bundle Analyzer + Sentry
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // Sentry Webpack Plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Authentication token pour upload des source maps
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Désactiver en dev (pas besoin d'upload)
  silent: process.env.NODE_ENV !== 'production',

  // Upload des source maps uniquement en production
  widenClientFileUpload: true,
  sourcemaps: {
    disable: false, // Enable source maps upload
  },
  webpack: { treeshake: { removeDebugLogging: true } },
});
