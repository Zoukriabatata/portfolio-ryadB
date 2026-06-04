'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { useScrollAnimations } from '@/hooks/useScrollAnimations';

// Browser-only — decorative/interactive, no impact on LCP
const StellarCore = dynamic(() => import('@/components/landing/StellarCore'), { ssr: false });
const ScrollProgress = dynamic(() => import('@/components/landing/ScrollProgress'), { ssr: false });
const ScrollSpy = dynamic(() => import('@/components/landing/ScrollSpy'), { ssr: false });
const BackToTop = dynamic(() => import('@/components/landing/BackToTop'), { ssr: false });
const FloatingChat = dynamic(() => import('@/components/ai/FloatingChat'), { ssr: false });

/**
 * Landing shell — Editorial Terminal pass.
 *
 * Composition :
 *   • StellarCore behind the hero — a pure-CSS replacement for the
 *     legacy BlackHole canvas. Same brand signature (burning
 *     singularity + accretion disk + starfield) but runs entirely
 *     on the GPU compositor, so the homepage no longer pays a
 *     25-30 % CPU tax on mid-range laptops.
 *
 * Inside the app (dashboard, account, routes) the `DashboardAtmosphere`
 * runs instead — keeps the editorial typography readable. Two
 * surfaces, two atmospheres, one brand voice.
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
      <StellarCore />
      <ScrollProgress />
      <ScrollSpy />

      {children}

      <BackToTop />
      <FloatingChat />
    </div>
  );
}
