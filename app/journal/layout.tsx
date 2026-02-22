import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Track and analyze your trades with screenshots, notes, and performance metrics.',
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
