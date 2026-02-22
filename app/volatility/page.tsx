import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Volatility Surface',
  description: 'Implied volatility surface, skew analysis, and term structure visualization from Deribit options data.',
};

// Keep-alive: actual content rendered in layout via ChartKeepAlive
export default function VolatilityPage() {
  return null;
}
