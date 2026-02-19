'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import Logo from '@/components/ui/Logo';
import { useUIThemeStore, applyUITheme, UI_THEMES, type UIThemeId } from '@/stores/useUIThemeStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { TranslationKey } from '@/lib/i18n/translations';
import {
  LiveIcon,
  FootprintIcon,
  GexIcon,
  VolatilityIcon,
  NewsIcon,
  HeatmapIcon,
  ConnectedIcon,
  DataFeedIcon,
  JournalIcon,
  ReplayIcon,
  BiasIcon,
} from '@/components/ui/Icons';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';

// ============================================================
// KEEP-ALIVE CHART COMPONENTS
// These are loaded once and stay mounted across navigation.
// Only `display` toggles — no unmount/remount, no data loss.
// ============================================================

const CHART_ROUTES = ['/live', '/footprint', '/liquidity', '/gex', '/volatility', '/bias'] as const;
type ChartRoute = typeof CHART_ROUTES[number];

const LivePageContent = dynamic(() => import('@/components/pages/LivePageContent'), { ssr: false });
const FootprintPageContent = dynamic(() => import('@/components/pages/FootprintPageContent'), { ssr: false });
const LiquidityPageContent = dynamic(() => import('@/components/pages/LiquidityPageContent'), { ssr: false });
const GEXPageContent = dynamic(() => import('@/components/pages/GEXPageContent'), { ssr: false });
const VolatilityPageContent = dynamic(() => import('@/components/pages/VolatilityPageContent'), { ssr: false });
const BiasPageContent = dynamic(() => import('@/components/pages/BiasPageContent'), { ssr: false });

const CHART_COMPONENTS: Record<ChartRoute, React.ComponentType> = {
  '/live': LivePageContent,
  '/footprint': FootprintPageContent,
  '/liquidity': LiquidityPageContent,
  '/gex': GEXPageContent,
  '/volatility': VolatilityPageContent,
  '/bias': BiasPageContent,
};

// ============================================================
// NAVIGATION CONFIG
// ============================================================

const NAV_ITEMS: Array<{
  href: string;
  labelKey: TranslationKey;
  Icon: React.ComponentType<any>;
  color: string;
}> = [
  { href: '/live', labelKey: 'nav.live', Icon: LiveIcon, color: '#10b981' },
  { href: '/footprint', labelKey: 'nav.footprint', Icon: FootprintIcon, color: '#14b8a6' },
  { href: '/liquidity', labelKey: 'nav.liquidity', Icon: HeatmapIcon, color: '#06b6d4' },
  { href: '/gex', labelKey: 'nav.gex', Icon: GexIcon, color: '#22d3ee' },
  { href: '/volatility', labelKey: 'nav.volatility', Icon: VolatilityIcon, color: '#0ea5e9' },
  { href: '/bias', labelKey: 'nav.bias', Icon: BiasIcon, color: '#f59e0b' },
  { href: '/news', labelKey: 'nav.news', Icon: NewsIcon, color: '#84cc16' },
  { href: '/journal', labelKey: 'nav.journal', Icon: JournalIcon, color: '#f59e0b' },
  { href: '/replay', labelKey: 'nav.replay', Icon: ReplayIcon, color: '#8b5cf6' },
  { href: '/boutique', labelKey: 'nav.dataFeeds', Icon: DataFeedIcon, color: '#fbbf24' },
];

