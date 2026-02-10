'use client';

import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { TikTokIcon, YouTubeIcon } from '@/components/ui/Icons';

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Live Trading', href: '/live' },
      { label: 'Footprint Charts', href: '/footprint' },
      { label: 'Liquidity Heatmap', href: '/liquidity' },
      { label: 'GEX Dashboard', href: '/gex' },
      { label: 'IV Surface', href: '/volatility' },
      { label: 'Market Replay', href: '/replay' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'TikTok', href: 'https://tiktok.com/@zkb.trade' },
      { label: 'YouTube', href: 'https://youtube.com/@Zoukriabatata' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '#' },
      { label: 'Privacy Policy', href: '#' },
    ],
  },
];

const SOCIAL_LINKS = [
  { Icon: TikTokIcon, href: 'https://tiktok.com/@zkb.trade', label: 'TikTok' },
  { Icon: YouTubeIcon, href: 'https://youtube.com/@Zoukriabatata', label: 'YouTube' },
];

export default function LandingFooter() {
  return (
    <footer className="relative px-6 pt-16 pb-8" style={{ zIndex: 2 }}>
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.85) 100%)',
        zIndex: 1,
      }} />

      {/* Top border line */}
      <div className="absolute top-0 left-[5%] right-[5%] h-px" style={{
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
        zIndex: 3,
      }} />

      <div className="max-w-5xl mx-auto relative" style={{ zIndex: 10 }}>
        {/* Main footer grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" showText={true} />
            <p className="mt-3 text-[12px] text-white/35 leading-relaxed max-w-[200px]">
              Institutional-grade trading analytics for serious market participants.
            </p>

            {/* Social icons */}
            <div className="mt-5 flex items-center gap-3">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/[0.06] border border-white/[0.08] hover:border-amber-500/40 hover:bg-amber-500/15 transition-all duration-200"
                  aria-label={social.label}
                >
                  <social.Icon size={15} color="rgba(255,255,255,0.5)" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-500/70 mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => {
                  const isExternal = link.href.startsWith('http');
                  return (
                    <li key={link.label}>
                      {isExternal ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12px] text-white/35 hover:text-white/70 transition-colors duration-200"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-[12px] text-white/35 hover:text-white/70 transition-colors duration-200"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Risk disclaimer */}
        <div className="py-4 border-t border-white/[0.04]">
          <p className="text-[10px] text-white/15 leading-relaxed text-center max-w-2xl mx-auto">
            Trading futures and derivatives involves substantial risk of loss and is not suitable for all investors. Past performance is not indicative of future results. This platform provides analytical tools only and does not constitute financial advice.
          </p>
        </div>

        {/* Bottom bar */}
        <div className="pt-4 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-[11px] text-white/25">
            &copy; 2026 SENZOUKRIA. All rights reserved.
          </span>
          <span className="text-[10px] text-white/15 tracking-wide">
            Trading Intelligence Redefined
          </span>
        </div>
      </div>
    </footer>
  );
}
