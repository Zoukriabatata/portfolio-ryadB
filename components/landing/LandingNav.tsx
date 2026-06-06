'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Logotype from '@/components/ui/brand/Logotype';
import { Menu, X, Zap, Plug, Tag, Download, Users, ChevronRight } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Features', href: '#features', Icon: Zap },
  { label: 'Brokers', href: '#brokers', Icon: Plug },
  { label: 'Pricing', href: '/pricing', Icon: Tag },
  { label: 'Download', href: '/download', Icon: Download },
  { label: 'Community', href: '#community', Icon: Users },
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
            border: '1px solid rgb(var(--primary-rgb) / 0.18)',
            background: scrolled || mobileOpen
              ? 'linear-gradient(180deg, rgb(var(--primary-rgb) / 0.05), rgba(13,15,27,0.50))'
              : 'linear-gradient(180deg, rgb(var(--primary-rgb) / 0.04), rgba(13,15,27,0.30))',
            backdropFilter: 'blur(26px) saturate(180%)',
            WebkitBackdropFilter: 'blur(26px) saturate(180%)',
            boxShadow: '0 16px 44px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 26px rgb(var(--primary-rgb) / 0.05), 0 0 26px rgb(var(--primary-rgb) / 0.07)',
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
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-[10px] transition-colors"
              style={{ border: '1px solid rgb(var(--primary-rgb) / 0.22)', background: 'rgb(var(--primary-rgb) / 0.06)', color: 'var(--primary-light)' }}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={17} strokeWidth={2.2} /> : <Menu size={17} strokeWidth={2.2} />}
            </button>
          </div>
        </div>

        {/* Dropdown mobile — panneau verre teinté thème */}
        <div
          className={`md:hidden mt-2 rounded-2xl overflow-hidden transition-all duration-300 ease-in-out ${mobileOpen ? 'max-h-[440px] opacity-100' : 'max-h-0 opacity-0'}`}
          style={{
            border: `1px solid ${mobileOpen ? 'rgb(var(--primary-rgb) / 0.18)' : 'transparent'}`,
            background: 'linear-gradient(180deg, rgb(var(--primary-rgb) / 0.07), rgba(13,15,27,0.72))',
            backdropFilter: 'blur(26px) saturate(170%)',
            WebkitBackdropFilter: 'blur(26px) saturate(170%)',
            boxShadow: mobileOpen ? '0 22px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.10), 0 0 30px rgb(var(--primary-rgb) / 0.07)' : 'none',
          }}
        >
          <div className="flex flex-col gap-1 p-2.5">
            {NAV_LINKS.map((link, i) => {
              const active = isActive(link.href);
              return (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleLinkClick(e, link.href)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all"
                  style={{
                    transitionDelay: mobileOpen ? `${i * 45}ms` : '0ms',
                    transform: mobileOpen ? 'translateX(0)' : 'translateX(-10px)',
                    opacity: mobileOpen ? 1 : 0,
                    background: active ? 'rgb(var(--primary-rgb) / 0.10)' : 'transparent',
                    color: active ? 'var(--primary-light)' : 'var(--text-secondary)',
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                  }}
                >
                  <span
                    className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                    style={{ background: 'rgb(var(--primary-rgb) / 0.08)', border: '1px solid rgb(var(--primary-rgb) / 0.15)', color: 'var(--primary)' }}
                  >
                    <link.Icon size={16} strokeWidth={2} />
                  </span>
                  {link.label}
                  <ChevronRight size={15} className="ml-auto" style={{ color: 'var(--text-dimmed)' }} />
                </a>
              );
            })}
          </div>

          {!session && (
            <div className="flex flex-col gap-2 p-2.5 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <Link href="/auth/register" onClick={() => setMobileOpen(false)} className="landing-btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Get free preview</Link>
              <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="landing-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>Sign in</Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
