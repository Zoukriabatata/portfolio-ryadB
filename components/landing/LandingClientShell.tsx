'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useScrollAnimations } from '@/hooks/useScrollAnimations';

// Browser-only — decorative/interactive, no impact on LCP
const BlackHole = dynamic(() => import('@/components/canvas/BlackHole'), { ssr: false });
const CursorGlow = dynamic(() => import('@/components/landing/CursorGlow'), { ssr: false });
const ScrollProgress = dynamic(() => import('@/components/landing/ScrollProgress'), { ssr: false });
const ScrollSpy = dynamic(() => import('@/components/landing/ScrollSpy'), { ssr: false });
const BackToTop = dynamic(() => import('@/components/landing/BackToTop'), { ssr: false });
const FloatingChat = dynamic(() => import('@/components/ai/FloatingChat'), { ssr: false });

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
      <CursorGlow />
      <ScrollProgress />
      <ScrollSpy />

      {children}

      <BackToTop />
      <div className="noise-overlay" />
      <FloatingChat />
    </div>
  );
}
