'use client';

import { useState, useEffect } from 'react';

const SECTIONS = [
  { id: 'hero', label: 'Hero' },
  { id: 'features', label: 'Features' },
  { id: 'brokers', label: 'Brokers' },
  { id: 'capabilities', label: 'Why Us' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'community', label: 'Community' },
  { id: 'faq', label: 'FAQ' },
  { id: 'cta', label: 'Get Started' },
];

export default function ScrollSpy() {
  const [activeId, setActiveId] = useState('hero');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scrollEl = document.querySelector('[data-scroll-root]');
    if (!scrollEl) return;

    const handleScroll = () => {
      const st = scrollEl.scrollTop;
      // Show after scrolling past hero
      setVisible(st > 400);

      // Determine active section
      let current = 'hero';
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.offsetTop - 200 <= st) {
          current = section.id;
        }
      }
      setActiveId(current);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const target = document.getElementById(id);
    const scrollRoot = document.querySelector('[data-scroll-root]');
    if (target && scrollRoot) {
      scrollRoot.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
    }
  };

  return (
    <div
      className="fixed right-4 top-1/2 -translate-y-1/2 flex-col gap-2.5 items-center hidden lg:flex transition-all duration-500"
      style={{
        zIndex: 90,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transform: `translateY(-50%) translateX(${visible ? '0' : '10px'})`,
      }}
    >
      {SECTIONS.map((section) => {
        const isActive = activeId === section.id;
        return (
          <button
            key={section.id}
            onClick={() => scrollTo(section.id)}
            className="group relative flex items-center justify-center cursor-pointer"
            aria-label={`Go to ${section.label}`}
          >
            {/* Tooltip */}
            <span
              className="absolute right-6 px-2 py-1 rounded text-[10px] font-medium text-white/70 bg-black/80 border border-white/[0.1] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            >
              {section.label}
            </span>
            {/* Dot */}
            <span
              className="block rounded-full transition-all duration-300"
              style={{
                width: isActive ? 8 : 5,
                height: isActive ? 8 : 5,
                background: isActive
                  ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                  : 'rgba(255,255,255,0.2)',
                boxShadow: isActive ? '0 0 8px rgba(245,158,11,0.4)' : 'none',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
