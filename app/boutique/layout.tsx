import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Feeds',
  description: 'Connect to real-time market data feeds — Binance, Bybit, Deribit, Rithmic, Interactive Brokers, CQG, dxFeed, and AMP.',
};

export default function BoutiqueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
