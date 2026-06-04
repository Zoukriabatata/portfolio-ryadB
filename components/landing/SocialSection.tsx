'use client';

import { TikTokIcon, YouTubeIcon } from '@/components/ui/Icons';

const SOCIALS = [
  {
    platform: 'TikTok',
    handle: '@zkb.trade',
    Icon: TikTokIcon,
    description: 'Tape reads, orderflow breakdowns, session recaps. Short-form, no fluff.',
    cta: 'Follow on TikTok',
    href: 'https://tiktok.com/@zkb.trade',
    color: '#FF0050',
    bgGlow: 'rgba(255, 0, 80, 0.08)',
  },
  {
    platform: 'YouTube',
    handle: '@Zoukriabatata',
    Icon: YouTubeIcon,
    description: 'Long-form: setup walkthroughs, footprint deep dives, bridge install guides.',
    cta: 'Subscribe on YouTube',
    href: 'https://youtube.com/@Zoukriabatata',
    color: '#FF0000',
    bgGlow: 'rgba(255, 0, 0, 0.08)',
  },
];

export default function SocialSection() {
  return (
    <section id="community" className="relative px-6 py-20 md:py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-4xl mx-auto relative" style={{ zIndex: 10 }}>
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
            · Off the bridge
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
            Tape reads
          </h2>
          <p
            data-animate="up"
            data-animate-delay="2"
            className="mt-4 dash-text-sm md:dash-text-base max-w-lg mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Daily session recaps and footprint breakdowns. Pick the format.
          </p>
        </div>

        <div className="flex flex-col gap-4 max-w-2xl mx-auto">
          {SOCIALS.map((social, i) => (
            <a
              key={social.platform}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              data-animate="up"
              data-animate-delay={String(i + 1)}
              className="group relative px-6 py-5 rounded-xl border border-white/[0.08] bg-white/[0.04] transition-all duration-300 hover:-translate-y-0.5 block"
            >
              {/* Hover border */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ boxShadow: `inset 0 0 0 1px ${social.color}30, 0 0 20px ${social.color}10` }}
              />

              <div className="relative z-10 flex items-center gap-5">
                {/* Platform icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${social.color}20, ${social.color}08)`,
                    border: `1px solid ${social.color}25`,
                  }}
                >
                  <social.Icon size={22} color={social.color} />
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className="dash-text-base font-semibold transition-colors"
                      style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-jetbrains-mono)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {social.handle}
                    </h3>
                    <span
                      className="px-2 py-0.5 rounded-full"
                      style={{
                        color: social.color,
                        background: `${social.color}15`,
                        fontFamily: 'var(--font-jetbrains-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {social.platform}
                    </span>
                  </div>
                  <p
                    className="mt-1 dash-text-sm leading-relaxed group-hover:text-white/60 transition-colors line-clamp-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {social.description}
                  </p>
                </div>

                {/* Arrow */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 group-hover:text-white/50 transition-colors shrink-0">
                  <path d="M7 17L17 7M17 7H7M17 7v10" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
