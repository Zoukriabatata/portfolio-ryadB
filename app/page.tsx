'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useScrollAnimations } from '@/hooks/useScrollAnimations';
import { useUIThemeStore, applyUITheme } from '@/stores/useUIThemeStore';
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

// Browser-only components — excluded from SSR to avoid hydration errors
// and to not block initial paint (they are purely decorative/interactive)
const BlackHole = dynamic(() => import('@/components/canvas/BlackHole'), { ssr: false });
const CursorGlow = dynamic(() => import('@/components/landing/CursorGlow'), { ssr: false });
const ScrollProgress = dynamic(() => import('@/components/landing/ScrollProgress'), { ssr: false });
const ScrollSpy = dynamic(() => import('@/components/landing/ScrollSpy'), { ssr: false });
const BackToTop = dynamic(() => import('@/components/landing/BackToTop'), { ssr: false });
const FloatingChat = dynamic(() => import('@/components/ai/FloatingChat'), { ssr: false });

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTheme = useUIThemeStore((s) => s.activeTheme);

  useEffect(() => {
    applyUITheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useScrollAnimations(mounted ? '[data-scroll-root]' : undefined);

  return (
    <div
      ref={scrollContainerRef}
      data-scroll-root
      className="h-full w-full overflow-auto bg-black relative"
      style={{ scrollBehavior: 'smooth' }}
    >
      {/* Canvas background — loads after JS, does not block LCP */}
      <BlackHole scrollContainerRef={scrollContainerRef} />

      {/* Decorative / interactive — browser only, no impact on LCP */}
      <CursorGlow />
      <ScrollProgress />
      <ScrollSpy />

      {/* Fixed navigation */}
      <LandingNav />

      {/* Content sections — server-rendered, immediately visible */}
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

      {/* AI support chat bubble */}
      <FloatingChat />
    </div>
  );
}
