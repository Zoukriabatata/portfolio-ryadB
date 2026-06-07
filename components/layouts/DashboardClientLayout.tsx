'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import Logo from '@/components/ui/Logo';
import { LiveSignalBadge } from '@/components/ai/LiveSignalBadge';
import { useUIThemeStore, applyUITheme, UI_THEMES, type UIThemeId } from '@/stores/useUIThemeStore';
import { syncFootprintWithUITheme } from '@/stores/useFootprintSettingsStore';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { TranslationKey } from '@/lib/i18n/translations';
import {
  Layers,
  Compass,
  History,
  Palette,
  Check,
  Menu,
  X,
  Wifi,
  WifiOff,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import {
  DashboardIcon,
  LiveIcon,
  FootprintIcon,
  GexIcon,
  VolatilityIcon,
  FlowIcon,
  TradingIcon,
  JournalIcon,
  NewsIcon,
  AiIcon,
  AcademyIcon,
  DataFeedsIcon,
  AccountIcon,
} from '@/components/ui/nav-icons';

import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import FeatureTour from '@/components/ui/FeatureTour';
import { PageActiveProvider } from '@/hooks/usePageActive';
import { useAutoTrackTrades } from '@/hooks/useAutoTrackTrades';
import { hydrateStores } from '@/lib/hydrate-stores';

// ============================================================
// KEEP-ALIVE CHART COMPONENTS
// These are loaded once and stay mounted across navigation.
// Only `display` toggles — no unmount/remount, no data loss.
// ============================================================

const CHART_ROUTES = ['/live', '/footprint', '/gex', '/volatility', '/flow'] as const;
type ChartRoute = typeof CHART_ROUTES[number];

// Routes marketing publiques : on y masque la topbar applicative ; la page
// rend son propre chrome de marque via <MarketingShell> (LandingNav/Footer).
const MARKETING_ROUTES = ['/pricing', '/download', '/contact', '/upgrade', '/legal'];

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
const GEXPageContent = dynamic(() => import('@/components/pages/GEXPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="GEX" />,
});
const VolatilityPageContent = dynamic(() => import('@/components/pages/VolatilityPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Volatility" />,
});
// /bias + /heatmap pages were retired — the dynamic imports are
// removed alongside their nav entries above.
const FlowPageContent = dynamic(() => import('@/components/pages/FlowPageContent'), {
  ssr: false,
  loading: () => <ChartLoadingFallback label="Options Flow" />,
});

const CHART_COMPONENTS: Record<ChartRoute, React.ComponentType> = {
  '/live': LivePageContent,
  '/footprint': FootprintPageContent,
  '/gex': GEXPageContent,
  '/volatility': VolatilityPageContent,
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
  requiresUltra?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Charts',
    items: [
      { href: '/live', labelKey: 'nav.live', Icon: LiveIcon, shortcut: '1' },
      { href: '/footprint', labelKey: 'nav.footprint', Icon: FootprintIcon, shortcut: '2', requiresUltra: true },
      // /heatmap retired: the page is futures-DOM material we deliver
      // via the desktop app; keeping a web stub was confusing users.
    ],
  },
  {
    label: 'Analytics',
    items: [
      { href: '/gex',        labelKey: 'nav.gex',        Icon: GexIcon,         shortcut: '4', requiresUltra: true },
      { href: '/volatility', labelKey: 'nav.volatility', Icon: VolatilityIcon,    shortcut: '5', requiresUltra: true },
      // /bias (GVS Bias) retired alongside /replay — the underlying
      // futures-flavoured page wasn't earning its keep in the nav.
      { href: '/flow',       labelKey: 'nav.flow',       Icon: FlowIcon,  shortcut: '' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/trading', labelKey: 'nav.trading', Icon: TradingIcon,         shortcut: '' },
      // /replay retired (see above).
      { href: '/journal', labelKey: 'nav.journal', Icon: JournalIcon, shortcut: '8', requiresUltra: true },
      { href: '/news',    labelKey: 'nav.news',    Icon: NewsIcon,       shortcut: '7', requiresUltra: true },
      { href: '/ai',      labelKey: 'nav.ai',      Icon: AiIcon,   shortcut: '' },
    ],
  },
  {
    label: 'Research',
    items: [
      { href: '/academy', labelKey: 'nav.academy', Icon: AcademyIcon, shortcut: '' },
    ],
  },
];

// Flat list for keyboard shortcuts and route matching
// Includes boutique (Data Feeds) even though it's displayed on the right side
const ALL_NAV_ITEMS = [
  ...NAV_GROUPS.flatMap(g => g.items),
  { href: '/boutique', labelKey: 'nav.dataFeeds' as const, Icon: DataFeedsIcon, shortcut: '0' },
];


// ============================================================
// USER AVATAR — reads live session so it updates after upload
// Must be rendered inside <SessionProvider>
// ============================================================
function NavUserAvatar() {
  const { data: session } = useSession();
  const avatarUrl = session?.user?.image;

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt="Account"
        width={22}
        height={22}
        className="rounded-full object-cover"
        unoptimized
      />
    );
  }

  return <AccountIcon size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />;
}

