'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
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
import { PageActiveProvider } from '@/hooks/usePageActive';

// ============================================================
// KEEP-ALIVE CHART COMPONENTS
// These are loaded once and stay mounted across navigation.
// Only `display` toggles — no unmount/remount, no data loss.
// ============================================================

const CHART_ROUTES = ['/live', '/footprint', '/liquidity', '/gex', '/volatility', '/bias'] as const;
type ChartRoute = typeof CHART_ROUTES[number];

function ChartLoadingFallback({ label }: { label: string }) {
  return (
    <div className="w-full h-full bg-[var(--background)] flex items-center justify-center skeleton-chart">
      <div className="flex flex-col items-center gap-6 animate-fadeIn">
        {/* Skeleton chart preview */}
        <div className="w-64 space-y-2">
          <div className="flex items-center justify-between">
            <div className="skeleton-bar w-20 h-3" />
            <div className="skeleton-bar w-12 h-3" />
          </div>
          <div className="flex items-end gap-1 h-24">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-bar flex-1 rounded-sm"
                style={{
                  height: `${30 + Math.sin(i * 0.8) * 25 + Math.random() * 20}%`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
          <div className="flex justify-between">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-bar w-8 h-2" />
            ))}
          </div>
        </div>
        {/* Loading indicator */}
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[var(--text-muted)] text-xs font-medium tracking-wide">
            Loading {label}...
          </span>
        </div>
      </div>
    </div>
  );
}

const LivePageContent = dynamic(() => import('@/components/pages/LivePageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Live" />,
});
const FootprintPageContent = dynamic(() => import('@/components/pages/FootprintPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Footprint" />,
});
const LiquidityPageContent = dynamic(() => import('@/components/pages/LiquidityPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Heatmap" />,
});
const GEXPageContent = dynamic(() => import('@/components/pages/GEXPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="GEX" />,
});
const VolatilityPageContent = dynamic(() => import('@/components/pages/VolatilityPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Volatility" />,
});
const BiasPageContent = dynamic(() => import('@/components/pages/BiasPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Bias" />,
});

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
  shortcut: string;
}> = [
  { href: '/live', labelKey: 'nav.live', Icon: LiveIcon, color: '#10b981', shortcut: '1' },
  { href: '/footprint', labelKey: 'nav.footprint', Icon: FootprintIcon, color: '#14b8a6', shortcut: '2' },
  { href: '/liquidity', labelKey: 'nav.liquidity', Icon: HeatmapIcon, color: '#06b6d4', shortcut: '3' },
  { href: '/gex', labelKey: 'nav.gex', Icon: GexIcon, color: '#22d3ee', shortcut: '4' },
  { href: '/volatility', labelKey: 'nav.volatility', Icon: VolatilityIcon, color: '#0ea5e9', shortcut: '5' },
  { href: '/bias', labelKey: 'nav.bias', Icon: BiasIcon, color: '#f59e0b', shortcut: '6' },
  { href: '/news', labelKey: 'nav.news', Icon: NewsIcon, color: '#84cc16', shortcut: '7' },
  { href: '/journal', labelKey: 'nav.journal', Icon: JournalIcon, color: '#f59e0b', shortcut: '8' },
  { href: '/replay', labelKey: 'nav.replay', Icon: ReplayIcon, color: '#8b5cf6', shortcut: '9' },
  { href: '/boutique', labelKey: 'nav.dataFeeds', Icon: DataFeedIcon, color: '#fbbf24', shortcut: '0' },
];

