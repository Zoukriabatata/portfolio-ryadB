import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication Error',
  description: 'An authentication error occurred on Senzoukria. Please try signing in again or contact support.',
};

export default function AuthErrorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
