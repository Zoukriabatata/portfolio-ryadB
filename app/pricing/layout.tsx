import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Choose your plan — free crypto charts or SENULTRA with footprint charts, liquidity heatmaps, GEX dashboard, and multi-broker support.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
