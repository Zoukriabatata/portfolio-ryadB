'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

import { useScrollAnimations } from '@/hooks/useScrollAnimations';

// Browser-only — decorative/interactive, no impact on LCP
const BlackHole = dynamic(() => import('@/components/canvas/BlackHole'), { ssr: false });
const ScrollProgress = dynamic(() => import('@/components/landing/ScrollProgress'), { ssr: false });
const ScrollSpy = dynamic(() => import('@/components/landing/ScrollSpy'), { ssr: false });
const BackToTop = dynamic(() => import('@/components/landing/BackToTop'), { ssr: false });
const FloatingChat = dynamic(() => import('@/components/ai/FloatingChat'), { ssr: false });

/**
 * Landing shell — Editorial Terminal pass.
 *
 * Composition :
 *   • BlackHole canvas behind the hero — the brand's signature
 *     visual. Kept on the landing because the homepage carries
 *     the marketing job; restored after the user reverted the
 *     "drop all decorative layers" iteration.
 *   • Drop CursorGlow + the SVG noise overlay — both competed with
 *     editorial typography without earning their place; the
 *     BlackHole alone carries enough atmosphere.
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
      <BlackHole scrollContainerRef={scrollContainerRef} />
      <ScrollProgress />
      <ScrollSpy />

      {children}

      <BackToTop />
      <FloatingChat />
    </div>
  );
}
