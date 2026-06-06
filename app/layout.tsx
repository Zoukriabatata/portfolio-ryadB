import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { JetBrains_Mono } from 'next/font/google';
import '@/app/globals.css';

/**
 * Editorial Terminal typography stack.
 *
 *   • JetBrains Mono → every headline, kicker, label, data cell, big
 *     price across landing / login / download / dashboard. Single
 *     terminal voice end-to-end.
 *   • Geist Sans     → body copy + paragraphs (loaded above).
 *   • Geist Mono     → embedded code blocks (loaded above), kept
 *     separate so we don't conflate "display mono" with "code mono".
 *
 * Instrument Serif was dropped after the typography sweep — every
 * surface that used it (hero, login, dashboard hero card, broker
 * placeholder, AI welcome, big watchlist price) now uses JetBrains
 * Mono. Saves the WOFF2 fetch + a font-display: swap flash on first
 * paint.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
import '@/styles/chart-animations.css';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';
import SessionProviderWrapper from '@/components/layouts/SessionProviderWrapper';

import { Toaster } from 'sonner';
import { JsonLd } from '@/components/seo/JsonLd';

// Same resolution as app/sitemap.ts — see there for the rationale.
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://orderflow-v2.vercel.app';
const SITE_NAME = 'Senzoukria';
const DEFAULT_DESCRIPTION =
  'Professional orderflow desktop platform — footprint charts with broker-side daily volume, delta, imbalance and absorption detection. Connect via NinjaTrader Bridge (Apex / Rithmic), Rithmic direct, or crypto (Binance / Bybit / Deribit).';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Professional Order Flow Analytics Platform`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'order flow', 'order flow trading', 'order flow software', 'order flow platform',
    'footprint chart', 'footprint chart software', 'volume footprint',
    'volume profile', 'market profile', 'TPO chart',
    'cumulative volume delta', 'CVD indicator', 'delta profile',
    'DOM trading', 'depth of market', 'level 2 data',
    'trading platform', 'futures trading platform', 'crypto trading tools',
    'NinjaTrader bridge', 'NinjaTrader orderflow', 'NinjaScript indicator',
    'Apex Trader Funding orderflow', 'Apex footprint chart',
    'Rithmic', 'Rithmic R Protocol', 'Rithmic API orderflow',
    'Binance futures', 'Bybit', 'Deribit', 'crypto derivatives',
    'ATAS alternative', 'Sierra Chart alternative', 'Bookmap alternative', 'Jigsaw alternative',
    'market microstructure', 'tape reading', 'order book analysis',
    'NQ futures', 'ES futures', 'MNQ', 'MES', 'MGC', 'GC',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  verification: {
    google: 'MGGYgE7tU9jpIL3O_QQ2lxyFV580zSQtlhf2vd9Sprg',
    other: {
      'msvalidate.01': 'E7E843F922F30763066D84D0EDD9DF12',
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: `${SITE_NAME} — Professional Order Flow Analytics Platform`,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Professional Order Flow Analytics Platform`,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* DNS prefetch for key external services */}
        <link rel="dns-prefetch" href="https://fstream.binance.com" />
        <link rel="dns-prefetch" href="https://stream.bybit.com" />
        {/*
          Blocking theme init script — reads saved theme from localStorage and
          applies CSS variables BEFORE first paint to eliminate theme-swap CLS.
          Must be render-blocking (no defer/async) to run before any paint.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('senzoukria-ui-theme')||'{}');var t=s.state&&s.state.activeTheme;if(t&&t!=='default'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
if(typeof Node!=='undefined'){
  var oRC=Node.prototype.removeChild;
  Node.prototype.removeChild=function(c){
    if(c.parentNode!==this)return c;
    return oRC.call(this,c);
  };
  var oIB=Node.prototype.insertBefore;
  Node.prototype.insertBefore=function(n,r){
    if(r&&r.parentNode!==this)return n;
    return oIB.call(this,n,r);
  };
}`,
          }}
        />
        <JsonLd />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${jetbrainsMono.variable} font-sans`}
        suppressHydrationWarning
      >
        <SessionProviderWrapper>
          <DashboardClientLayout>{children}</DashboardClientLayout>
        </SessionProviderWrapper>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '13px',
            },
          }}
          gap={8}
        />

      </body>
    </html>
  );
}