export function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isLandingPage = pathname === '/';
  const isMarketingRoute = MARKETING_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
  // Le chrome applicatif (topbar, drawer, tab-bar, raccourcis) est masqué sur
  // la landing ET sur les pages marketing publiques.
  const hideAppChrome = isLandingPage || isMarketingRoute;
  const { activeTheme, setTheme } = useUIThemeStore();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { t } = useTranslation();
  const { data: navSession } = useSession();
  const isFreeUser = !navSession?.user?.tier || navSession.user.tier === 'FREE';

  // Auto-track closed trades to journal
  useAutoTrackTrades();

  // Swipe right from left edge to open menu, swipe left to close
  useEffect(() => {
    if (hideAppChrome) return;
    let touchStartX = 0;
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll, ignore
      // Swipe right from left edge → open menu
      if (dx > 60 && touchStartX < 30 && !showMobileMenu) {
        setShowMobileMenu(true);
      }
      // Swipe left → close menu
      if (dx < -60 && showMobileMenu) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [hideAppChrome, showMobileMenu]);

  // Lazy-hydrate non-critical persisted stores after first paint
  useEffect(() => {
    hydrateStores();
  }, []);

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
    if (hideAppChrome) return;

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
  }, [hideAppChrome, router]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!showMobileMenu) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMobileMenu(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showMobileMenu]);

  return (
      <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--background)] text-[var(--text-primary)]">
      {/* Skip Link for keyboard navigation */}
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* Route Progress Bar */}
      {progressState !== 'idle' && (
        <div className={`route-progress ${progressState}`} />
      )}

      {/* Offline Banner */}
      {isOffline && !hideAppChrome && (
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
      {!hideAppChrome && (
      <nav
        className="flex-shrink-0 border-b border-[var(--border)] relative z-50"
        style={{ height: 'var(--nav-height)', background: 'var(--background)', contain: 'layout style' }}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="h-full px-4 flex items-center gap-0">

          {/* Hamburger — opens on hover (desktop) or click (mobile) */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            onMouseEnter={() => { if (window.innerWidth >= 768) setShowMobileMenu(true); }}
            className="btn-icon mr-2"
            aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <X size={15} strokeWidth={1.5} /> : <Menu size={15} strokeWidth={1.5} />}
          </button>

          {/* Logo — click to go home */}
          <Link href="/"
            className="flex items-center gap-2 flex-shrink-0 select-none"
            aria-label="Home"
          >
            <Logo size="sm" showText animated={false} />
          </Link>

          {/* Active page breadcrumb */}
          {activeChart && (
            <span className="ml-3 text-[11px] font-mono hidden sm:block"
              style={{ color: 'var(--text-dimmed)' }}>
              / {activeChart.slice(1)}
            </span>
          )}

          {/* Right controls */}
          <div className="flex items-center gap-1 ml-auto">

            {/* Live indicator — minimal dot only */}
            <div className="flex items-center gap-1.5 px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--bull)]" />
              <span className="hidden md:inline text-[10px] font-medium tracking-wide"
                style={{ color: 'var(--bull)' }}>
                Live
              </span>
            </div>

            {/* AI signal badge */}
            <LiveSignalBadge />

            {/* Data Feeds */}
            <Link
              href="/boutique"
              className={`btn-icon w-auto px-2 gap-1.5 text-[11px] font-medium ${
                isNavActive('/boutique') ? '!text-[var(--text-primary)]' : ''
              }`}
              title="Data Feeds (Alt+0)"
            >
              <DataFeedsIcon size={13} strokeWidth={1.5} />
              <span className="hidden md:inline">{t('nav.dataFeeds')}</span>
            </Link>

            {/* Theme picker */}
            <div className="relative">
              <button
                onClick={() => setShowThemePicker(!showThemePicker)}
                className="btn-icon"
                title="Change theme (Ctrl+T)"
                aria-label="Change theme"
                aria-expanded={showThemePicker}
              >
                <Palette size={14} strokeWidth={1.5} />
              </button>
              {showThemePicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowThemePicker(false)} />
                  <div className="absolute right-0 top-full mt-1 w-48 z-50 rounded-lg border
                                  border-[var(--border)] shadow-xl overflow-hidden"
                    style={{ background: 'var(--surface)' }}>
                    <div className="px-3 py-2 border-b border-[var(--border)]">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                        Theme
                      </span>
                    </div>
                    <div className="p-1">
                      {UI_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => {
                            setTheme(theme.id);
                            syncFootprintWithUITheme(theme.id);
                            setShowThemePicker(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left
                                      transition-colors duration-100 ${
                            activeTheme === theme.id
                              ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <div className="flex gap-0.5">
                            {[theme.preview.bg, theme.preview.primary, theme.preview.accent].map((c, i) => (
                              <div key={i} className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                            ))}
                          </div>
                          <span className="text-[11px] font-medium flex-1">{theme.name}</span>
                          {activeTheme === theme.id && (
                            <Check size={11} className="text-[var(--primary)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Account */}
            <Link
              href="/account"
              className="btn-icon overflow-hidden"
              aria-label="Account settings"
            >
              <NavUserAvatar />
            </Link>
          </div>
        </div>
      </nav>
      )}

      {/* Mobile Navigation Drawer */}
      {!hideAppChrome && showMobileMenu && (
        <>
          {/* Backdrop — tap to close */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[59]"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer — closes when mouse leaves */}
          <div
            className="nav-drawer fixed top-0 left-0 bottom-0 w-[85vw] max-w-[280px] z-[60] flex flex-col"
            style={{ animation: 'slideInLeft 0.22s cubic-bezier(0.22, 1, 0.36, 1)' }}
            onMouseLeave={() => { if (window.innerWidth >= 768) setShowMobileMenu(false); }}
            role="menu"
            aria-label="Mobile navigation"
          >
            {/* Drawer Header */}
            <div className="nav-drawer-header flex items-center justify-between px-4 py-3 flex-shrink-0">
              <Logo size="sm" showText animated={false} />
              <button
                onClick={() => setShowMobileMenu(false)}
                className="nav-close w-8 h-8 flex items-center justify-center rounded-lg"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            {/* Live status strip */}
            <div className="nav-live-strip flex items-center gap-2 px-4 py-2.5 flex-shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--primary)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--primary)', boxShadow: '0 0 6px rgb(var(--primary-rgb) / 0.8)' }} />
              </span>
              <span className="nav-live-label">Markets live</span>
            </div>

            {/* Nav groups */}
            <div className="flex-1 overflow-y-auto py-2">
              {/* Dashboard */}
              <Link
                href="/dashboard"
                onClick={() => setShowMobileMenu(false)}
                className={`nav-item${isNavActive('/dashboard') ? ' active' : ''}`}
              >
                <span className="nav-item-icon"><DashboardIcon size={15} strokeWidth={1.75} /></span>
                <span className="nav-item-label">Dashboard</span>
              </Link>

              <div className="nav-divider" />

              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-1">
                  <div className="nav-section">{group.label}</div>
                  {group.items.map((item) => {
                    const active = isNavActive(item.href);
                    const locked = Boolean(isFreeUser && item.requiresUltra);
                    const IconComp = item.Icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setShowMobileMenu(false)}
                        className={`nav-item${active ? ' active' : ''}${locked ? ' locked' : ''}`}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                      >
                        <span className="nav-item-icon"><IconComp size={15} strokeWidth={1.75} /></span>
                        <span className="nav-item-label">{t(item.labelKey)}</span>
                        {locked ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="nav-lock">
                            <rect x="3" y="11" width="18" height="11" rx="2" />
                            <path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                        ) : item.shortcut ? (
                          <span className="nav-shortcut">Alt+{item.shortcut}</span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Bottom section */}
            <div className="nav-drawer-footer flex-shrink-0 p-2">
              <Link
                href="/boutique"
                onClick={() => setShowMobileMenu(false)}
                className={`nav-item${isNavActive('/boutique') ? ' active' : ''}`}
              >
                <span className="nav-item-icon"><DataFeedsIcon size={15} strokeWidth={1.75} /></span>
                <span className="nav-item-label">{t('nav.dataFeeds')}</span>
              </Link>
              <Link
                href="/account"
                onClick={() => setShowMobileMenu(false)}
                className={`nav-item${isNavActive('/account') ? ' active' : ''}`}
              >
                <span className="nav-item-icon" style={{ overflow: 'hidden' }}>
                  <NavUserAvatar />
                </span>
                <span className="nav-item-label">{t('nav.account')}</span>
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
              data-chart-inactive={!isActive ? '' : undefined}
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

      {/* ============================================================
          MOBILE BOTTOM TAB BAR — Quick navigation without hamburger
          Visible on mobile only (< 768px), hidden on desktop
          ============================================================ */}
      {!hideAppChrome && (
        <nav
          className="flex-shrink-0 md:hidden border-t safe-area-bottom"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          aria-label="Quick navigation"
        >
          <div className="flex items-stretch justify-around h-12">
            {([
              { href: '/live', icon: LiveIcon, label: 'Live' },
              { href: '/footprint', icon: FootprintIcon, label: 'Footprint' },
              { href: '/gex', icon: GexIcon, label: 'GEX' },
              { href: '/volatility', icon: VolatilityIcon, label: 'Vol' },
            ] as const).map((tab) => {
              const active = isNavActive(tab.href);
              const TabIcon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors"
                  style={{ color: active ? 'var(--primary)' : 'var(--text-dimmed)' }}
                >
                  <TabIcon size={18} strokeWidth={active ? 2 : 1.5} />
                  <span className="text-[9px] font-medium leading-none">{tab.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setShowMobileMenu(true)}
              className="flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors"
              style={{ color: showMobileMenu ? 'var(--primary)' : 'var(--text-dimmed)' }}
              aria-label="More navigation options"
            >
              <Menu size={18} strokeWidth={1.5} />
              <span className="text-[9px] font-medium leading-none">More</span>
            </button>
          </div>
        </nav>
      )}

      {/* Feature Tour — shows once for new users */}
      {!hideAppChrome && <FeatureTour />}
    </div>
  );
}
