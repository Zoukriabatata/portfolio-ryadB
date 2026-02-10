'use client';

import { useState, useEffect } from 'react';

export default function ScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const scrollEl = document.querySelector('[data-scroll-root]');
    if (!scrollEl) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const max = scrollHeight - clientHeight;
      setProgress(max > 0 ? scrollTop / max : 0);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[2px] pointer-events-none"
      style={{ zIndex: 150 }}
    >
      <div
        className="h-full origin-left"
        style={{
          transform: `scaleX(${progress})`,
          background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #d97706)',
          boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)',
          transition: 'transform 0.1s linear',
        }}
      />
    </div>
  );
}
