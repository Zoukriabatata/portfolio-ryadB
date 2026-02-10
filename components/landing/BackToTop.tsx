'use client';

import { useState, useEffect } from 'react';

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scrollEl = document.querySelector('[data-scroll-root]');
    if (!scrollEl) return;

    const handleScroll = () => {
      setVisible(scrollEl.scrollTop > 600);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const scrollEl = document.querySelector('[data-scroll-root]');
    scrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="Back to top"
      className={`
        fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full
        bg-white/[0.06] border border-white/[0.1] backdrop-blur-xl
        flex items-center justify-center
        hover:bg-amber-500/15 hover:border-amber-500/30
        transition-all duration-300
        ${visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
        }
      `}
    >
      <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="text-white/50"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
