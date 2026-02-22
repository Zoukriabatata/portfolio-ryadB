import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'News Calendar',
  description: 'Real-time economic news calendar and market-moving events for crypto and futures traders.',
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
