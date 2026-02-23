'use client';

import { useEffect, useState, useRef } from 'react';
import { useScrollAnimations } from '@/hooks/useScrollAnimations';
import { useUIThemeStore, applyUITheme } from '@/stores/useUIThemeStore';
import BlackHole from '@/components/canvas/BlackHole';
import LandingNav from '@/components/landing/LandingNav';
import HeroSection from '@/components/landing/HeroSection';
import BrokersSection from '@/components/landing/BrokersSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import CapabilitiesSection from '@/components/landing/CapabilitiesSection';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import SocialSection from '@/components/landing/SocialSection';
import FAQSection from '@/components/landing/FAQSection';
import CTASection from '@/components/landing/CTASection';
import LandingFooter from '@/components/landing/LandingFooter';
import BackToTop from '@/components/landing/BackToTop';
import ScrollProgress from '@/components/landing/ScrollProgress';
import CursorGlow from '@/components/landing/CursorGlow';
import ScrollSpy from '@/components/landing/ScrollSpy';

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTheme = useUIThemeStore((s) => s.activeTheme);

  useEffect(() => {
    applyUITheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    setMounted(true);
    // Slight delay before entrance animation starts, so content is painted
    const timer = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Only activate scroll animations after content is mounted in the DOM
  // When mounted changes false→true, rootSelector changes and the hook re-runs
  useScrollAnimations(mounted ? '[data-scroll-root]' : undefined);

  if (!mounted) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-black gap-4">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-pulse">
          <defs>
            <linearGradient id="loadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--primary-light, #fbbf24)" />
              <stop offset="100%" stopColor="var(--primary-dark, #d97706)" />
            </linearGradient>
          </defs>
          <path d="M24 4L42 14V34L24 44L6 34V14L24 4Z" fill="url(#loadGrad)" fillOpacity="0.15" stroke="url(#loadGrad)" strokeWidth="1.5" />
          <path d="M28 16C28 16 26 14 22 14C18 14 16 16 16 19C16 22 18 23 22 24C26 25 28 26 28 29C28 32 26 34 22 34C18 34 16 32 16 32" fill="none" stroke="var(--primary, #f59e0b)" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-[11px] text-white/20 tracking-widest uppercase">Loading</span>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      data-scroll-root
      className="h-full w-full overflow-auto bg-black relative"
      style={{ scrollBehavior: 'smooth' }}
    >
      {/* Full-page canvas background */}
      <BlackHole scrollContainerRef={scrollContainerRef} />

      {/* Cursor glow effect (desktop only) */}
      <CursorGlow />

      {/* Scroll progress indicator */}
      <ScrollProgress />

      {/* Scrollspy navigation dots (desktop) */}
      <ScrollSpy />

      {/* Fixed navigation */}
      <LandingNav />

      {/* Sections */}
      <HeroSection />
      <FeaturesSection />
      <BrokersSection />
      <CapabilitiesSection />
      <HowItWorksSection />
      <SocialSection />
      <FAQSection />
      <CTASection />
      <LandingFooter />
      <BackToTop />

      {/* Film grain noise overlay */}
      <div className="noise-overlay" />

      {/* Page entrance overlay — fades out after mount */}
      <div
        className="fixed inset-0 bg-black pointer-events-none transition-opacity duration-700 ease-out"
        style={{
          zIndex: 200,
          opacity: entered ? 0 : 1,
        }}
      />
    </div>
  );
}
