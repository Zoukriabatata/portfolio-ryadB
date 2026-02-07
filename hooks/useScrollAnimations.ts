'use client';

import { useEffect } from 'react';

/**
 * Activates scroll-triggered animations for elements with [data-animate].
 *
 * Usage in any component/page:
 *   useScrollAnimations();
 *
 * Then in JSX:
 *   <div data-animate="up">Slides up on scroll</div>
 *   <div data-animate="scale" data-animate-delay="2">Scales in with 0.2s delay</div>
 *
 * Variants: "fade" | "up" | "down" | "left" | "right" | "scale" | "scale-up" | "blur"
 */
export function useScrollAnimations(rootSelector?: string) {
  useEffect(() => {
    const root = rootSelector ? document.querySelector(rootSelector) : null;
    const elements = document.querySelectorAll('[data-animate]');
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target); // Only animate once
          }
        });
      },
      {
        root: root,
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [rootSelector]);
}
