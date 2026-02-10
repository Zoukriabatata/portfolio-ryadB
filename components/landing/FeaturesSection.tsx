'use client';

import { useRef } from 'react';
import {
  LiveIcon,
  FootprintIcon,
  HeatmapIcon,
  GexIcon,
  VolatilityIcon,
  ReplayIcon,
} from '@/components/ui/Icons';

type FeatureStatus = 'live' | 'beta' | 'soon';

const STATUS_STYLES: Record<FeatureStatus, { label: string; color: string; bg: string; border: string }> = {
  live: { label: 'Live', color: '#34d399', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
  beta: { label: 'Beta', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' },
  soon: { label: 'Soon', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' },
};

const FEATURES = [
  {
    Icon: LiveIcon,
    title: 'Live Trading Dashboard',
    desc: 'Real-time WebSocket feeds from Binance, Bybit & Deribit with sub-5ms latency orderbook and trades.',
    status: 'live' as FeatureStatus,
  },
  {
    Icon: FootprintIcon,
    title: 'Footprint Charts',
    desc: 'Bid/ask volume analysis with delta, cumulative delta, and imbalance detection at every price level.',
    status: 'beta' as FeatureStatus,
  },
  {
    Icon: HeatmapIcon,
    title: 'Liquidity Heatmap',
    desc: 'WebGL-accelerated orderbook depth visualization with passive order detection and spoofing alerts.',
    status: 'live' as FeatureStatus,
  },
  {
    Icon: GexIcon,
    title: 'GEX Dashboard',
    desc: 'Gamma exposure tracking across strikes and expirations. Identify dealer hedging flows and key levels.',
    status: 'beta' as FeatureStatus,
  },
  {
    Icon: VolatilityIcon,
    title: 'IV Surface',
    desc: 'Volatility smile, term structure & skew analysis with real-time Greeks from Deribit options chain.',
    status: 'beta' as FeatureStatus,
  },
  {
    Icon: ReplayIcon,
    title: 'Market Replay',
    desc: 'Frame-by-frame historical session playback. Study past setups and backtest strategies with precision.',
    status: 'soon' as FeatureStatus,
  },
];

function FeatureCard({ f, i }: { f: typeof FEATURES[number]; i: number }) {
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
      className="feature-card group relative p-6 rounded-xl border border-white/[0.08] bg-white/[0.04]"
      style={{ transition: 'transform 0.3s ease, border-color 0.35s ease, box-shadow 0.35s ease, background 0.35s ease', willChange: 'transform' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(245,158,11,0.08), transparent 70%)',
        }}
      />
      <div className="relative z-10 flex items-start gap-4">
        <div className="feature-icon w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-amber-500/15 to-orange-600/8 border border-amber-500/15 transition-all duration-300">
          <f.Icon size={20} color="#f59e0b" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-white group-hover:text-amber-200 transition-colors duration-300">
              {f.title}
            </h3>
            {(() => {
              const s = STATUS_STYLES[f.status];
              return (
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full leading-none"
                  style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
                >
                  {s.label}
                </span>
              );
            })()}
          </div>
          <p className="mt-1.5 text-[12px] text-white/45 leading-relaxed group-hover:text-white/60 transition-colors duration-300">
            {f.desc}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  return (
    <section id="features" className="relative px-6 py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Subtle ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none" style={{
        background: 'radial-gradient(ellipse, rgba(245,158,11,0.04), transparent 70%)',
        zIndex: 2,
      }} />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-5xl mx-auto relative" style={{ zIndex: 10 }}>
        <div className="text-center mb-16">
          <h2
            data-animate="up"
            className="text-3xl md:text-4xl font-bold text-white tracking-tight"
          >
            Everything you need
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm md:text-base text-white/50 max-w-lg mx-auto"
          >
            Professional trading tools built for serious market participants
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
