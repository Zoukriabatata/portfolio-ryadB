import type { Metadata } from 'next';

export const metadata: Metadata = {
  title:       'Trading Dashboard',
  description: 'Live demo trading account — positions, orders, P&L, equity curve.',
};

export default function TradingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
