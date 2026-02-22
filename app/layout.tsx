import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import '@/app/globals.css';
import '@/styles/chart-animations.css';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from 'sonner';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Senzoukria — Professional Order Flow Analytics',
  description:
    'Institutional-grade orderflow analytics platform. Real-time heatmaps, footprint charts, delta profiles and gamma exposure. Connect Rithmic, Interactive Brokers, CQG or AMP.',
  openGraph: {
    title: 'Senzoukria — Professional Order Flow Analytics',
    description:
      'Institutional-grade orderflow analytics platform. Real-time heatmaps, footprint charts, delta profiles and gamma exposure. Connect Rithmic, Interactive Brokers, CQG or AMP.',
    type: 'website',
    siteName: 'Senzoukria',
  },
  twitter: {
    card: 'summary_large_image',
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
      <body className={spaceGrotesk.className} suppressHydrationWarning>
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
