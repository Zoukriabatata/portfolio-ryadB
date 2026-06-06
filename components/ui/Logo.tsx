'use client';
import Lockup from '@/components/ui/brand/Lockup';
import LogoMark from '@/components/ui/brand/LogoMark';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  animated?: boolean;
}

const MARK = { sm: 28, md: 36, lg: 48 } as const;

/**
 * Rétro-compat : `Logo` = lockup (mark + wordmark SENZOUKRIA).
 * `showText={false}` → mark seul.
 */
export default function Logo({ size = 'md', showText = true, animated = true }: LogoProps) {
  if (!showText) return <LogoMark size={MARK[size]} animated={animated} />;
  return <Lockup markSize={MARK[size]} animated={animated} showDescriptor={size !== 'sm'} />;
}

export { default as LogoIcon } from '@/components/ui/brand/LogoMark';
