import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Backtesting',
  description: 'Backtest trading strategies against historical order flow data with detailed performance analytics.',
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
