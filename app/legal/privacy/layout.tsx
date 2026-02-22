import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Senzoukria privacy policy — how we handle and protect your data.',
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