// ============================================================
// HELPER: hex to rgba
// ============================================================
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLandingPage = pathname === '/';
  const { activeTheme, setTheme } = useUIThemeStore();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { t } = useTranslation();

  // Refs for sliding pill indicator
  const navContainerRef = useRef<HTMLDivElement>(null);
  const navItemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
    color: string;
  } | null>(null);

  // Apply UI theme on mount and changes
  useEffect(() => {
    applyUITheme(activeTheme);
  }, [activeTheme]);

  // Pause everything when browser tab is hidden (minimized, switched tab)
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onVisibilityChange = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

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

  // ============================================================
  // SLIDING PILL INDICATOR — measure active nav item position
  // ============================================================
  const updateIndicator = useCallback(() => {
    const container = navContainerRef.current;
    if (!container) return;

    const activeItem = NAV_ITEMS.find(
      item => pathname === item.href || pathname.startsWith(item.href + '/')
    );
    if (!activeItem) {
      setIndicatorStyle(null);
      return;
    }

    const el = navItemRefs.current.get(activeItem.href);
    if (!el) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();

    setIndicatorStyle({
      left: itemRect.left - containerRect.left + container.scrollLeft,
      width: itemRect.width,
      color: activeItem.color,
    });
  }, [pathname]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  // ============================================================
  // KEYBOARD SHORTCUTS — Alt+1 to Alt+0
  // ============================================================
  useEffect(() => {
    if (isLandingPage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const item = NAV_ITEMS.find(n => n.shortcut === e.key);
      if (item) {
        e.preventDefault();
        router.push(item.href);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLandingPage, router]);

  // ============================================================
  // AUTO-CLOSE MOBILE DRAWER on resize to desktop
  // ============================================================
  useEffect(() => {
    if (!showMobileMenu) return;
    const handleResize = () => {
      if (window.innerWidth >= 640) setShowMobileMenu(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showMobileMenu]);

  return (
    <SessionProvider>
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      {/* Skip Link for keyboard navigation */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ============================================================
          TOPBAR NAVIGATION (hidden on landing page)
          ============================================================ */}
      {!isLandingPage && (
      <nav
        className="h-14 flex-shrink-0 glass border-b border-[var(--border)] relative z-50"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="h-full px-3 md:px-4 flex items-center gap-3 md:gap-6">
          {/* Hamburger - mobile only */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--surface)] transition-colors sm:hidden btn-elevate"
            aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            aria-expanded={showMobileMenu}
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
          <Link href="/" className="flex-shrink-0" aria-label="Home">
            <Logo size="md" showText={true} animated={true} />
          </Link>

          {/* Navigation Pills — hidden on mobile (drawer instead), icon-only on tablet, full on desktop */}
          <div
            ref={navContainerRef}
            className="hidden sm:flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none relative"
          >
            {/* Sliding pill indicator */}
            {indicatorStyle && (
              <div
                className="nav-sliding-indicator nav-pill-glow"
                style={{
                  left: indicatorStyle.left,
                  width: indicatorStyle.width,
                  opacity: 1,
                  '--nav-glow-bg': hexToRgba(indicatorStyle.color, 0.1),
                  '--nav-glow-color': hexToRgba(indicatorStyle.color, 0.2),
                  '--nav-glow-border': hexToRgba(indicatorStyle.color, 0.25),
                } as React.CSSProperties}
              />
            )}

            {NAV_ITEMS.map((item, index) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const IconComponent = item.Icon;
              const label = t(item.labelKey);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={(el) => {
                    if (el) navItemRefs.current.set(item.href, el);
                  }}
                  className={`
                    nav-pill group relative px-2.5 lg:px-3 py-2 rounded-lg flex items-center gap-2
                    flex-shrink-0 z-10
                    ${isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }
                  `}
                  data-tooltip={`${label} (Alt+${item.shortcut})`}
                  data-tooltip-pos="bottom"
                  aria-label={`${label} — Alt+${item.shortcut}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span
                    className={`transition-all duration-200 ${isActive ? 'scale-110 drop-shadow-sm' : 'group-hover:scale-105'}`}
                    style={{
                      color: isActive ? item.color : 'currentColor',
                      filter: isActive ? `drop-shadow(0 0 4px ${hexToRgba(item.color, 0.4)})` : 'none',
                      transition: 'color 0.2s ease, filter 0.3s ease, transform 0.2s ease',
                    }}
                  >
                    <IconComponent size={16} />
                  </span>

                  <span className={`text-xs font-medium hidden lg:inline transition-colors duration-200 ${isActive ? 'text-[var(--text-primary)]' : ''}`}>
                    {label}
                  </span>

                  {/* Active underline bar */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full animate-scaleIn"
                      style={{
                        backgroundColor: item.color,
                        width: '60%',
                        boxShadow: `0 0 8px ${hexToRgba(item.color, 0.5)}`,
                      }}
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
              className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors hidden md:block btn-elevate px-2 py-1 rounded-md"
              aria-label="Go to homepage"
            >
              Home
            </Link>

            {/* Live Status — Animated pulse */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[var(--surface)] rounded-lg border border-[var(--border)] btn-elevate">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-[#10b981] live-dot" />
              </div>
              <span className="text-[11px] font-semibold text-[var(--primary)] tracking-wide">Live</span>
            </div>

            {/* Theme Picker */}
            <div className="relative">
              <button
                onClick={() => setShowThemePicker(!showThemePicker)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-light)] hover:bg-[var(--surface)] btn-elevate"
                title="Change theme (Ctrl+T)"
                aria-label="Change theme"
                aria-expanded={showThemePicker}
              >
                <div
                  className="w-4 h-4 rounded-full border border-[var(--border-light)]"
                  style={{ background: `linear-gradient(135deg, var(--primary), var(--accent))` }}
                />
                <span className="text-[10px] text-[var(--text-muted)] hidden xl:block">Theme</span>
              </button>
              {showThemePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemePicker(false)} />
                  <div className="dropdown-menu animate-dropdown-in absolute right-0 top-full mt-2 w-56 z-50 p-2">
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2 py-1.5 mb-1">
                      Interface Theme
                    </div>
                    {UI_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => { setTheme(theme.id); setShowThemePicker(false); }}
                        className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${
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
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium">{theme.name}</div>
                          <div className="text-[10px] text-[var(--text-muted)] truncate">{theme.description}</div>
                        </div>
                        {activeTheme === theme.id && (
                          <svg className="ml-auto w-3.5 h-3.5 text-[var(--primary)] flex-shrink-0 animate-scaleIn" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 8 7 12 13 4" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Account Button — Gradient avatar */}
            <Link
              href="/account"
              className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-light)] btn-elevate"
              aria-label="Account settings"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center transition-shadow duration-300 group-hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))' }}
              >
                <span className="text-[10px] font-bold text-white">S</span>
              </div>
              <span className="text-xs text-[var(--text-secondary)] hidden xl:block group-hover:text-[var(--text-primary)] transition-colors">
                {t('nav.account')}
              </span>
            </Link>
          </div>
        </div>
      </nav>
      )}

      {/* Mobile Navigation Drawer */}
      {!isLandingPage && (
        <>
          {/* Backdrop — blur + fade */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 sm:hidden"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: showMobileMenu ? 'blur(4px)' : 'blur(0px)',
              WebkitBackdropFilter: showMobileMenu ? 'blur(4px)' : 'blur(0px)',
              opacity: showMobileMenu ? 1 : 0,
              pointerEvents: showMobileMenu ? 'auto' : 'none',
              transition: 'opacity 0.25s ease, backdrop-filter 0.3s ease',
            }}
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer */}
          <div
            className="fixed top-14 left-0 bottom-0 w-[220px] z-40 border-r border-[var(--border)] overflow-y-auto sm:hidden custom-scrollbar"
            style={{
              backgroundColor: 'var(--surface)',
              transform: showMobileMenu ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            role="menu"
            aria-label="Mobile navigation"
          >
            <div className="p-3 space-y-0.5">
              {NAV_ITEMS.map((item, index) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const IconComponent = item.Icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMobileMenu(false)}
                    className={`
                      flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-150
                      ${showMobileMenu ? 'drawer-item-enter' : ''}
                      ${isActive
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]'
                      }
                    `}
                    style={isActive ? {
                      backgroundColor: hexToRgba(item.color, 0.1),
                      borderLeft: `3px solid ${item.color}`,
                    } : undefined}
                    role="menuitem"
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span style={{ color: isActive ? item.color : 'currentColor' }}>
                      <IconComponent size={18} />
                    </span>
                    <span className="text-sm font-medium flex-1">{t(item.labelKey)}</span>
                    <span className="text-[9px] text-[var(--text-dimmed)] font-mono">
                      Alt+{item.shortcut}
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-[var(--border)] p-3 mt-2">
              <Link
                href="/"
                onClick={() => setShowMobileMenu(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] transition-colors ${showMobileMenu ? 'drawer-item-enter' : ''}`}
                role="menuitem"
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)] transition-colors ${showMobileMenu ? 'drawer-item-enter' : ''}`}
                role="menuitem"
              >
                <div
                  className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))' }}
                >
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
      <main id="main-content" className="flex-1 overflow-hidden bg-[var(--background)]">
        {/* Non-chart pages (normal Next.js routing) */}
        <div
          className="h-full overflow-auto animate-page-enter"
          style={{ display: isChartRoute ? 'none' : 'block' }}
        >
          <PageActiveProvider value={!tabHidden}>
            {children}
          </PageActiveProvider>
        </div>

        {/* Keep-alive chart containers */}
        {CHART_ROUTES.map((route) => {
          if (!mounted.has(route)) return null;
          const ChartComponent = CHART_COMPONENTS[route];
          const isActive = activeChart === route;
          return (
            <div
              key={route}
              className="h-full"
              style={{ display: isActive ? 'block' : 'none' }}
            >
              <PageActiveProvider value={isActive && !tabHidden}>
                <ChartErrorBoundary fallbackTitle={`${route.slice(1)} chart error`}>
                  <ChartComponent />
                </ChartErrorBoundary>
              </PageActiveProvider>
            </div>
          );
        })}
      </main>
    </div>
    </SessionProvider>
  );
}
