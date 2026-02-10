'use client';

import { TikTokIcon, YouTubeIcon } from '@/components/ui/Icons';

const SOCIALS = [
  {
    platform: 'TikTok',
    handle: '@zkb.trade',
    Icon: TikTokIcon,
    description: 'Daily trading insights, orderflow breakdowns, and live market analysis. Short-form content that makes complex concepts simple.',
    cta: 'Follow on TikTok',
    href: 'https://tiktok.com/@zkb.trade',
    color: '#FF0050',
    bgGlow: 'rgba(255, 0, 80, 0.08)',
  },
  {
    platform: 'YouTube',
    handle: '@Zoukriabatata',
    Icon: YouTubeIcon,
    description: 'In-depth tutorials, strategy guides, and platform walkthroughs. Learn to master orderflow analysis step by step.',
    cta: 'Subscribe on YouTube',
    href: 'https://youtube.com/@Zoukriabatata',
    color: '#FF0000',
    bgGlow: 'rgba(255, 0, 0, 0.08)',
  },
];

export default function SocialSection() {
  return (
    <section id="community" className="relative px-6 py-28" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0.5) 100%)',
        zIndex: 1,
      }} />

      {/* Section divider */}
      <div className="section-divider-shimmer" />

      <div className="max-w-4xl mx-auto relative" style={{ zIndex: 10 }}>
        <div className="text-center mb-16">
          <h2
            data-animate="up"
            className="text-3xl md:text-4xl font-bold text-white tracking-tight"
          >
            Join the Community
          </h2>
          <p
            data-animate="up"
            data-animate-delay="1"
            className="mt-4 text-sm md:text-base text-white/50 max-w-lg mx-auto"
          >
            Follow us for daily trading insights and platform tutorials
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
                    <h3 className="text-[15px] font-semibold text-white group-hover:text-white transition-colors">
                      {social.handle}
                    </h3>
                    <span className="text-[10px] uppercase tracking-[0.1em] font-medium px-2 py-0.5 rounded-full" style={{ color: social.color, background: `${social.color}15` }}>
                      {social.platform}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-white/40 leading-relaxed group-hover:text-white/55 transition-colors line-clamp-1">
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
