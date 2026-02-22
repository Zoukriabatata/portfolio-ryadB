import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Liquidity Heatmap',
  description: 'WebGL-accelerated liquidity heatmap showing real-time orderbook depth and passive order clusters.',
};

// Keep-alive: actual content rendered in layout via ChartKeepAlive
export default function LiquidityPage() {
  return null;
}
