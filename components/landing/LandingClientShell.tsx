'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { DashboardAtmosphere } from '@/components/dashboard/DashboardAtmosphere';
import { useScrollAnimations } from '@/hooks/useScrollAnimations';

// Browser-only — decorative/interactive, no impact on LCP
const ScrollProgress = dynamic(() => import('@/components/landing/ScrollProgress'), { ssr: false });
const ScrollSpy = dynamic(() => import('@/components/landing/ScrollSpy'), { ssr: false });
const BackToTop = dynamic(() => import('@/components/landing/BackToTop'), { ssr: false });
const FloatingChat = dynamic(() => import('@/components/ai/FloatingChat'), { ssr: false });

/**
 * Landing shell — Editorial Terminal pass.
 *
 * The previous shell stacked four decorative layers (BlackHole
 * canvas with orbital rings + particles, CursorGlow follower, an
 * SVG noise overlay, and the page itself). The composite read as
 * cosmic / cyberpunk-AI : busy, generic, distracting from the
 * editorial message.
 *
 * Replaced by the same `DashboardAtmosphere` used inside the app —
 * neutral greyscale depth, white blueprint grid, white overhead
 * halo, single lime traversing ribbon. The brand identity becomes
 * coherent across landing → product instead of "cyberpunk landing
 * then editorial dashboard."
 */
export default function LandingClientShell({ children }: { children: React.ReactNode }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useScrollAnimations(mounted ? '[data-scroll-root]' : undefined);

  return (
    <div
      ref={scrollContainerRef}
      data-scroll-root
      className="h-full w-full overflow-auto bg-black relative"
      style={{ scrollBehavior: 'smooth' }}
    >
      <DashboardAtmosphere />
      <ScrollProgress />
      <ScrollSpy />

      {children}

      <BackToTop />
      <FloatingChat />
    </div>
  );
}
