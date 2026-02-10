'use client';

import { useState, useEffect, useRef } from 'react';

const STEPS = [
  {
    step: '01',
    title: 'Create Your Account',
    desc: 'Sign up in seconds. No credit card required to start exploring the platform.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    step: '02',
    title: 'Connect Your Broker',
    desc: 'Link your Rithmic, Interactive Brokers, CQG or AMP account with one click.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    step: '03',
    title: 'Start Trading',
    desc: 'Access heatmaps, footprint charts, and real-time orderflow data instantly.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
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
          <h2
            data-animate="up"
            className="text-3xl md:text-4xl font-bold text-white tracking-tight"
          >
            Get Started in Minutes
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm md:text-base text-white/50 max-w-lg mx-auto"
          >
            Three simple steps to institutional-grade orderflow
          </p>
        </div>

        <div ref={lineRef} className="grid md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop) — draws itself */}
          <div className="hidden md:block absolute top-10 left-[16%] right-[16%] h-px overflow-hidden">
            <div
              className="h-full origin-left"
              style={{
                background: 'linear-gradient(90deg, rgba(245,158,11,0.3), rgba(124,58,237,0.25), rgba(245,158,11,0.3))',
                transform: lineVisible ? 'scaleX(1)' : 'scaleX(0)',
                transition: 'transform 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.3s',
                boxShadow: lineVisible ? '0 0 6px rgba(245,158,11,0.15)' : 'none',
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
                <div className="text-amber-500/70">
                  {step.icon}
                </div>
                {/* Step number badge */}
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-amber-400">{step.step}</span>
                </div>
              </div>

              <h3 className="text-[15px] font-semibold text-white mb-2">
                {step.title}
              </h3>
              <p className="text-[12px] text-white/40 leading-relaxed max-w-[220px] mx-auto">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
