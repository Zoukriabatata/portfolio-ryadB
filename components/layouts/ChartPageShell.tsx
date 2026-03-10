'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ConnectionBanner from '@/components/ui/ConnectionBanner';
import BottomWidgetsPanel from '@/components/widgets/BottomWidgetsPanel';
import WatchlistPanel from '@/components/widgets/WatchlistPanel';
import { useFuturesData } from '@/hooks/useFuturesData';

const FuturesMetricsWidget = dynamic(
  () => import('@/components/widgets/FuturesMetricsWidget'),
  { ssr: false }
);

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconList() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconTrendingUp() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ─── Panel Collapsed Button ───────────────────────────────────────────────────

function CollapsedPanelButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full h-full flex flex-col items-center justify-center gap-2 hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group"
    >
      <span className="text-[var(--text-dimmed)] group-hover:text-[var(--text-secondary)] transition-colors">
        {icon}
      </span>
      <span
        className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-dimmed)] group-hover:text-[var(--text-secondary)] transition-colors"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        {label}
      </span>
    </button>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

interface ChartPageShellProps {
  symbol: string;
  onSymbolChange: (s: string) => void;
  /** Left slot in the thin toolbar row (e.g. trade toggle) */
  toolbarLeft?: React.ReactNode;
  /** Right slot in the thin toolbar row (e.g. layout selector) */
  toolbarRight?: React.ReactNode;
  /** Animated-height slot below toolbar (e.g. QuickTradeBar) */
  tradeBarSlot?: React.ReactNode;
  /** Whether the trade bar slot is visible (controls height animation) */
  tradeBarVisible?: boolean;
  children: React.ReactNode;
}

export default function ChartPageShell({
  symbol,
  onSymbolChange,
  toolbarLeft,
  toolbarRight,
  tradeBarSlot,
  tradeBarVisible = false,
  children,
}: ChartPageShellProps) {
  const [showFutures, setShowFutures] = useState(true);
  const [futuresWidth, setFuturesWidth] = useState(240);
  const [showWatchlist, setShowWatchlist] = useState(true);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);
  const cleanupRef = useRef<(() => void) | null>(null);

  useFuturesData(symbol);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = futuresWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startXRef.current - ev.clientX;
      setFuturesWidth(Math.max(180, Math.min(400, startWidthRef.current + delta)));
    };
    const handleUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      cleanupRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    cleanupRef.current = handleUp;
  }, [futuresWidth]);

  const hasToolbar = toolbarLeft || toolbarRight;

  return (
    <div className="h-[calc(100svh-56px)] flex animate-fadeIn" style={{ backgroundColor: 'var(--background)' }}>

      {/* ── Watchlist Panel ──────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-r overflow-hidden relative panel-slide hidden sm:block"
        style={{
          width: showWatchlist ? 180 : 28,
          borderColor: 'var(--border)',
          backgroundColor: showWatchlist ? 'var(--surface)' : 'var(--background)',
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {showWatchlist ? (
          <div className="h-full flex flex-col panel-content-fade" style={{ width: 180 }}>
            <WatchlistPanel activeSymbol={symbol} onSymbolSelect={onSymbolChange} />
            {/* Collapse button */}
            <button
              onClick={() => setShowWatchlist(false)}
              className="flex-shrink-0 flex items-center justify-center gap-1.5 px-2 py-1.5 border-t hover:bg-[var(--surface-hover)] transition-colors group"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}
            >
              <span className="group-hover:text-[var(--text-secondary)] transition-colors">
                <IconChevronLeft />
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-wider group-hover:text-[var(--text-secondary)] transition-colors">
                Collapse
              </span>
            </button>
          </div>
        ) : (
          <CollapsedPanelButton
            onClick={() => setShowWatchlist(true)}
            icon={<IconList />}
            label="Watchlist"
          />
        )}
      </div>

      {/* ── Center Column ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ConnectionBanner />

        {/* Toolbar row */}
        {hasToolbar && (
          <div
            className="flex items-center justify-between gap-2 px-2 py-0.5"
            style={{ borderBottom: '1px solid var(--border)', minHeight: 32 }}
          >
            <div className="flex items-center gap-1">{toolbarLeft}</div>
            <div className="flex items-center gap-1">{toolbarRight}</div>
          </div>
        )}

        {/* Trade bar animated slot */}
        {tradeBarSlot && (
          <div
            style={{
              height: tradeBarVisible ? 38 : 0,
              overflow: 'hidden',
              transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {tradeBarSlot}
          </div>
        )}

        {/* Chart area */}
        <div className="flex-1 min-h-0 relative">
          {children}
        </div>

        <BottomWidgetsPanel symbol={symbol} />
      </div>

      {/* ── Futures Panel ────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-l overflow-hidden relative hidden sm:block"
        style={{
          width: showFutures ? futuresWidth : 28,
          borderColor: 'var(--border)',
          backgroundColor: showFutures ? 'var(--background)' : 'var(--surface)',
          transition: isDraggingRef.current ? 'none' : 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Resize handle */}
        {showFutures && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-10 group"
          >
            <div className="absolute inset-y-0 left-0 w-full bg-[var(--primary)] opacity-0 group-hover:opacity-30 transition-opacity" />
            <div className="absolute top-1/3 bottom-1/3 left-[2px] w-[2px] rounded-full bg-[var(--text-dimmed)] opacity-0 group-hover:opacity-70 transition-opacity" />
          </div>
        )}

        {showFutures ? (
          <div className="h-full flex flex-col panel-content-fade" style={{ width: futuresWidth }}>
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-3 py-2 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color: 'var(--primary)' }}>
                  <IconTrendingUp />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Futures
                </span>
              </div>
              <button
                onClick={() => setShowFutures(false)}
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--surface-hover)] transition-colors group"
                style={{ color: 'var(--text-dimmed)' }}
                title="Collapse"
              >
                <span className="group-hover:text-[var(--text-secondary)] transition-colors">
                  <IconChevronRight />
                </span>
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto p-2.5">
              <FuturesMetricsWidget />
            </div>
          </div>
        ) : (
          <CollapsedPanelButton
            onClick={() => setShowFutures(true)}
            icon={<IconTrendingUp />}
            label="Futures"
          />
        )}
      </div>
    </div>
  );
}
