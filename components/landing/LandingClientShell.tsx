'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

import { useScrollAnimations } from '@/hooks/useScrollAnimations';
import { LenisContext } from '@/components/landing/LenisContext';

// Browser-only — decorative/interactive, no impact on LCP
const ScrollProgress = dynamic(() => import('@/components/landing/ScrollProgress'), { ssr: false });
const ScrollSpy = dynamic(() => import('@/components/landing/ScrollSpy'), { ssr: false });
const BackToTop = dynamic(() => import('@/components/landing/BackToTop'), { ssr: false });
const FloatingChat = dynamic(() => import('@/components/ai/FloatingChat'), { ssr: false });

/**
 * Landing shell — Editorial Terminal pass.
 *
 * Momentum scroll : the landing scrolls inside `[data-scroll-root]` (the
 * body is overflow:hidden). Lenis drives the wrapper's real `scrollTop`
 * with inertia (the "keeps gliding" feel, à la deepcharts), so the
 * existing scroll listeners (ScrollProgress/ScrollSpy/BackToTop/LandingNav)
 * and the IntersectionObserver animations keep working untouched. Native
 * `scroll-behavior:smooth` and scroll-snap are removed — both fight Lenis.
 * Disabled under prefers-reduced-motion (native scroll instead).
 */
export default function LandingClientShell({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [lenis, setLenis] = useState<Lenis | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useScrollAnimations(mounted ? '[data-scroll-root]' : undefined);

  useEffect(() => {
    if (!mounted) return;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const instance = new Lenis({
      wrapper,
      content,
      lerp: 0.09,           // continuous glide; tune 0.08–0.12 for "weight"
      smoothWheel: true,
      wheelMultiplier: 1,
      syncTouch: false,     // mobile keeps its native momentum
    });
    setLenis(instance);

    let raf = 0;
    const loop = (time: number) => {
      instance.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      instance.destroy();
      setLenis(null);
    };
  }, [mounted]);

  return (
    <LenisContext.Provider value={lenis}>
      <div
        ref={wrapperRef}
        data-scroll-root
        className="h-full w-full overflow-y-auto overflow-x-hidden relative"
        style={{ backgroundColor: 'var(--background)', scrollPaddingTop: 80 }}
      >
        <ScrollProgress />
        <ScrollSpy />

        <div ref={contentRef}>
          {children}
        </div>

        <BackToTop />
        <FloatingChat />
      </div>
    </LenisContext.Provider>
  );
}
