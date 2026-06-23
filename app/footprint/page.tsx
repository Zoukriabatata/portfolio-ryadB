import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Footprint Chart Software for Futures',
  description: 'Professional footprint charts with delta, volume, and imbalance analysis for order flow trading.',
};

// Keep-alive: actual content rendered in layout via ChartKeepAlive
export default function FootprintPage() {
  return null;
}
