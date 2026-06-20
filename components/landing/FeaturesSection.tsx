'use client';

import { memo, useRef } from 'react';
import {
  LiveIcon,
  FootprintIcon,
  DataFeedIcon,
} from '@/components/ui/Icons';

type FeatureStatus = 'live' | 'beta' | 'soon';

const STATUS_STYLES: Record<FeatureStatus, { label: string; color: string; bg: string; border: string }> = {
  live: { label: 'LIVE', color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
  beta: { label: 'BETA', color: 'var(--primary-light)', bg: 'rgb(var(--primary-light-rgb) / 0.08)', border: 'rgb(var(--primary-light-rgb) / 0.2)' },
  soon: { label: 'SOON', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
};

const FEATURES = [
  {
    Icon: FootprintIcon,
    title: 'Native footprint',
    desc: 'Bid and ask volume drawn at every price level. Delta, cumulative delta, imbalances flagged tick-by-tick — the broker session volume sits next to your own count.',
    status: 'live' as FeatureStatus,
  },
  {
    Icon: DataFeedIcon,
    title: 'Broker-side feeds',
    desc: 'NinjaTrader bridge for Apex and Rithmic. Rithmic R | API direct when you bring your own creds. Binance, Bybit and Deribit on tap — no broker required.',
    status: 'live' as FeatureStatus,
  },
  {
    Icon: LiveIcon,
    title: 'Live tape',
    desc: 'Every print, every book update, the moment it lands. Sub-5ms on the bridge, raw WebSocket on crypto. No web polling, no proxy hop.',
    status: 'live' as FeatureStatus,
  },
];

const FeatureCard = memo(function FeatureCard({ f, i }: { f: typeof FEATURES[number]; i: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mouse-x', `${x}%`);
    card.style.setProperty('--mouse-y', `${y}%`);
    // 3D tilt
    const rotateY = ((x - 50) / 50) * 4; // max 4deg
    const rotateX = ((50 - y) / 50) * 4;
    card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg)';
  };

  return (
    <div
      ref={cardRef}
      data-animate="up"
      data-animate-delay={String(i + 1)}
      className="feature-card group relative p-4 sm:p-6 rounded-xl border border-white/[0.08] bg-white/[0.04]"
      style={{ transition: 'transform 0.3s ease, border-color 0.35s ease, box-shadow 0.35s ease, background 0.35s ease', willChange: 'transform', opacity: f.status === 'soon' ? 0.6 : undefined }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgb(var(--primary-rgb) / 0.08), transparent 70%)',
        }}
      />
      <div className="relative z-10 flex items-start gap-4">
        <div className="feature-icon w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300" style={{ background: 'linear-gradient(to bottom right, rgb(var(--primary-rgb) / 0.15), rgb(var(--primary-dark-rgb) / 0.08))', border: '1px solid rgb(var(--primary-rgb) / 0.15)' }}>
          <f.Icon size={20} color="var(--primary)" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="dash-text-base font-semibold group-hover:text-[var(--primary-light)] transition-colors duration-300"
              style={{ color: 'var(--text-primary)' }}
            >
              {f.title}
            </h3>
            {(() => {
              const s = STATUS_STYLES[f.status];
              return (
                <span
                  className="px-1.5 py-0.5 rounded-full leading-none"
                  style={{
                    color: s.color,
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    fontFamily: 'var(--font-jetbrains-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.18em',
                  }}
                >
                  {s.label}
                </span>
              );
            })()}
          </div>
          <p
            className="mt-1.5 dash-text-sm leading-relaxed group-hover:text-white/65 transition-colors duration-300"
            style={{ color: 'var(--text-secondary)' }}
          >
            {f.desc}
          </p>
        </div>
      </div>
    </div>
  );
});

export default function FeaturesSection() {
  return (
    <section id="features" className="relative px-6 py-20 md:py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop — démarre transparent en haut pour se
          fondre dans le bas-de-hero déjà sombre (évite la dalle nette qui
          cassait la couture hero → Features). */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.5) 16%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.45) 100%)',
        zIndex: 1,
      }} />

      {/* Subtle ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none" style={{
        background: 'radial-gradient(ellipse, rgb(var(--primary-rgb) / 0.04), transparent 70%)',
        zIndex: 2,
      }} />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-5xl mx-auto relative" style={{ zIndex: 10 }}>
        <div className="text-center mb-16">
          <div
            data-animate="up"
            className="mb-4"
            style={{
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: 11,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            · What the bridge unlocks
          </div>
          <h2
            data-animate="up"
            data-animate-delay="1"
            className="leading-none"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontWeight: 400,
              fontSize: 'clamp(36px, 4.5vw, 56px)',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
            }}
          >
            Three primitives.{' '}
            <span style={{ fontWeight: 600, fontStyle: 'italic', color: 'var(--primary)' }}>Zero wrappers.</span>
          </h2>
          <p
            data-animate="up"
            data-animate-delay="2"
            className="mt-4 dash-text-sm md:dash-text-base max-w-lg mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Footprint, broker feed, live tape — rendered native. Nothing
            sits between your chart and the exchange tick.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <FeatureCard key={i} f={f} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
