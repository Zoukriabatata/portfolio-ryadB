'use client';

const BROKERS = [
  {
    name: 'NinjaTrader bridge',
    initial: 'NT',
    color: '#ff6d00',
    features: ['Futures', 'Apex · Rithmic', 'Recommended'],
    desc: 'You already run NinjaTrader. Drop our NinjaScript file, F5 compile, attach the indicator — OrderflowV2 reads the same tick feed NT shows you, locally, no extra creds.',
    highlighted: true,
  },
  {
    name: 'Rithmic direct',
    initial: 'R',
    color: '#00c853',
    features: ['Futures', 'R | API', 'Apex'],
    desc: 'Bring your Rithmic / Apex login. The desktop speaks R | Protocol natively — Protocol Buffers, WebSocket, separate sessions for market data and order routing.',
    highlighted: true,
  },
  {
    name: 'Crypto',
    initial: 'BTC',
    color: '#4ade80',
    features: ['Binance', 'Bybit', 'Deribit'],
    desc: 'Public market data on Binance, Bybit and Deribit. No account, no API key. Trades, depth and options chain online within seconds of launch.',
    highlighted: true,
  },
];

export default function BrokersSection() {
  return (
    <section id="brokers" className="relative px-6 py-20 md:py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Subtle ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] pointer-events-none" style={{
        background: 'radial-gradient(circle, rgb(var(--accent-rgb) / 0.05), transparent 65%)',
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
            · Where the data comes from
          </div>
          <h2
            data-animate="up"
            data-animate-delay="1"
            className="leading-none"
            style={{
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontWeight: 500,
              fontSize: 'clamp(36px, 4.5vw, 60px)',
              letterSpacing: '-0.04em',
              textTransform: 'uppercase',
              WebkitFontSmoothing: 'subpixel-antialiased',
            }}
          >
            Three ways to plug in
          </h2>
          <p
            data-animate="up"
            data-animate-delay="2"
            className="mt-4 dash-text-sm md:dash-text-base max-w-xl mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Pick the path that matches your setup. NT users keep their
            existing feed. Rithmic / Apex traders connect direct. Crypto
            works with no broker at all.
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
                  ? 'border-[rgb(var(--primary-rgb)_/_0.2)] bg-white/[0.04]'
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
                  <h3
                    className="dash-text-base font-semibold group-hover:text-[var(--primary-light)] transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {broker.name}
                  </h3>
                  <p
                    className="mt-1 dash-text-sm leading-relaxed group-hover:text-white/65 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {broker.desc}
                  </p>

                  {/* Feature pills */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {broker.features.map((feat) => (
                      <span
                        key={feat}
                        className="px-2 py-0.5 rounded-full border"
                        style={{
                          color: broker.color,
                          borderColor: `${broker.color}30`,
                          background: `${broker.color}12`,
                          fontFamily: 'var(--font-jetbrains-mono)',
                          fontSize: '10px',
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
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
          <p
            className="dash-text-sm mb-4"
            style={{ color: 'var(--text-muted)' }}
          >
            Switch source mid-session. No restart, no relog.
          </p>
          <a
            href="/auth/register"
            className="landing-btn-primary"
          >
            Get free preview
          </a>
        </div>
      </div>
    </section>
  );
}
