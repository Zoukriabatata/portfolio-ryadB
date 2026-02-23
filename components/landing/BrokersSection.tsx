'use client';

const BROKERS = [
  {
    name: 'Rithmic',
    initial: 'R',
    color: '#00c853',
    features: ['Low Latency', 'API', 'Futures'],
    desc: 'Industry-leading high-performance trading infrastructure with ultra-low latency execution.',
    highlighted: true,
  },
  {
    name: 'Interactive Brokers',
    initial: 'IB',
    color: '#e31937',
    features: ['Futures', 'Options', 'Stocks'],
    desc: 'Professional-grade broker with direct market access, low commissions and global coverage.',
    highlighted: true,
  },
  {
    name: 'CQG',
    initial: 'CQ',
    color: '#1976d2',
    features: ['Data Feed', 'Futures', 'Professional'],
    desc: 'Premium market data and order routing platform trusted by professional traders worldwide.',
    highlighted: true,
  },
  {
    name: 'AMP Futures',
    initial: 'AMP',
    color: '#7c3aed',
    features: ['Futures', 'Low Cost', 'Multi-Platform'],
    desc: 'Ultra-low commission futures broker with access to 30+ trading platforms.',
    highlighted: false,
  },
  {
    name: 'NinjaTrader',
    initial: 'NT',
    color: '#ff6d00',
    features: ['Platform', 'Futures', 'Orderflow'],
    desc: 'Advanced trading platform with built-in market analysis and low-cost futures trading.',
    highlighted: false,
  },
  {
    name: 'Tradovate',
    initial: 'TV',
    color: '#06b6d4',
    features: ['Cloud', 'Futures', 'Mobile'],
    desc: 'Modern cloud-based futures platform with competitive pricing and mobile-first design.',
    highlighted: false,
  },
];

export default function BrokersSection() {
  return (
    <section id="brokers" className="relative px-6 py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Subtle ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] pointer-events-none" style={{
        background: 'radial-gradient(circle, rgba(var(--accent-rgb), 0.05), transparent 65%)',
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
            Compatible with Top Brokers
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm md:text-base text-white/50 max-w-lg mx-auto"
          >
            Connect your broker and trade with institutional-grade orderflow tools
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BROKERS.map((broker, i) => (
            <div
              key={broker.name}
              data-animate="up"
              data-animate-delay={String((i % 3) + 1)}
              className={`
                broker-card group relative p-6 rounded-xl border transition-all duration-300
                ${broker.highlighted
                  ? 'border-[rgba(var(--primary-rgb),0.2)] bg-white/[0.04]'
                  : 'border-white/[0.08] bg-white/[0.03]'
                }
                hover:transform hover:-translate-y-1
              `}
              style={{
                // @ts-expect-error CSS custom property
                '--broker-color': broker.color,
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = `${broker.color}50`;
                el.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 25px ${broker.color}18`;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.borderColor = '';
                el.style.boxShadow = '';
              }}
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(circle at 30% 30%, ${broker.color}08, transparent 60%)` }}
              />

              <div className="relative z-10 flex items-start gap-4">
                {/* Initial circle */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${broker.color}30, ${broker.color}10)`,
                    border: `1px solid ${broker.color}35`,
                    color: broker.color,
                  }}
                >
                  {broker.initial}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-white group-hover:text-[var(--primary-light)] transition-colors">
                    {broker.name}
                  </h3>
                  <p className="mt-1 text-[12px] text-white/45 leading-relaxed group-hover:text-white/60 transition-colors">
                    {broker.desc}
                  </p>

                  {/* Feature pills */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {broker.features.map((feat) => (
                      <span
                        key={feat}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase border"
                        style={{
                          color: broker.color,
                          borderColor: `${broker.color}30`,
                          background: `${broker.color}12`,
                        }}
                      >
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          data-animate="up"
          data-animate-delay="3"
          className="mt-12 text-center"
        >
          <p className="text-[13px] text-white/35 mb-4">
            Connect in one click — no API key configuration needed
          </p>
          <a
            href="/auth/register"
            className="landing-btn-primary"
          >
            Connect Your Broker
          </a>
        </div>
      </div>
    </section>
  );
}
