'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Logotype from '@/components/ui/brand/Logotype';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Brokers', href: '#brokers' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Download', href: '/download' },
  { label: 'Community', href: '#community' },
];

export default function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const { data: session } = useSession();

  useEffect(() => {
    const scrollEl = document.querySelector('[data-scroll-root]');
    if (!scrollEl) return;

    const handleScroll = () => {
      const st = scrollEl.scrollTop;
      setScrolled(st > 60);

      const sections = NAV_LINKS.map(l => l.href.slice(1));
      let current = '';
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el && el.offsetTop - 120 <= st) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  const handleLinkClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      const id = href.slice(1);
      const target = document.getElementById(id);
      const scrollRoot = document.querySelector('[data-scroll-root]');
      if (target && scrollRoot) {
        const offset = target.offsetTop - 80;
        scrollRoot.scrollTo({ top: offset, behavior: 'smooth' });
      }
    }
    setMobileOpen(false);
  }, []);

  const isActive = (href: string) => activeSection === href.slice(1);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] flex justify-center px-4 pt-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-5xl">
        {/* Pill flottante en verre */}
        <div
          className="flex items-center h-[54px] pl-[18px] pr-[10px] rounded-[15px] transition-all duration-300"
          style={{
            border: '1px solid rgba(255,255,255,.10)',
            background: scrolled || mobileOpen ? 'rgba(13,15,27,.62)' : 'rgba(13,15,27,.42)',
            backdropFilter: 'blur(18px) saturate(150%)',
            WebkitBackdropFilter: 'blur(18px) saturate(150%)',
            boxShadow: '0 12px 36px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.07)',
          }}
        >
          {/* Brand */}
          <Link href="/" className="flex-shrink-0" aria-label="Senzoukria">
            <Logotype fontSize={20} />
          </Link>

          {/* Liens centrés (desktop) */}
          <div className="hidden md:flex flex-1 items-center justify-center gap-7">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleLinkClick(e, link.href)}
                className="text-[13px] font-medium transition-colors duration-200"
                style={{ color: isActive(link.href) ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3.5 ml-auto md:ml-0">
            {session ? (
              <Link href="/live" className="landing-btn-primary text-sm">Dashboard</Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="hidden sm:block text-[13px] font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Sign in
                </Link>
                <Link href="/auth/register" className="landing-btn-primary text-sm">
                  Get free preview
                </Link>
              </>
            )}

            {/* Hamburger (mobile) */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
              aria-label="Toggle menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/60">
                {mobileOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Dropdown mobile (panneau verre sous la pill) */}
        <div
          className={`
            md:hidden mt-2 rounded-[14px] border border-white/[0.08] px-4 flex flex-col gap-1
            overflow-hidden transition-all duration-300 ease-in-out
            ${mobileOpen ? 'max-h-72 py-3 opacity-100' : 'max-h-0 py-0 opacity-0 border-transparent'}
          `}
          style={{
            background: 'rgba(13,15,27,.85)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}
        >
          {NAV_LINKS.map((link, i) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleLinkClick(e, link.href)}
              className="text-sm font-medium transition-all py-2.5 px-3 rounded-lg hover:bg-white/[0.04]"
              style={{
                transitionDelay: mobileOpen ? `${i * 50}ms` : '0ms',
                transform: mobileOpen ? 'translateX(0)' : 'translateX(-12px)',
                opacity: mobileOpen ? 1 : 0,
                color: isActive(link.href) ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
