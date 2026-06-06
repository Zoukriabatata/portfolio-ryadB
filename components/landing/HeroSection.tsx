'use client';

import { useEffect, useState, useRef, useMemo, memo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import HeroBackground from './HeroBackground';

const AnimatedStat = memo(function AnimatedStat({ value, label, delay }: { value: string; label: string; delay: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          timer = setTimeout(() => setVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
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
        className="dash-text-xl md:dash-text-2xl transition-all duration-500 tabular-nums"
        style={{
          color: 'var(--primary-light)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
          // Match the hero wordmark : JetBrains Mono 500. The stats
          // are data, so the same family as the headline keeps the
          // brand visually consistent and gives the numbers the
          // trader-terminal precision a serif italic couldn't.
          fontFamily: 'var(--font-jetbrains-mono)',
          fontWeight: 500,
          letterSpacing: '-0.03em',
        }}
      >
        {target ? `${prefix}${count}${suffix}` : value}
      </div>
      <div
        className="mt-1 transition-all duration-500"
        style={{
          opacity: visible ? 1 : 0,
          transitionDelay: '100ms',
          fontFamily: 'var(--font-jetbrains-mono)',
          fontSize: '9px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
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
    <section id="hero" className="relative min-h-dvh flex items-center justify-center px-6 overflow-hidden">
      <HeroBackground />
      <div className="relative z-10 max-w-3xl mx-auto text-center pt-16">

        {/* Badge — JetBrains Mono uppercase kicker. Replaces the
            backdrop-blur pill that read as a notification. */}
        <div
          className="inline-flex items-center gap-2.5 mb-10 px-4 py-1.5 rounded-full"
          style={{
            color: 'var(--primary)',
            border: '1px solid var(--border-glow)',
            background: 'rgba(74, 222, 128, 0.04)',
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: 'var(--text-xs)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            animation: 'fadeInDown 0.7s ease-out forwards',
            opacity: 0,
          }}
        >
          <span className="relative inline-flex w-1.5 h-1.5 flex-shrink-0">
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: 'var(--primary)', opacity: 0.55 }}
            />
            <span
              className="relative inline-flex w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'var(--primary)' }}
            />
          </span>
          Public preview · Free PRO until 17 June 2026
        </div>

        {/* Title — Editorial Terminal voice. "Native" replaces
            "Professional" : the real differentiator vs other
            footprint tools is that we render natively from the
            NinjaTrader data feed rather than wrapping it. Trader-
            coded kicker, hard product wordmark below. */}
        {/* No parent transform animation — slideInUp would hold the
            h1 as a compositor layer for its full duration AND keep
            the layer alive after via the residual `transform:
            translateY(0)`. The per-character entrance below is the
            only animation; it's pure opacity, so the text never
            leaves the standard text-rendering pipeline. */}
        <div>
          {/* H1 — piste A « editorial contraste » : light 400 + bold 600 italic lime */}
          <h1 className="leading-none" style={{ fontFamily: 'var(--font-fraunces)', margin: 0, letterSpacing: '-0.042em' }}>
            <span
              className="block text-5xl md:text-7xl lg:text-[80px]"
              style={{ fontWeight: 400, color: 'var(--text-primary)', lineHeight: 0.95 }}
            >
              The science of
            </span>
            <span
              className="block text-5xl md:text-7xl lg:text-[80px]"
              style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)', lineHeight: 0.95, textShadow: '0 0 42px rgba(74,222,128,.42)' }}
            >
              orderflow.
            </span>
          </h1>
        </div>

        {/* Subtitle — kept tight: one promise (footprint), one
            differentiator (NT bridge + broker-side volume), one
            audience signal (Apex / Rithmic). Avoids the dead-feature
            mentions (heatmap, GEX) the FeaturesSection cleanup
            already removed. */}
        <p
          className="mt-6 dash-text-base md:dash-text-lg max-w-lg mx-auto leading-relaxed"
          style={{
            animation: 'fadeInUp 0.7s ease-out 0.3s forwards',
            opacity: 0,
            color: 'var(--text-secondary)',
          }}
        >
          Footprint charts rendered tick-by-tick from your NinjaTrader feed.
          One NinjaScript file installs the bridge — Apex and Rithmic
          accounts, no proxy lag.
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
                Get free preview
              </Link>
              <Link
                href="/download"
                className="landing-btn-ghost"
                style={{ fontFamily: 'var(--font-jetbrains-mono)', letterSpacing: '0.04em' }}
              >
                Download · Windows
              </Link>
            </>
          )}
        </div>

        {/* Stats */}
        <div
          className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-sm mx-auto"
          style={{ animation: 'fadeInUp 0.7s ease-out 0.6s forwards', opacity: 0 }}
        >
          {[
            { v: '<5ms', l: 'TICK LATENCY' },
            { v: '8', l: 'BROKER FEEDS' },
            { v: '6', l: 'TOOLS' },
            { v: '12+', l: 'MARKETS COVERED' },
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
              <div className="flex-1 text-center text-[10px] text-white/20 tracking-wide">ORDERFLOWV2 — MNQ M6 · 1m</div>
              <div className="flex items-center gap-1.5">
                <span className="relative inline-flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[9px] text-emerald-500/50">LIVE</span>
              </div>
            </div>
            {/* Fake UI content */}
            <div className="p-3 sm:p-4 flex gap-3 overflow-hidden" style={{ height: 'auto', maxHeight: 180 }}>
              {/* Heatmap mockup */}
              <div className="flex-1 rounded-lg border border-white/[0.05] p-3 relative overflow-hidden" style={{ background: 'linear-gradient(to bottom, rgb(var(--primary-rgb) / 0.05), transparent)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: 'rgb(var(--primary-rgb) / 0.5)' }}>Footprint Chart</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-emerald-400/60">20,374.25</span>
                    <span className="text-[8px] text-emerald-400/40">+0.42%</span>
                  </div>
                </div>
                {/* Fake footprint rows — each cell is a bid/ask split
                    so the mockup actually reads as orderflow (red/sell
                    on the left, green/buy on the right) instead of a
                    generic heatmap. The buy share is deterministic per
                    cell so SSR and client render the same widths. */}
                {HEATMAP_DATA.map((row, i) => (
                  <div key={i} className="flex gap-0.5 mb-0.5">
                    {row.map((intensity, j) => {
                      const delay = ((i * 12 + j) * 0.37 % 3).toFixed(2);
                      const duration = (2 + (intensity * 2)).toFixed(1);
                      // Pseudo-random aggressor split — value in 0.25..0.75,
                      // deterministic by (i,j) so the visual stays stable.
                      const buyShare = 0.25 + (((i * 5 + j * 3) % 11) / 22);
                      const sellShare = 1 - buyShare;
                      const alpha = intensity * 0.45;
                      return (
                        <div
                          key={j}
                          className="flex-1 flex gap-px h-2.5"
                          style={{
                            animation: `heatmapPulse ${duration}s ease-in-out ${delay}s infinite`,
                          }}
                        >
                          {/* Sell volume — left, red */}
                          <div
                            className="rounded-l-[2px]"
                            style={{
                              width: `${sellShare * 100}%`,
                              background: `rgba(239,68,68,${alpha})`,
                            }}
                          />
                          {/* Buy volume — right, primary green */}
                          <div
                            className="rounded-r-[2px]"
                            style={{
                              width: `${buyShare * 100}%`,
                              background: `rgb(var(--primary-rgb) / ${alpha})`,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Orderbook mockup */}
              <div className="w-24 flex-shrink-0 rounded-lg border border-white/[0.05] p-2.5 hidden sm:flex flex-col overflow-hidden">
                <div className="text-[9px] text-white/30 uppercase tracking-wider mb-2">Orderbook</div>
                {/* Asks (MNQ tick = 0.25) */}
                {[0.5, 0.8, 0.4].map((w, i) => (
                  <div key={`a${i}`} className="flex items-center gap-1 mb-0.5">
                    <div className="h-1.5 rounded-full bg-red-500/30" style={{ width: `${w * 100}%` }} />
                    <span className="text-[7px] text-red-400/40">{(20374.25 + i * 0.25).toFixed(2)}</span>
                  </div>
                ))}
                <div className="h-px bg-white/[0.08] my-1" />
                {/* Bids */}
                {[0.6, 0.9, 0.4].map((w, i) => (
                  <div key={`b${i}`} className="flex items-center gap-1 mb-0.5">
                    <div className="h-1.5 rounded-full bg-emerald-500/30" style={{ width: `${w * 100}%` }} />
                    <span className="text-[7px] text-emerald-400/40">{(20374.00 - i * 0.25).toFixed(2)}</span>
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
          <span
            className="text-[10px] uppercase tracking-[0.22em]"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              color: 'var(--text-muted)',
            }}
          >
            Scroll
          </span>
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
