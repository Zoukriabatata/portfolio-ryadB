'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Logo from '@/components/ui/Logo';

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Brokers', href: '#brokers' },
  { label: 'Pricing', href: '/pricing' },
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

      // Determine active section
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

  // Escape key closes mobile nav
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
    <nav
      className={`
        fixed top-0 left-0 right-0 z-[100] transition-all duration-300
        ${scrolled || mobileOpen
          ? 'bg-black/85 backdrop-blur-2xl border-b border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.5)]'
          : 'bg-transparent border-b border-transparent'
        }
      `}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex-shrink-0">
          <Logo size="md" showText={true} animated={true} />
        </Link>

        {/* Center Links — desktop */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleLinkClick(e, link.href)}
              className={`
                relative text-sm font-medium transition-colors duration-200 py-1
                ${isActive(link.href)
                  ? ''
                  : 'text-white/50 hover:text-white/90'
                }
              `}
              style={isActive(link.href) ? { color: 'var(--primary-light)' } : undefined}
            >
              {link.label}
              {/* Active indicator dot */}
              <span
                className={`
                  absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full
                  transition-all duration-300
                  ${isActive(link.href) ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                `}
                style={{ backgroundColor: 'var(--primary-light)' }}
              />
            </a>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {session ? (
            <Link
              href="/live"
              className="landing-btn-primary text-sm"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="text-sm font-medium text-white/50 hover:text-white/90 transition-colors hidden sm:block"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="landing-btn-primary text-sm"
              >
                Get Started
              </Link>
            </>
          )}

          {/* Hamburger — mobile */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden ml-2 w-9 h-9 flex items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
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

      {/* Mobile dropdown */}
      <div
        className={`
          md:hidden border-t border-white/[0.06] bg-black/90 backdrop-blur-2xl px-6 flex flex-col gap-1
          overflow-hidden transition-all duration-300 ease-in-out
          ${mobileOpen ? 'max-h-60 py-4 opacity-100' : 'max-h-0 py-0 opacity-0'}
        `}
      >
        {NAV_LINKS.map((link, i) => (
          <a
            key={link.label}
            href={link.href}
            onClick={(e) => handleLinkClick(e, link.href)}
            className={`
              text-sm font-medium transition-all py-2.5 px-3 rounded-lg hover:bg-white/[0.04]
              ${isActive(link.href) ? '' : 'text-white/60 hover:text-white/90'}
            `}
            style={{
              transitionDelay: mobileOpen ? `${i * 50}ms` : '0ms',
              transform: mobileOpen ? 'translateX(0)' : 'translateX(-12px)',
              opacity: mobileOpen ? 1 : 0,
              ...(isActive(link.href) ? { color: 'var(--primary-light)' } : {}),
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
