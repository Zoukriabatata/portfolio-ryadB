import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact — Senzoukria',
  description:
    'Contact the Senzoukria team — questions, bug reports, feature requests. We answer within 24h on weekdays.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Senzoukria',
    description: 'Questions, bug reports, feature requests — we answer within 24h on weekdays.',
    url: '/contact',
    type: 'website',
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
