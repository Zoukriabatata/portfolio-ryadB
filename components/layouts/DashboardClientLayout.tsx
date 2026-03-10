'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider } from 'next-auth/react';
import Logo from '@/components/ui/Logo';
import { useUIThemeStore, applyUITheme, UI_THEMES, type UIThemeId } from '@/stores/useUIThemeStore';
import { syncFootprintWithUITheme } from '@/stores/useFootprintSettingsStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { TranslationKey } from '@/lib/i18n/translations';
import {
  Activity,
  Grid3x3,
  Layers,
  Zap,
  Compass,
  Newspaper,
  History,
  Store,
  User,
  Home,
  Palette,
  Check,
  Menu,
  X,
  Wifi,
  WifiOff,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

// Custom Candlestick icon (not available in Lucide)
const CandlestickIcon: LucideIcon = Object.assign(
  ({ size = 24, strokeWidth = 1.5, className, ...props }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" className={className} {...props}>
      <line x1="9" y1="3" x2="9" y2="21" />
      <rect x="6" y="7" width="6" height="8" rx="1" fill="currentColor" opacity="0.2" />
      <line x1="17" y1="5" x2="17" y2="19" />
      <rect x="14" y="9" width="6" height="5" rx="1" fill="currentColor" opacity="0.2" />
    </svg>
  ),
  { displayName: 'CandlestickIcon' }
) as unknown as LucideIcon;

// Custom NotebookPen icon (journal)
const NotebookPenIcon: LucideIcon = Object.assign(
  ({ size = 24, strokeWidth = 1.5, className, ...props }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M6 4h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <line x1="8" y1="9" x2="14" y2="9" />
      <line x1="8" y1="13" x2="12" y2="13" />
      <path d="M16 3v4" />
      <path d="M19 14l-3 3-1.5-1.5" />
    </svg>
  ),
  { displayName: 'NotebookPenIcon' }
) as unknown as LucideIcon;
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import FeatureTour from '@/components/ui/FeatureTour';
import { PageActiveProvider } from '@/hooks/usePageActive';
import { useAutoTrackTrades } from '@/hooks/useAutoTrackTrades';

// ============================================================
// KEEP-ALIVE CHART COMPONENTS
// These are loaded once and stay mounted across navigation.
// Only `display` toggles — no unmount/remount, no data loss.
// ============================================================

const CHART_ROUTES = ['/live', '/footprint', '/liquidity', '/gex', '/volatility', '/bias', '/flow'] as const;
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
const FlowPageContent = dynamic(() => import('@/components/pages/FlowPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Options Flow" />,
});

const CHART_COMPONENTS: Record<ChartRoute, React.ComponentType> = {
  '/live': LivePageContent,
  '/footprint': FootprintPageContent,
  '/liquidity': LiquidityPageContent,
  '/gex': GEXPageContent,
  '/volatility': VolatilityPageContent,
  '/bias': BiasPageContent,
  '/flow': FlowPageContent,
};

// ============================================================
// NAVIGATION CONFIG — Grouped hierarchy
// ============================================================

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  Icon: LucideIcon;
  shortcut: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Charts',
    items: [
      { href: '/live', labelKey: 'nav.live', Icon: CandlestickIcon, shortcut: '1' },
      { href: '/footprint', labelKey: 'nav.footprint', Icon: Grid3x3, shortcut: '2' },
      { href: '/liquidity', labelKey: 'nav.liquidity', Icon: Layers, shortcut: '3' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { href: '/gex',        labelKey: 'nav.gex',        Icon: Zap,         shortcut: '4' },
      { href: '/volatility', labelKey: 'nav.volatility', Icon: Activity,    shortcut: '5' },
      { href: '/bias',       labelKey: 'nav.bias',       Icon: Compass,     shortcut: '6' },
      { href: '/flow',       labelKey: 'nav.flow',       Icon: TrendingUp,  shortcut: '' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/replay', labelKey: 'nav.replay', Icon: History, shortcut: '9' },
      { href: '/journal', labelKey: 'nav.journal', Icon: NotebookPenIcon, shortcut: '8' },
      { href: '/news', labelKey: 'nav.news', Icon: Newspaper, shortcut: '7' },
    ],
  },
  {
    label: 'Market',
    items: [
      { href: '/boutique', labelKey: 'nav.dataFeeds', Icon: Store, shortcut: '0' },
    ],
  },
];

// Flat list for keyboard shortcuts and route matching
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);


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

  // Auto-track closed trades to journal
  useAutoTrackTrades();

  // Apply UI theme on mount and changes — sync footprint canvas colors too
  useEffect(() => {
    applyUITheme(activeTheme);
    syncFootprintWithUITheme(activeTheme);
  }, [activeTheme]);

  // Listen for OS dark/light preference changes (for auto mode)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      useUIThemeStore.getState()._applySystemPreference(e.matches);
    };
    // Set initial value if autoMode was already on
    useUIThemeStore.getState()._applySystemPreference(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Pause everything when browser tab is hidden (minimized, switched tab)
  const [tabHidden, setTabHidden] = useState(false);
  useEffect(() => {
    const onVisibilityChange = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Offline detection
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    // Check initial state
    if (!navigator.onLine) setIsOffline(true);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Route progress bar — tracks pathname changes + scroll to top
  const [progressState, setProgressState] = useState<'idle' | 'loading' | 'done'>('idle');
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      setProgressState('loading');
      // Scroll non-chart pages to top on route change
      const mainEl = document.getElementById('main-content');
      if (mainEl) mainEl.scrollTop = 0;
      const timer = setTimeout(() => {
        setProgressState('done');
        const hideTimer = setTimeout(() => setProgressState('idle'), 350);
        return () => clearTimeout(hideTimer);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pathname]);

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

  // Track chart route key for fade animation
  const [chartKey, setChartKey] = useState(0);
  const prevChartRef = useRef(activeChart);
  useEffect(() => {
    if (activeChart && activeChart !== prevChartRef.current) {
      setChartKey(k => k + 1);
    }
    prevChartRef.current = activeChart;
  }, [activeChart]);

  // ============================================================
  // ACTIVE NAV ITEM CHECK
  // ============================================================
  const isNavActive = useCallback((href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  }, [pathname]);

  // ============================================================
  // KEYBOARD SHORTCUTS — Alt+1 to Alt+0
  // ============================================================
  useEffect(() => {
    if (isLandingPage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const item = ALL_NAV_ITEMS.find(n => n.shortcut === e.key);
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

      {/* Route Progress Bar */}
      {progressState !== 'idle' && (
        <div className={`route-progress ${progressState}`} />
      )}

      {/* Offline Banner */}
      {isOffline && !isLandingPage && (
        <div
          className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171',
          }}
        >
          <WifiOff size={13} strokeWidth={1.5} />
          You&apos;re offline — some features may not work
        </div>
      )}

      {/* ============================================================
          TOPBAR NAVIGATION (hidden on landing page)
          ============================================================ */}
      {!isLandingPage && (
      <nav
        className="h-12 flex-shrink-0 border-b border-[var(--border)] bg-[var(--background)] relative z-50"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="h-full px-3 flex items-center">
          {/* Hamburger - mobile only */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--surface)] transition-colors sm:hidden mr-2"
            aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <X size={16} /> : <Menu size={16} />}
          </button>

          {/* Logo — compact */}
          <Link href="/" className="flex-shrink-0 mr-4" aria-label="Home">
            <Logo size="sm" showText={false} animated={true} />
          </Link>

          {/* Grouped Navigation — hidden on mobile */}
          <div className="hidden sm:flex items-center flex-1 h-full">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.label} className="flex items-center h-full">
                {/* Group divider */}
                {gi > 0 && (
                  <div className="w-px h-5 bg-[var(--border)] mx-1.5" />
                )}

                {/* Group items */}
                {group.items.map((item) => {
                  const active = isNavActive(item.href);
                  const IconComp = item.Icon;
                  const label = t(item.labelKey);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`
                        relative flex items-center gap-1.5 px-2.5 h-full text-xs font-medium transition-colors duration-150
                        ${active
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)]/50'
                        }
                      `}
                      title={`${label} (Alt+${item.shortcut})`}
                      aria-label={`${label} — Alt+${item.shortcut}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <IconComp
                        size={16}
                        strokeWidth={1.5}
                        className={`flex-shrink-0 transition-colors duration-150 ${active ? 'text-[var(--primary)]' : ''}`}
                      />
                      <span className="hidden lg:inline">{label}</span>

                      {/* Active indicator — bottom accent line */}
                      {active && (
                        <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--primary)]" />
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Right Side — Status, Theme, Account */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Live Status */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--surface)]/60 border border-[var(--border)]">
              <div className="relative flex items-center justify-center w-2 h-2">
                <div className="absolute w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              <span className="text-[10px] font-semibold text-emerald-500 tracking-wide hidden md:inline">Live</span>
            </div>

            {/* Theme Picker */}
            <div className="relative">
              <button
                onClick={() => setShowThemePicker(!showThemePicker)}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[var(--surface)] transition-colors"
                title="Change theme"
                aria-label="Change theme"
                aria-expanded={showThemePicker}
              >
                <Palette size={16} strokeWidth={1.5} className="text-[var(--text-muted)]" />
              </button>
              {showThemePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemePicker(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 z-50 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl">
                    <div className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider px-2 py-1 mb-0.5">
                      Theme
                    </div>
                    {UI_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => { setTheme(theme.id); syncFootprintWithUITheme(theme.id); setShowThemePicker(false); }}
                        className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors duration-100 ${
                          activeTheme === theme.id
                            ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex gap-0.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.preview.bg, border: '1px solid rgba(255,255,255,0.1)' }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
                        </div>
                        <span className="text-[11px] font-medium flex-1">{theme.name}</span>
                        {activeTheme === theme.id && (
                          <Check size={12} className="text-[var(--primary)] flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Account */}
            <Link
              href="/account"
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-[var(--surface)] transition-colors"
              aria-label="Account settings"
            >
              <User size={16} strokeWidth={1.5} className="text-[var(--text-muted)]" />
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
            aria-hidden="true"
            className="fixed inset-0 z-40 sm:hidden"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--background) 70%, transparent)',
              backdropFilter: showMobileMenu ? 'blur(4px)' : 'blur(0px)',
              WebkitBackdropFilter: showMobileMenu ? 'blur(4px)' : 'blur(0px)',
              opacity: showMobileMenu ? 1 : 0,
              pointerEvents: showMobileMenu ? 'auto' : 'none',
              transition: 'opacity 0.2s ease, backdrop-filter 0.2s ease',
            }}
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer — grouped */}
          <div
            className="fixed top-12 left-0 bottom-0 w-[220px] z-40 border-r border-[var(--border)] overflow-y-auto sm:hidden custom-scrollbar"
            style={{
              backgroundColor: 'var(--background)',
              transform: showMobileMenu ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            role="menu"
            aria-label="Mobile navigation"
          >
            <div className="p-2">
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {/* Group label */}
                  <div className="text-[10px] font-semibold text-[var(--text-dimmed)] uppercase tracking-wider px-3 pt-3 pb-1">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const active = isNavActive(item.href);
                    const IconComp = item.Icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setShowMobileMenu(false)}
                        className={`
                          flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-100
                          ${active
                            ? 'bg-[var(--surface)] text-[var(--text-primary)]'
                            : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)]'
                          }
                        `}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                      >
                        <IconComp
                          size={16}
                          strokeWidth={1.5}
                          className={active ? 'text-[var(--primary)]' : ''}
                        />
                        <span className="text-[13px] font-medium flex-1">{t(item.labelKey)}</span>
                        <span className="text-[9px] text-[var(--text-dimmed)] font-mono">
                          Alt+{item.shortcut}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Bottom — Home & Account */}
            <div className="border-t border-[var(--border)] p-2 mt-1">
              <Link
                href="/"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)] transition-colors"
                role="menuitem"
              >
                <Home size={16} strokeWidth={1.5} />
                <span className="text-[13px] font-medium">Home</span>
              </Link>
              <Link
                href="/account"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-secondary)] transition-colors"
                role="menuitem"
              >
                <User size={16} strokeWidth={1.5} />
                <span className="text-[13px] font-medium">{t('nav.account')}</span>
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
          key={isChartRoute ? 'hidden' : pathname}
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
              key={`${route}-${chartKey}`}
              className={`h-full ${isActive ? 'chart-route-enter' : ''}`}
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

      {/* Feature Tour — shows once for new users */}
      {!isLandingPage && <FeatureTour />}
    </div>
    </SessionProvider>
  );
}
