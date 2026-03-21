'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { SessionProvider, useSession } from 'next-auth/react';
import Image from 'next/image';
import Logo from '@/components/ui/Logo';
import { LiveSignalBadge } from '@/components/ai/LiveSignalBadge';
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
  BrainCircuit,
  ClipboardList,
  FileText,
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
import { hydrateStores } from '@/lib/hydrate-stores';

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
      { href: '/replay',  labelKey: 'nav.replay',  Icon: History,        shortcut: '9' },
      { href: '/journal', labelKey: 'nav.journal', Icon: NotebookPenIcon, shortcut: '8' },
      { href: '/news',    labelKey: 'nav.news',    Icon: Newspaper,       shortcut: '7' },
      { href: '/ai',                labelKey: 'nav.ai',     Icon: BrainCircuit,  shortcut: '' },
    ],
  },
  {
    label: 'Research',
    items: [
      { href: '/academy', labelKey: 'nav.academy', Icon: FileText, shortcut: '' },
    ],
  },
];

// Flat list for keyboard shortcuts and route matching
// Includes boutique (Data Feeds) even though it's displayed on the right side
const ALL_NAV_ITEMS = [
  ...NAV_GROUPS.flatMap(g => g.items),
  { href: '/boutique', labelKey: 'nav.dataFeeds' as const, Icon: Store, shortcut: '0' },
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

  return <User size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />;
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

  // Auto-track closed trades to journal
  useAutoTrackTrades();

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

  // Close drawer on Escape key
  useEffect(() => {
    if (!showMobileMenu) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMobileMenu(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
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
        className="flex-shrink-0 border-b border-[var(--border)] relative z-50"
        style={{ height: 'var(--nav-height)', background: 'var(--background)', contain: 'layout style' }}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="h-full px-4 flex items-center gap-0">

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
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
              <Store size={13} strokeWidth={1.5} />
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
      {!isLandingPage && showMobileMenu && (
        <>
          {/* Backdrop — tap to close */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[59]"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer */}
          <div
            className="fixed top-0 left-0 bottom-0 w-[85vw] max-w-[280px] z-[60] flex flex-col"
            style={{
              background: 'var(--surface)',
              borderRight: '1px solid var(--border-light)',
              boxShadow: '4px 0 32px rgba(0,0,0,0.6)',
              animation: 'slideInLeft 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            role="menu"
            aria-label="Mobile navigation"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <Logo size="sm" showText animated={false} />
              <button
                onClick={() => setShowMobileMenu(false)}
                className="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            {/* Live status strip */}
            <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--bull)', animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite' }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: 'var(--bull)' }} />
              </span>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Markets live
              </span>
            </div>

            {/* Nav groups */}
            <div className="flex-1 overflow-y-auto py-2">
              {/* Dashboard */}
              <Link
                href="/dashboard"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-colors duration-100 mb-1"
                style={{
                  background: isNavActive('/dashboard') ? 'var(--surface-elevated)' : 'transparent',
                  color: isNavActive('/dashboard') ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: isNavActive('/dashboard') ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              >
                <Home size={15} strokeWidth={1.5} style={{ color: isNavActive('/dashboard') ? 'var(--primary)' : 'inherit', flexShrink: 0 }} />
                <span className="text-[12px] font-medium">Dashboard</span>
              </Link>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 12px 4px' }} />

              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-1">
                  <div className="text-[9px] font-bold uppercase tracking-widest px-4 pt-3 pb-1"
                    style={{ color: 'var(--text-dimmed)' }}>
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
                        className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-colors duration-100"
                        style={{
                          background: active ? 'var(--surface-elevated)' : 'transparent',
                          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                          borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
                        }}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
                      >
                        <IconComp size={15} strokeWidth={1.5}
                          style={{ color: active ? 'var(--primary)' : 'inherit', flexShrink: 0 }} />
                        <span className="text-[12px] font-medium flex-1">{t(item.labelKey)}</span>
                        {item.shortcut && (
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded"
                            style={{ color: 'var(--text-dimmed)', background: 'var(--background)' }}>
                            Alt+{item.shortcut}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Bottom section */}
            <div className="flex-shrink-0 p-2" style={{ borderTop: '1px solid var(--border)' }}>
              <Link
                href="/boutique"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Store size={14} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span className="text-[12px] font-medium">{t('nav.dataFeeds')}</span>
              </Link>
              <Link
                href="/account"
                onClick={() => setShowMobileMenu(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="w-5 h-5 flex items-center justify-center overflow-hidden rounded-full flex-shrink-0"
                  style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
                  <NavUserAvatar />
                </span>
                <span className="text-[12px] font-medium">{t('nav.account')}</span>
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
      {!isLandingPage && (
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
              { href: '/live', icon: CandlestickIcon, label: 'Live' },
              { href: '/footprint', icon: Grid3x3, label: 'Footprint' },
              { href: '/liquidity', icon: Layers, label: 'Liquidity' },
              { href: '/gex', icon: Zap, label: 'GEX' },
              { href: '/volatility', icon: Activity, label: 'Vol' },
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
      {!isLandingPage && <FeatureTour />}
    </div>
    </SessionProvider>
  );
}
