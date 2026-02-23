'use client';

import { useRef } from 'react';

const CAPABILITIES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    title: 'Ultra-Low Latency',
    desc: 'Sub-5ms data processing with direct WebSocket connections. No middleman, no delays — raw market data streamed to your screen.',
    features: ['Direct WebSocket', 'No Middleware', 'Real-Time Processing'],
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M6 8h.01M9 8h.01" />
        <path d="M6 11h12" />
      </svg>
    ),
    title: 'WebGL Rendering',
    desc: 'GPU-accelerated heatmaps and charts powered by WebGL. Handle millions of data points without frame drops.',
    features: ['GPU Accelerated', '60fps Rendering', 'Large Datasets'],
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
        <circle cx="18" cy="4" r="3" fill="var(--primary)" stroke="none" />
      </svg>
    ),
    title: 'Smart Alerts',
    desc: 'Custom alerts on volume spikes, orderbook imbalances, spoofing detection, and key level breaks. Never miss a setup.',
    features: ['Volume Spikes', 'Spoofing Detection', 'Key Level Breaks'],
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    title: 'Multi-Broker Support',
    desc: 'Connect Rithmic, Interactive Brokers, CQG or AMP in one click. Unified interface across all your accounts.',
    features: ['Rithmic', 'Interactive Brokers', 'CQG & AMP'],
  },
];

function CapabilityCard({ cap, i }: { cap: typeof CAPABILITIES[number]; i: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    card.style.transform = `perspective(600px) rotateX(${-y * 3}deg) rotateY(${x * 3}deg) translateY(-2px)`;
  };

  const handleMouseLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0)';
  };

  return (
    <div
      ref={cardRef}
      data-animate="up"
      data-animate-delay={String((i % 2) + 1)}
      className="group relative p-7 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:border-[rgb(var(--accent-rgb)_/_0.25)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_20px_rgb(var(--accent-rgb)_/_0.06)]"
      style={{ transition: 'transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease', willChange: 'transform' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 30% 30%, rgb(var(--accent-rgb) / 0.06), transparent 60%)' }}
      />

      <div className="relative z-10">
        <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110" style={{ background: 'linear-gradient(to bottom right, rgb(var(--accent-rgb) / 0.15), rgb(var(--primary-rgb) / 0.08))', border: '1px solid rgb(var(--accent-rgb) / 0.15)', color: 'var(--primary-light)' }}>
          {cap.icon}
        </div>
        <h3 className="text-[16px] font-semibold text-white group-hover:text-[var(--accent-light)] transition-colors">
          {cap.title}
        </h3>
        <p className="mt-2 text-[13px] text-white/45 leading-relaxed group-hover:text-white/60 transition-colors">
          {cap.desc}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {cap.features.map((feat) => (
            <span key={feat} className="inline-flex items-center gap-1.5 text-[11px] text-white/55">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--primary)' }}>
                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {feat}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CapabilitiesSection() {
  return (
    <section id="capabilities" className="relative px-6 py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Subtle ambient glow */}
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] pointer-events-none" style={{
        background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.04), transparent 65%)',
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
            Why Senzoukria
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm md:text-base text-white/50 max-w-lg mx-auto"
          >
            Built different — the technology behind your edge
          </p>
        </div>

        {/* Tech Stack Badges */}
        <div
          data-animate="up"
          data-animate-delay="2"
          className="flex flex-wrap items-center justify-center gap-2.5 mb-14"
        >
          {['WebGL 2.0', 'WebSocket', 'React 19', 'Next.js', 'TypeScript', 'GPU Compute'].map((tech) => (
            <span
              key={tech}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-white/40 border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm hover:border-[rgb(var(--primary-rgb)_/_0.2)] hover:text-[rgb(var(--primary-light-rgb)_/_0.6)] transition-all duration-300"
            >
              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: 'rgb(var(--primary-rgb) / 0.4)' }} />
              {tech}
            </span>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {CAPABILITIES.map((cap, i) => (
            <CapabilityCard key={cap.title} cap={cap} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
