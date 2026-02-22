import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your trading command center — quick access to all Senzoukria tools, platform status, and shortcuts.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
