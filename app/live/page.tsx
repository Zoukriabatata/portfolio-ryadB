import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Charts',
  description: 'Real-time candlestick charts with live order flow from Binance, Bybit, and professional futures feeds.',
};

// Keep-alive: actual content rendered in layout via ChartKeepAlive
export default function LivePage() {
  return null;
}
