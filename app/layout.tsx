import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/app/globals.css';
import '@/styles/chart-animations.css';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from 'sonner';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
  variable: '--font-inter',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://senzoukria.com';
const SITE_NAME = 'Senzoukria';
const DEFAULT_DESCRIPTION =
  'Institutional-grade orderflow analytics platform. Real-time heatmaps, footprint charts, delta profiles and gamma exposure. Connect Rithmic, Interactive Brokers, CQG or AMP.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Professional Order Flow Analytics`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'order flow', 'footprint chart', 'liquidity heatmap', 'gamma exposure', 'GEX',
    'volatility surface', 'trading platform', 'Rithmic', 'Interactive Brokers',
    'CQG', 'AMP', 'Binance', 'futures trading', 'crypto trading', 'delta profile',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    title: `${SITE_NAME} — Professional Order Flow Analytics`,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    images: [
      {
        url: '/screenshots/example-1.png',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Order Flow Analytics Dashboard`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Professional Order Flow Analytics`,
    description: DEFAULT_DESCRIPTION,
    images: ['/screenshots/example-1.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to Google Fonts CDN — reduces font LCP latency */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <DashboardClientLayout>{children}</DashboardClientLayout>
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
