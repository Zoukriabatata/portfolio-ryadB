import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your free Senzoukria account and start analyzing order flow with professional-grade tools.',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
