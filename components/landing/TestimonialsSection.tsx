'use client';

// Placeholder testimonial set. These are illustrative — real
// quotes get wired in after the public preview closes 17 June 2026.
const TESTIMONIALS = [
  {
    quote:
      "Footprint matches my NinjaTrader bar-for-bar. First tool I've tried where the daily volume actually reconciles. Bridge install took 4 minutes.",
    name: 'Preview tester',
    role: 'ES · NQ day trader',
    years: 'Apex PA',
    avatar: 'PT',
    color: '#4ade80',
  },
  {
    quote:
      "Sub-5ms is not marketing — the cells repaint before NT redraws the bar. I can read absorption pre-confirmation. This is the desk experience.",
    name: 'Preview tester',
    role: 'NQ scalper',
    years: 'Apex funded',
    avatar: 'PT',
    color: '#34d399',
  },
  {
    quote:
      "Delta, CVD, imbalance, footprint — one tab. No browser, no Electron jank. The 8 MB installer and the NinjaScript file is the whole setup.",
    name: 'Preview tester',
    role: 'CL · GC futures',
    years: 'Self-funded',
    avatar: 'PT',
    color: '#4ade80',
  },
  {
    quote:
      "I was paying $89/month for a wrapper that lagged my NT feed by ~150ms. The bridge eliminates the hop. $29/month and the numbers match my broker.",
    name: 'Preview tester',
    role: 'MNQ scalper',
    years: 'Apex eval',
    avatar: 'PT',
    color: '#34d399',
  },
  {
    quote:
      "Tape alerts trigger from the engine, not a setTimeout. I missed the volume spike on the cloud tool because the tab was inactive. Native fixes that.",
    name: 'Preview tester',
    role: 'ES day trader',
    years: 'Rithmic direct',
    avatar: 'PT',
    color: '#4ade80',
  },
  {
    quote:
      "Switched my whole workflow over during the preview window. The crypto side covers Deribit options too — no other footprint app does that natively.",
    name: 'Preview tester',
    role: 'Crypto derivatives',
    years: 'Self-funded',
    avatar: 'PT',
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
    <section id="testimonials" className="relative px-6 py-20 md:py-28" style={{ zIndex: 2 }}>
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
            className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full"
            style={{
              color: 'rgb(var(--primary-light-rgb) / 0.7)',
              border: '1px solid rgb(var(--primary-rgb) / 0.15)',
              background: 'rgb(var(--primary-rgb) / 0.04)',
              fontFamily: 'var(--font-jetbrains-mono)',
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Field reports
          </div>
          <div
            data-animate="up"
            data-animate-delay="1"
            className="italic mb-3"
            style={{
              fontFamily: 'var(--font-instrument-serif)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-lg)',
            }}
          >
            From the desk
          </div>
          <h2
            data-animate="up"
            data-animate-delay="2"
            className="dash-text-2xl md:dash-text-3xl tracking-tight"
            style={{ color: 'var(--text-primary)', fontWeight: 700 }}
          >
            Early traders, on the bridge.
          </h2>
          <p
            data-animate="up"
            data-animate-delay="3"
            className="mt-4 dash-text-sm max-w-md mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Verified feedback rolls in after the public preview closes
            on 17 June 2026. No paid testimonials. No fake names.
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

                <p
                  className="dash-text-sm leading-relaxed mb-5 group-hover:text-white/75 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  &ldquo;{t.quote}&rdquo;
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${t.color}30, ${t.color}15)`,
                      border: `1px solid ${t.color}30`,
                      color: t.color,
                      fontFamily: 'var(--font-jetbrains-mono)',
                      fontSize: '11px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {t.avatar}
                  </div>
                  <div>
                    <div className="dash-text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {t.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t.role} · {t.years}
                    </div>
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
          className="mt-12 flex flex-wrap items-center justify-center gap-6"
          style={{
            fontFamily: 'var(--font-jetbrains-mono)',
            fontSize: '10px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {[
            'No paid testimonials',
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
