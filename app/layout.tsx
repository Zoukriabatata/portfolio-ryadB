import type { Metadata, Viewport } from 'next';
import '@/app/globals.css';
import '@/styles/chart-animations.css';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

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
    <html lang="en">
      <body>
        <DashboardClientLayout>{children}</DashboardClientLayout>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
