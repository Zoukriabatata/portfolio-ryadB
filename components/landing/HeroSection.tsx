'use client';

import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

import HeroBackground from './HeroBackground';
import HeroFootprint from './HeroFootprint';
import PreviewBanner from './PreviewBanner';
import { playOrderFilled, prefetchOrderFilled } from '@/lib/sound/orderFill';

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

// Footprint simulation (live jitter) vit dans HeroFootprint.tsx

export default function HeroSection() {
  const { data: session } = useSession();
  const [filled, setFilled] = useState(false);

  // Clic = "remplir un ordre démo" : voix + flash, puis on dévoile sur
  // place les CTA de conversion (Get free preview / Download). Le fill
  // démo EST le hook de conversion — pas un simple repère de scroll.
  const handleFill = useCallback(() => {
    playOrderFilled();
    setFilled(true);
  }, []);

  // Lien discret "Explore" sous les CTA — scroll fluide vers Features
  // (même pattern que ScrollSpy) pour qui veut explorer avant de convertir.
  const scrollToFeatures = useCallback(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
    const root = document.querySelector('[data-scroll-root]');
    const target = document.getElementById('features');
    if (root && target instanceof HTMLElement) {
      root.scrollTo({ top: target.offsetTop - 80, behavior });
    } else {
      target?.scrollIntoView({ behavior });
    }
  }, []);

  return (
    <section id="hero" className="relative min-h-dvh flex items-center justify-center px-6 overflow-hidden">
      <HeroBackground />
      <div className="relative z-10 max-w-3xl mx-auto text-center pt-28 md:pt-32">

        {/* Announce dismissible + compte à rebours live */}
        <PreviewBanner />

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
              style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)', lineHeight: 0.95, textShadow: '0 0 30px rgba(74,222,128,.26)' }}
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

        {/* Platform Preview Mockup — scène produit avec cartes flottantes */}
        <div
          className="relative mt-16 max-w-2xl mx-auto"
          style={{ animation: 'fadeInUp 0.8s ease-out 0.8s forwards', opacity: 0 }}
        >
          {/* Carte flottante : Absorption */}
          <div
            className="brand-anim hidden md:block"
            style={{ position: 'absolute', zIndex: 20, top: -20, left: -56, background: 'rgb(var(--primary-rgb) / 0.07)', border: '1px solid rgb(var(--primary-rgb) / 0.25)', borderRadius: 11, padding: '11px 13px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: '0 18px 40px rgba(0,0,0,.4), 0 0 28px rgb(var(--primary-rgb) / 0.12)', animation: 'brand-float 6s ease-in-out infinite' }}
          >
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 6px var(--primary)' }} />Absorption
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 11, color: 'var(--text-primary)' }}>20,374.25</div>
          </div>

          {/* Carte flottante : CVD */}
          <div
            className="brand-anim hidden md:block"
            style={{ position: 'absolute', zIndex: 20, top: '38%', right: -64, background: 'rgb(var(--primary-rgb) / 0.07)', border: '1px solid rgb(var(--primary-rgb) / 0.25)', borderRadius: 11, padding: '11px 13px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: '0 18px 40px rgba(0,0,0,.4), 0 0 28px rgb(var(--primary-rgb) / 0.12)', animation: 'brand-float 7s ease-in-out .8s infinite' }}
          >
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5 }}>CVD · session</div>
            <svg width="84" height="34" viewBox="0 0 84 34">
              <defs><linearGradient id="cvdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4ade80" stopOpacity=".35" /><stop offset="1" stopColor="#4ade80" stopOpacity="0" /></linearGradient></defs>
              <path d="M2,28 L14,24 L26,26 L38,17 L50,19 L62,10 L74,12 L82,4" fill="none" stroke="#4ade80" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2,28 L14,24 L26,26 L38,17 L50,19 L62,10 L74,12 L82,4 L82,34 L2,34 Z" fill="url(#cvdg)" />
            </svg>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginTop: 2 }}>+6,910</div>
          </div>

          {/* Carte flottante : Σ Delta */}
          <div
            className="brand-anim hidden md:block"
            style={{ position: 'absolute', zIndex: 20, bottom: 32, left: -48, background: 'rgb(var(--primary-rgb) / 0.07)', border: '1px solid rgb(var(--primary-rgb) / 0.25)', borderRadius: 11, padding: '11px 13px', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: '0 18px 40px rgba(0,0,0,.4), 0 0 28px rgb(var(--primary-rgb) / 0.12)', animation: 'brand-float 6.5s ease-in-out .4s infinite' }}
          >
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5 }}>Σ Delta</div>
            <div style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 18, fontWeight: 600, color: 'var(--primary)' }}>+1,284</div>
          </div>

          <div className="mockup-border relative rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgb(var(--primary-rgb) / 0.05)' }}>
            {/* Shimmer sweep */}
            <div className="absolute inset-0 z-20 pointer-events-none" style={{
              background: 'linear-gradient(90deg, transparent, rgb(var(--primary-light-rgb) / 0.04), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s infinite',
            }} />
            <HeroFootprint />
          </div>
          {/* Glow under mockup */}
          <div className="w-2/3 h-20 mx-auto -mt-10 blur-3xl rounded-full pointer-events-none" style={{ backgroundColor: 'rgb(var(--primary-rgb) / 0.1)' }} />
        </div>

        {/* Bas du hero — "Fill a demo order" : le clic remplit un ordre
            (voix + flash) puis dévoile les CTA de conversion sur place.
            La zone réserve sa hauteur (min-h) et le pill est ancré en haut
            (justify-start) : au clic le bloc se déploie vers le bas dans
            l'espace déjà réservé → la page ne bouge pas ET le bloc reste
            dans le hero (pas coupé par la section Features). */}
        <div
          className="relative mt-10 flex flex-col items-center justify-start min-h-[170px]"
          style={{ animation: 'fadeIn 1s ease-out 1.2s forwards', opacity: 0 }}
        >
          {!filled ? (
            <button
              type="button"
              onClick={handleFill}
              onPointerEnter={prefetchOrderFilled}
              aria-label="Fill a demo order"
              className="fill-cta-btn"
            >
              <span className="fill-cta-dot" />
              Fill a demo order
              <svg className="fill-cta-arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="order-fill-reveal">
              {/* Confirmation "ORDER FILLED" — flash vert (cf. notif desktop) */}
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  background: 'rgb(var(--primary-rgb) / 0.07)',
                  border: '1px solid rgb(var(--primary-rgb) / 0.25)',
                  borderRadius: 11,
                  padding: '9px 16px',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  textAlign: 'center',
                  animation: 'order-fill-flash 0.85s ease-out',
                  boxShadow: '0 18px 40px rgba(0,0,0,.4), 0 0 28px rgb(var(--primary-rgb) / 0.12)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--primary)', marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 8px rgb(var(--primary-rgb) / 0.8)' }} />
                  Order filled
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>BUY 1 MNQ M6 @ 20,374.25</div>
              </div>

              {/* Accroche conversion */}
              <p style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                You&apos;re in — now run it on your own feed
              </p>

              {/* CTA — réutilise les boutons de marque du hero */}
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {session ? (
                  <Link href="/live" className="landing-btn-primary">Open Dashboard</Link>
                ) : (
                  <>
                    <Link href="/auth/register" className="landing-btn-primary">Get free preview</Link>
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

              <button type="button" onClick={scrollToFeatures} className="fill-explore-link">
                Explore the platform ↓
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
