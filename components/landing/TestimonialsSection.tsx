'use client';

const TESTIMONIALS = [
  {
    quote:
      "Switched from ATAS 6 months ago. The heatmap is cleaner, the footprint loads instantly, and I'm paying a fraction of the price. No regrets.",
    name: 'Alex M.',
    role: 'ES & NQ Day Trader',
    years: '5 yrs experience',
    avatar: 'AM',
    color: '#4ade80',
  },
  {
    quote:
      "The latency is insane. I can see absorption happening in real time before the move confirms. This is what prop firm trading looks like when your tools actually keep up.",
    name: 'James T.',
    role: 'NQ Scalper — Apex Funded',
    years: '3 yrs experience',
    avatar: 'JT',
    color: '#a78bfa',
  },
  {
    quote:
      "I use the liquidity heatmap to identify where stop clusters sit before every session. The visual is incredibly intuitive compared to other platforms I've tried.",
    name: 'Sarah K.',
    role: 'BTC & ETH Options Trader',
    years: '4 yrs experience',
    avatar: 'SK',
    color: '#60a5fa',
  },
  {
    quote:
      "The GEX dashboard alone is worth it for me. Being able to see gamma levels on crypto options in real time gives me an edge I didn't have with any other platform.",
    name: 'María R.',
    role: 'Crypto Derivatives Trader',
    years: '2 yrs experience',
    avatar: 'MR',
    color: '#f472b6',
  },
  {
    quote:
      "Delta profiles, CVD, footprint — everything I need in one tab. The dark theme is easy on the eyes during 6-hour sessions. Set up took 10 minutes.",
    name: 'David L.',
    role: 'CL & GC Futures Trader',
    years: '7 yrs experience',
    avatar: 'DL',
    color: '#fb923c',
  },
  {
    quote:
      "I was skeptical at first but the free tier convinced me. Within a week I upgraded. The orderflow tools here rival platforms that cost 10x more per month.",
    name: 'Chen W.',
    role: 'MNQ Futures Scalper',
    years: '2 yrs experience',
    avatar: 'CW',
    color: '#34d399',
  },
];

function StarRating() {
  return (
    <div className="flex items-center gap-0.5 mb-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsSection() {
  return (
    <section id="testimonials" className="relative px-6 py-28" style={{ zIndex: 2 }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.5) 100%)',
          zIndex: 1,
        }}
      />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-6xl mx-auto relative" style={{ zIndex: 10 }}>
        {/* Header */}
        <div className="text-center mb-16">
          <div
            data-animate="up"
            className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest"
            style={{
              color: 'rgb(var(--primary-light-rgb) / 0.7)',
              border: '1px solid rgb(var(--primary-rgb) / 0.15)',
              background: 'rgb(var(--primary-rgb) / 0.04)',
            }}
          >
            Trader Reviews
          </div>
          <h2
            data-animate="up"
            data-animate-delay="1"
            className="text-3xl md:text-4xl font-bold text-white tracking-tight"
          >
            Trusted by serious traders
          </h2>
          <p
            data-animate="up"
            data-animate-delay="2"
            className="mt-4 text-sm text-white/45 max-w-md mx-auto"
          >
            Professionals who switched from ATAS, Sierra Chart, and Bookmap
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              data-animate="up"
              data-animate-delay={String(i + 1)}
              className="relative rounded-xl p-5 border border-white/[0.07] bg-white/[0.02] transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04] group"
            >
              {/* Subtle color accent on hover */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at top left, ${t.color}06 0%, transparent 70%)` }}
              />

              <div className="relative z-10">
                <StarRating />

                <p className="text-[13px] text-white/60 leading-relaxed mb-5 group-hover:text-white/70 transition-colors">
                  &ldquo;{t.quote}&rdquo;
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${t.color}30, ${t.color}15)`,
                      border: `1px solid ${t.color}30`,
                      color: t.color,
                    }}
                  >
                    {t.avatar}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-white/80">{t.name}</div>
                    <div className="text-[11px] text-white/35">{t.role} · {t.years}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust bar */}
        <div
          data-animate="up"
          data-animate-delay="4"
          className="mt-12 flex flex-wrap items-center justify-center gap-6 text-[11px] text-white/30"
        >
          {[
            '★ 4.9/5 average rating',
            '500+ active traders',
            'No long-term contracts',
            'Cancel anytime',
          ].map((item) => (
            <span key={item} className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-white/20" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
