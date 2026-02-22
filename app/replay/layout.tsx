import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Session Replay',
  description: 'Replay historical trading sessions with full order flow reconstruction and time-travel controls.',
};

export default function ReplayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
