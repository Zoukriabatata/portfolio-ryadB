'use client';

import { useState, useEffect, useRef } from 'react';

const STEPS = [
  {
    step: '01',
    title: 'Open the account',
    desc: 'Email or Google sign-in. No card. Auto-PRO until 17 June 2026.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    step: '02',
    title: 'Install the .msi',
    desc: '8 MB installer, two clicks. SmartScreen walkthrough lives on /download if Windows balks.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
  {
    step: '03',
    title: 'Wire the bridge',
    desc: 'Drop the NinjaScript into NT, hit F5, attach the indicator to your chart. The tape goes live in seconds.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
];

export default function HowItWorksSection() {
  const lineRef = useRef<HTMLDivElement>(null);
  const [lineVisible, setLineVisible] = useState(false);

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLineVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="relative px-6 py-24" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-4xl mx-auto relative" style={{ zIndex: 10 }}>
        <div className="text-center mb-14">
          <div
            data-animate="up"
            className="italic mb-3"
            style={{
              fontFamily: 'var(--font-instrument-serif)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-lg)',
            }}
          >
            Three moves
          </div>
          <h2
            data-animate="up"
            data-animate-delay="1"
            className="dash-text-2xl md:dash-text-3xl tracking-tight"
            style={{ color: 'var(--text-primary)', fontWeight: 700 }}
          >
            Live in under 5 minutes.
          </h2>
          <p
            data-animate="up"
            data-animate-delay="2"
            className="mt-4 dash-text-sm md:dash-text-base max-w-lg mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Register. Install. Wire the bridge. Footprint starts printing.
          </p>
        </div>

        <div ref={lineRef} className="grid md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop) — draws itself */}
          <div className="hidden md:block absolute top-10 left-[16%] right-[16%] h-px overflow-hidden">
            <div
              className="h-full origin-left"
              style={{
                background: 'linear-gradient(90deg, rgb(var(--primary-rgb) / 0.3), rgb(var(--accent-rgb) / 0.25), rgb(var(--primary-rgb) / 0.3))',
                transform: lineVisible ? 'scaleX(1)' : 'scaleX(0)',
                transition: 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.3s',
                boxShadow: lineVisible ? '0 0 6px rgb(var(--primary-rgb) / 0.15)' : 'none',
              }}
            />
          </div>

          {STEPS.map((step, i) => (
            <div
              key={step.step}
              data-animate="up"
              data-animate-delay={String(i + 1)}
              className="relative text-center"
            >
              {/* Step circle */}
              <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full border border-white/[0.08] bg-white/[0.04] mb-5">
                <div style={{ color: 'rgb(var(--primary-rgb) / 0.7)' }}>
                  {step.icon}
                </div>
                {/* Step number badge */}
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgb(var(--primary-rgb) / 0.2)', border: '1px solid rgb(var(--primary-rgb) / 0.3)' }}>
                  <span
                    style={{
                      color: 'var(--primary-light)',
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: '10px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {step.step}
                  </span>
                </div>
              </div>

              <h3
                className="dash-text-base font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                {step.title}
              </h3>
              <p
                className="dash-text-sm leading-relaxed max-w-[220px] mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
