'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import MagneticButton from '@/components/landing/MagneticButton';

// Deterministic particles around CTA button
const CTA_PARTICLES = [
  { size: '4px', opacity: 0.5, duration: 4, delay: 0, fx: '40px', fy: '-30px' },
  { size: '3px', opacity: 0.4, duration: 5, delay: 0.8, fx: '-35px', fy: '-25px' },
  { size: '5px', opacity: 0.35, duration: 4.5, delay: 1.5, fx: '30px', fy: '20px' },
  { size: '3px', opacity: 0.45, duration: 3.5, delay: 0.3, fx: '-45px', fy: '15px' },
  { size: '4px', opacity: 0.3, duration: 5.5, delay: 2, fx: '50px', fy: '-10px' },
  { size: '3px', opacity: 0.5, duration: 4.2, delay: 1.2, fx: '-25px', fy: '-35px' },
];

export default function CTASection() {
  const { data: session } = useSession();

  return (
    <section id="cta" className="relative px-6 py-32 overflow-hidden" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Purple accent orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none" style={{
        background: 'radial-gradient(circle, rgba(124,58,237,0.08), transparent 55%)',
        zIndex: 2,
      }} />

      {/* Orange accent orb */}
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] pointer-events-none" style={{
        background: 'radial-gradient(circle, rgba(245,158,11,0.05), transparent 55%)',
        zIndex: 2,
      }} />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-2xl mx-auto text-center relative" style={{ zIndex: 10 }}>
        {/* Heading */}
        <h2
          data-animate="scale"
          className="text-3xl md:text-5xl font-bold tracking-tight leading-tight"
        >
          <span className="text-white">Ready to See</span>
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #fbbf24, #f59e0b, #7c3aed)',
              WebkitBackgroundClip: 'text',
            }}
          >
            What Others Can&apos;t?
          </span>
        </h2>

        <p
          data-animate="up"
          data-animate-delay="1"
          className="mt-6 text-base text-white/50 leading-relaxed"
        >
          Join traders worldwide using institutional-grade analytics to make smarter decisions every day.
        </p>

        {/* Trust badges */}
        <div
          data-animate="up"
          data-animate-delay="2"
          className="mt-8 flex items-center justify-center gap-4 flex-wrap"
        >
          {[
            { label: 'Low Latency', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> },
            { label: 'Secure Platform', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg> },
            { label: 'Global Markets', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg> },
          ].map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-[11px] font-medium text-white/55 border border-white/[0.1] bg-white/[0.04]"
            >
              <span className="text-amber-500/70">{badge.icon}</span>
              {badge.label}
            </span>
          ))}
        </div>

        {/* CTA Buttons */}
        <div
          data-animate="up"
          data-animate-delay="3"
          className="mt-10 flex items-center justify-center gap-4 flex-wrap"
        >
          {session ? (
            <MagneticButton>
              <div className="relative">
                {/* Floating particles */}
                {CTA_PARTICLES.map((p, i) => (
                  <span
                    key={i}
                    className="cta-particle absolute rounded-full pointer-events-none"
                    style={{
                      width: p.size,
                      height: p.size,
                      background: `radial-gradient(circle, rgba(251,191,36,${p.opacity}), transparent)`,
                      top: '50%',
                      left: '50%',
                      animation: `particleFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
                      ['--float-x' as string]: p.fx,
                      ['--float-y' as string]: p.fy,
                      ['--particle-opacity' as string]: p.opacity,
                    }}
                  />
                ))}
                <Link
                  href="/live"
                  className="relative z-10 inline-flex items-center gap-2 px-8 py-4 text-base font-bold text-black bg-gradient-to-r from-amber-400 to-amber-500 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_50px_rgba(245,158,11,0.5)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  Open Dashboard
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </MagneticButton>
          ) : (
            <>
              <MagneticButton>
              <div className="relative">
                {/* Floating particles */}
                {CTA_PARTICLES.map((p, i) => (
                  <span
                    key={i}
                    className="cta-particle absolute rounded-full pointer-events-none"
                    style={{
                      width: p.size,
                      height: p.size,
                      background: `radial-gradient(circle, rgba(251,191,36,${p.opacity}), transparent)`,
                      top: '50%',
                      left: '50%',
                      animation: `particleFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
                      ['--float-x' as string]: p.fx,
                      ['--float-y' as string]: p.fy,
                      ['--particle-opacity' as string]: p.opacity,
                    }}
                  />
                ))}
                <Link
                  href="/auth/register"
                  className="relative z-10 inline-flex items-center gap-2 px-8 py-4 text-base font-bold text-black bg-gradient-to-r from-amber-400 to-amber-500 rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_50px_rgba(245,158,11,0.5)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  Start Free Trial
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              </MagneticButton>
              <button
                onClick={() => {
                  const target = document.getElementById('features');
                  const scrollRoot = document.querySelector('[data-scroll-root]');
                  if (target && scrollRoot) {
                    scrollRoot.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
                  }
                }}
                className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white/70 border border-white/[0.15] rounded-xl hover:border-white/[0.25] hover:text-white hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
              >
                Explore Features
              </button>
            </>
          )}
        </div>

        {/* Disclaimer */}
        <p
          data-animate="up"
          data-animate-delay="4"
          className="mt-6 text-[11px] text-white/25"
        >
          No credit card required &bull; Free trial &bull; Cancel anytime
        </p>
      </div>
    </section>
  );
}