export function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';
  const { activeTheme, setTheme } = useUIThemeStore();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { t } = useTranslation();

  // Apply UI theme on mount and changes
  useEffect(() => {
    applyUITheme(activeTheme);
  }, [activeTheme]);

  // Track which chart routes have been visited (lazy mount)
  const [mounted, setMounted] = useState<Set<ChartRoute>>(new Set());

  useEffect(() => {
    const match = CHART_ROUTES.find(r => pathname === r || pathname.startsWith(r + '/'));
    if (match && !mounted.has(match)) {
      setMounted(prev => new Set([...prev, match]));
    }
  }, [pathname, mounted]);

  // Determine if current route is a keep-alive chart route
  const activeChart = CHART_ROUTES.find(r => pathname === r || pathname.startsWith(r + '/'));
  const isChartRoute = !!activeChart;

  return (
    <SessionProvider>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      {/* ============================================================
          TOPBAR NAVIGATION (hidden on landing page)
          ============================================================ */}
      {!isLandingPage && (
      <nav className="h-14 flex-shrink-0 glass border-b border-[var(--border)] relative z-50">
        <div className="h-full px-3 md:px-4 flex items-center gap-3 md:gap-6">
          {/* Hamburger - mobile only */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface)] transition-colors sm:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {showMobileMenu ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
              )}
            </svg>
          </button>

          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Logo size="md" showText={true} animated={true} />
          </Link>

          {/* Navigation Pills — hidden on mobile (drawer instead), icon-only on tablet, full on desktop */}
          <div className="hidden sm:flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const IconComponent = item.Icon;
              const label = t(item.labelKey);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    group relative px-2 lg:px-3 py-2 rounded-lg flex items-center gap-2
                    transition-all duration-200 ease-out flex-shrink-0
                    ${isActive
                      ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)]'
                    }
                  `}
                  title={label}
                >
                  <span
                    className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                    style={{ color: isActive ? item.color : 'currentColor' }}
                  >
                    <IconComponent size={16} />
                  </span>

                  <span className="text-xs font-medium hidden lg:inline">
                    {label}
                  </span>

                  {isActive && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right Side - Status & Account */}
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 ml-auto sm:ml-0">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors hidden md:block"
            >
              Home
            </Link>

            {/* Live Status */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <ConnectedIcon size={12} color="#10b981" />
              <span className="text-[11px] font-medium text-[var(--primary)]">Live</span>
            </div>

            {/* Theme Picker */}
            <div className="relative">
              <button
                onClick={() => setShowThemePicker(!showThemePicker)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-light)] hover:bg-[var(--surface)] transition-all"
                title="Change theme"
              >
                <div className="w-4 h-4 rounded-full border border-[var(--border-light)]" style={{ background: `linear-gradient(135deg, var(--primary), var(--accent))` }} />
                <span className="text-[10px] text-[var(--text-muted)] hidden xl:block">Theme</span>
              </button>
              {showThemePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemePicker(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50 p-2">
                  <div className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider px-2 py-1 mb-1">Interface Theme</div>
                  {UI_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => { setTheme(theme.id); setShowThemePicker(false); }}
                      className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${
                        activeTheme === theme.id
                          ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex gap-0.5">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.bg, border: '1px solid rgba(255,255,255,0.1)' }} />
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                      </div>
                      <div>
                        <div className="text-xs font-medium">{theme.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{theme.description}</div>
                      </div>
                      {activeTheme === theme.id && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                      )}
                    </button>
                  ))}
                </div>
                </>
              )}
            </div>

            {/* Account Button */}
            <Link
              href="/account"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-light)] hover:bg-[var(--surface)] transition-all"
            >
              <div className="w-6 h-6 rounded-full bg-[var(--primary-dark)] flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">S</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)] hidden xl:block">{t('nav.account')}</span>
            </Link>
          </div>
        </div>
      </nav>
      )}

      {/* Mobile Navigation Drawer */}
      {!isLandingPage && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 sm:hidden"
            style={{
              opacity: showMobileMenu ? 1 : 0,
              pointerEvents: showMobileMenu ? 'auto' : 'none',
              transition: 'opacity 0.2s ease',
            }}
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer */}
          <div
            className="fixed top-14 left-0 bottom-0 w-64 z-40 border-r border-[var(--border)] overflow-y-auto sm:hidden"
            style={{
              backgroundColor: 'var(--surface)',
              transform: showMobileMenu ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <div className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const IconComponent = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMobileMenu(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
                      ${isActive
                        ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]'
                      }
                    `}
                  >
                    <span style={{ color: isActive ? item.color : 'currentColor' }}>
                      <IconComponent size={18} />
                    </span>
                    <span className="text-sm font-medium">{t(item.labelKey)}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-[var(--border)] p-3 mt-2">
              <Link
                href="/"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span className="text-sm font-medium">Home</span>
              </Link>
              <Link
                href="/account"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] transition-colors"
              >
                <div className="w-[18px] h-[18px] rounded-full bg-[var(--primary-dark)] flex items-center justify-center">
                  <span className="text-[8px] font-bold text-white">S</span>
                </div>
                <span className="text-sm font-medium">{t('nav.account')}</span>
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ============================================================
          MAIN CONTENT AREA
          ============================================================ */}
      <main className="flex-1 overflow-hidden bg-[var(--background)]">
        {/* Non-chart pages (normal Next.js routing) */}
        <div
          className="h-full overflow-auto animate-page-enter"
          style={{ display: isChartRoute ? 'none' : 'block' }}
        >
          {children}
        </div>

        {/* Keep-alive chart containers */}
        {CHART_ROUTES.map((route) => {
          if (!mounted.has(route)) return null;
          const ChartComponent = CHART_COMPONENTS[route];
          return (
            <div
              key={route}
              className="h-full"
              style={{ display: activeChart === route ? 'block' : 'none' }}
            >
              <ChartErrorBoundary fallbackTitle={`${route.slice(1)} chart error`}>
                <ChartComponent />
              </ChartErrorBoundary>
            </div>
          );
        })}
      </main>
    </div>
    </SessionProvider>
  );
}
