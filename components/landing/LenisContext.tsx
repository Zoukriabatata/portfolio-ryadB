'use client';

import { createContext, useContext } from 'react';
import type Lenis from 'lenis';

/**
 * Holds the landing-page Lenis instance (momentum scroll). Provided by
 * LandingClientShell, consumed by the programmatic-scroll call sites
 * (ScrollSpy, LandingNav, BackToTop, HeroSection) so they route through
 * `lenis.scrollTo` instead of the native smooth scroll that would fight
 * Lenis. Value is `null` until Lenis mounts, or when reduced-motion is on
 * (callers then fall back to native scrollTo).
 */
export const LenisContext = createContext<Lenis | null>(null);

export function useLenis(): Lenis | null {
  return useContext(LenisContext);
}
