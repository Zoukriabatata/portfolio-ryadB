import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GEX Dashboard',
  description: 'Gamma Exposure (GEX) dashboard with real-time options data, strike-level gamma, and dealer positioning analysis.',
};

// Keep-alive: actual content rendered in layout via ChartKeepAlive
export default function GEXPage() {
  return null;
}
