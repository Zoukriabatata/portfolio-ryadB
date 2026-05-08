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

    // Origins autorisées à framer /live et /account.
    // - tauri://localhost  : Tauri 2 sur Linux + macOS en build packagé
    // - https://tauri.localhost : Tauri 2 sur Windows en build packagé
    // - http://localhost:1420 : Vite dev server (npm run tauri dev) —
    //   en dev le webview charge depuis cette URL, pas depuis
    //   tauri://localhost, donc sans cette entrée le frame-ancestors
    //   bloque l'iframe et on voit "orderflow-v2.vercel.app a refusé
    //   de se connecter" dans la webview.
    // - http://localhost:3000 : si quelqu'un override VITE_API_BASE
    //   pour viser un Next.js local, l'iframe est servie par cette
    //   origine pour le contenu mais c'est l'orderflow-v2.vercel.app
    //   qui doit autoriser le framing — pas pertinent ici, mais on
    //   liste pour cohérence dev.
    // On exempte aussi /api/auth/desktop-bridge du DENY plus bas,
    // pour qu'un browser strict qui appliquerait X-Frame-Options sur
    // un 302 intermédiaire ne casse pas le redirect-flow.
    const tauriFrameAncestors =
      "frame-ancestors 'self' tauri://localhost https://tauri.localhost http://localhost:1420 http://localhost:3000";

    return [
      // Toutes les routes SAUF /live, /account et le bridge endpoint :
      // on garde X-Frame-Options DENY. La regex
      // `(?!live$|live/|account$|account/|api/auth/desktop-bridge$)`
      // exclut ces paths du match.
      //
      // Pourquoi exempter aussi le bridge : l'iframe charge
      // /api/auth/desktop-bridge?token=…&next=/live, qui répond en
      // 302 vers /live. La spec Chromium n'applique X-Frame-Options
      // qu'à la réponse finale, mais certains browsers/webviews
      // strictes le checkent sur chaque hop du redirect chain. On
      // ne perd rien à l'exempter — la réponse est un 302 sans
      // body, donc le risque de clickjacking est nul.
      {
        source: '/((?!live$|live/|account$|account/|api/auth/desktop-bridge$).*)',
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
      // Bridge endpoint : pas de X-Frame-Options, et frame-ancestors
      // permissive pour que les browsers strictes laissent passer
      // le redirect chain iframe → bridge → /live.
      {
        source: '/api/auth/desktop-bridge',
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
