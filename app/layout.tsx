import type { Metadata } from 'next';
import '@/app/globals.css';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';

export const metadata: Metadata = {
  title: 'OrderFlow v2 - Professional Trading Analytics',
  description: 'Real-time orderflow, liquidity heatmaps, and market microstructure analysis',
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
      </body>
    </html>
  );
}
