import type { NextConfig } from "next";
// import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // 'standalone' bundles the Node.js server for Electron packaging.
  // Not set for Vercel (uses serverless by default).
  output: process.env.ELECTRON_BUILD ? 'standalone' : undefined,

  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'jsonwebtoken'],

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
    optimizePackageImports: ['lightweight-charts', 'regl', 'zustand', 'zod', 'lucide-react'],
  },

  async headers() {
    // Headers de sécurité communs à toutes les routes. X-Frame-Options
    // a été retiré d'ici parce qu'on a besoin de l'omettre sur /live et
    // /account (qui sont embeddées dans une iframe par l'app desktop
    // Tauri) — voir les rules dédiées plus bas.
    const baseSecurityHeaders = [
      { key: 'X-Content-Type-Options',    value: 'nosniff' },
      { key: 'X-XSS-Protection',          value: '1; mode=block' },
      { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ];

    // Origins autorisées à framer /live et /account. Tauri 2 peut servir
    // l'app sous tauri://localhost (Linux) ou https://tauri.localhost
    // (Windows / macOS depuis Tauri 2) — on liste les deux.
    const tauriFrameAncestors =
      "frame-ancestors 'self' tauri://localhost https://tauri.localhost";

    return [
      // Toutes les routes SAUF /live et /account : on garde
      // X-Frame-Options DENY. La regex `(?!live$|live/|account$|account/)`
      // exclut /live, /live/<sub>, /account, /account/<sub> du match.
      {
        source: '/((?!live$|live/|account$|account/).*)',
        headers: [
          ...baseSecurityHeaders,
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      // /live et /account (et leurs sous-routes) : on remplace
      // X-Frame-Options par un CSP frame-ancestors qui autorise
      // l'app desktop Tauri. Les browsers modernes ignorent
      // X-Frame-Options en présence de frame-ancestors, donc on
      // l'omet entièrement plutôt que d'envoyer deux directives en
      // conflit.
      {
        source: '/live/:path*',
        headers: [
          ...baseSecurityHeaders,
          { key: 'Content-Security-Policy', value: tauriFrameAncestors },
        ],
      },
      {
        source: '/account/:path*',
        headers: [
          ...baseSecurityHeaders,
          { key: 'Content-Security-Policy', value: tauriFrameAncestors },
        ],
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
        source: '/academy',
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

export default withBundleAnalyzer(nextConfig);
