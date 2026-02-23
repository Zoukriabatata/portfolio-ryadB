'use client';

import { useEffect, useState, useRef, useMemo, memo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const AnimatedStat = memo(function AnimatedStat({ value, label, delay }: { value: string; label: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  // Extract numeric part for counting animation — memoized to avoid regex on every render
  const { target, prefix, suffix } = useMemo(() => {
    const numMatch = value.match(/(\d+)/);
    return {
      target: numMatch ? parseInt(numMatch[1], 10) : 0,
      prefix: value.match(/^([<>]?)/)?.[1] || '',
      suffix: value.replace(/^[<>]?\d+/, ''),
    };
  }, [value]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible || !target) return;
    let frame: number;
    const duration = 1200;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [visible, target]);

  return (
    <div ref={ref} className="text-center">
      <div
        className="text-lg md:text-xl font-bold transition-all duration-500"
        style={{
          color: 'var(--primary-light)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
        }}
      >
        {target ? `${prefix}${count}${suffix}` : value}
      </div>
      <div
        className="text-[10px] text-white/25 mt-0.5 transition-all duration-500"
        style={{
          opacity: visible ? 1 : 0,
          transitionDelay: '100ms',
        }}
      >
        {label}
      </div>
    </div>
  );
});

// Deterministic heatmap data to avoid hydration mismatch
const HEATMAP_DATA = [
  [0.12, 0.45, 0.78, 0.33, 0.91, 0.22, 0.67, 0.54, 0.38, 0.85, 0.19, 0.72],
  [0.55, 0.28, 0.63, 0.82, 0.14, 0.47, 0.93, 0.36, 0.71, 0.25, 0.58, 0.41],
  [0.31, 0.76, 0.18, 0.52, 0.69, 0.88, 0.23, 0.61, 0.44, 0.79, 0.35, 0.57],
  [0.84, 0.42, 0.95, 0.27, 0.53, 0.16, 0.74, 0.48, 0.86, 0.32, 0.65, 0.21],
  [0.17, 0.63, 0.39, 0.81, 0.26, 0.72, 0.45, 0.89, 0.15, 0.56, 0.78, 0.43],
  [0.68, 0.24, 0.51, 0.37, 0.92, 0.58, 0.13, 0.75, 0.46, 0.83, 0.29, 0.64],
  [0.41, 0.87, 0.33, 0.66, 0.19, 0.54, 0.82, 0.28, 0.73, 0.38, 0.91, 0.16],
  [0.59, 0.15, 0.77, 0.43, 0.62, 0.31, 0.48, 0.85, 0.22, 0.69, 0.34, 0.76],
];

export default function HeroSection() {
  const { data: session } = useSession();

  return (
    <section id="hero" className="relative min-h-[100vh] flex items-center justify-center px-6 overflow-hidden">
      <div className="relative z-10 max-w-3xl mx-auto text-center pt-16">

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2.5 mb-10 px-4 py-1.5 rounded-full text-[11px] tracking-widest uppercase"
          style={{
            color: 'rgb(var(--primary-light-rgb) / 0.8)',
            border: '1px solid rgb(var(--primary-rgb) / 0.15)',
            background: 'rgb(var(--primary-rgb) / 0.04)',
            backdropFilter: 'blur(8px)',
            animation: 'fadeInDown 0.7s ease-out forwards',
            opacity: 0,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--primary-light)' }} />
          Launch Offer — $29/mo locked for life
        </div>

        {/* Title */}
        <div style={{ animation: 'fadeInUp 0.9s ease-out 0.1s forwards', opacity: 0 }}>
          <h1 className="font-black tracking-tight leading-[1.05]">
            <span className="block text-4xl md:text-6xl lg:text-7xl text-white/90">
              Professional
            </span>
            <span
              className="block text-5xl md:text-7xl lg:text-8xl mt-1"
              style={{
                background: 'linear-gradient(135deg, var(--primary-light), var(--primary), var(--primary-dark), var(--primary-light))',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'gradientShift 4s ease infinite',
                filter: 'drop-shadow(0 0 30px rgb(var(--primary-rgb) / 0.25))',
              }}
            >
              Order Flow
            </span>
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="mt-6 text-sm md:text-base text-white/40 max-w-md mx-auto leading-relaxed"
          style={{ animation: 'fadeInUp 0.7s ease-out 0.3s forwards', opacity: 0 }}
        >
          See what market makers see. Real-time heatmaps, footprint charts,
          delta profiles &amp; gamma exposure — built for traders who want the full picture.
        </p>

        {/* CTA Buttons */}
        <div
          className="mt-10 flex items-center justify-center gap-3 flex-wrap"
          style={{ animation: 'fadeInUp 0.7s ease-out 0.45s forwards', opacity: 0 }}
        >
          {session ? (
            <Link href="/live" className="landing-btn-primary">
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/register" className="landing-btn-primary">
                Start Free Trial
              </Link>
              <Link href="/auth/login" className="landing-btn-ghost">
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* Stats */}
        <div
          className="mt-16 grid grid-cols-4 gap-4 max-w-sm mx-auto"
          style={{ animation: 'fadeInUp 0.7s ease-out 0.6s forwards', opacity: 0 }}
        >
          {[
            { v: '<5ms', l: 'Latency' },
            { v: '8', l: 'Data Feeds' },
            { v: '6', l: 'Pro Tools' },
            { v: '24/7', l: 'Markets' },
          ].map((s, i) => (
            <AnimatedStat key={i} value={s.v} label={s.l} delay={800 + i * 200} />
          ))}
        </div>

        {/* Platform Preview Mockup */}
        <div
          className="mt-16 max-w-2xl mx-auto"
          style={{ animation: 'fadeInUp 0.8s ease-out 0.8s forwards', opacity: 0 }}
        >
          <div className="mockup-border relative rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgb(var(--primary-rgb) / 0.05)' }}>
            {/* Shimmer sweep */}
            <div className="absolute inset-0 z-20 pointer-events-none" style={{
              background: 'linear-gradient(90deg, transparent, rgb(var(--primary-light-rgb) / 0.04), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s infinite',
            }} />
            {/* Window bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
              </div>
              <div className="flex-1 text-center text-[10px] text-white/20 tracking-wide">SENZOUKRIA — BTC/USDT</div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                <span className="text-[9px] text-emerald-500/50">LIVE</span>
              </div>
            </div>
            {/* Fake UI content */}
            <div className="p-3 sm:p-4 flex gap-3" style={{ height: 'auto', maxHeight: 180 }}>
              {/* Heatmap mockup */}
              <div className="flex-1 rounded-lg border border-white/[0.05] p-3 relative overflow-hidden" style={{ background: 'linear-gradient(to bottom, rgb(var(--primary-rgb) / 0.05), transparent)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgb(var(--primary-rgb) / 0.5)' }}>Liquidity Heatmap</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-emerald-400/60">67,284.50</span>
                    <span className="text-[8px] text-emerald-400/40">+1.2%</span>
                  </div>
                </div>
                {/* Fake heatmap rows — animated cells */}
                {HEATMAP_DATA.map((row, i) => (
                  <div key={i} className="flex gap-0.5 mb-0.5">
                    {row.map((intensity, j) => {
                      // Deterministic animation delay based on position
                      const delay = ((i * 12 + j) * 0.37 % 3).toFixed(2);
                      const duration = (2 + (intensity * 2)).toFixed(1);
                      return (
                        <div
                          key={j}
                          className="flex-1 h-2.5 rounded-[2px]"
                          style={{
                            background: intensity > 0.7
                              ? `rgb(var(--primary-rgb) / ${intensity * 0.4})`
                              : intensity > 0.4
                              ? `rgb(var(--accent-rgb) / ${intensity * 0.3})`
                              : `rgba(255,255,255,${intensity * 0.05})`,
                            animation: `heatmapPulse ${duration}s ease-in-out ${delay}s infinite`,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Orderbook mockup */}
              <div className="w-28 rounded-lg border border-white/[0.05] p-3 hidden sm:block">
                <div className="text-[9px] text-white/30 uppercase tracking-wider mb-2">Orderbook</div>
                {/* Asks */}
                {[0.3, 0.5, 0.8, 0.4].map((w, i) => (
                  <div key={`a${i}`} className="flex items-center gap-1 mb-0.5">
                    <div className="h-1.5 rounded-full bg-red-500/30" style={{ width: `${w * 100}%` }} />
                    <span className="text-[8px] text-red-400/40">{(67250 + i * 25).toLocaleString()}</span>
                  </div>
                ))}
                <div className="h-px bg-white/[0.08] my-1.5" />
                {/* Bids */}
                {[0.6, 0.9, 0.4, 0.7].map((w, i) => (
                  <div key={`b${i}`} className="flex items-center gap-1 mb-0.5">
                    <div className="h-1.5 rounded-full bg-emerald-500/30" style={{ width: `${w * 100}%` }} />
                    <span className="text-[8px] text-emerald-400/40">{(67150 - i * 25).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Glow under mockup */}
          <div className="w-2/3 h-20 mx-auto -mt-10 blur-3xl rounded-full pointer-events-none" style={{ backgroundColor: 'rgb(var(--primary-rgb) / 0.1)' }} />
        </div>

        {/* Scroll Indicator */}
        <div
          className="mt-8 flex flex-col items-center gap-2"
          style={{ animation: 'fadeIn 1s ease-out 1.2s forwards', opacity: 0 }}
        >
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">Scroll to explore</span>
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            className="text-white/20"
            style={{ animation: 'scrollBounce 2s ease-in-out infinite' }}
          >
            <path d="M7 13l5 5 5-5M7 7l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </section>
  );
}
