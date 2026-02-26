'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useFuturesData } from '@/hooks/useFuturesData';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import ConnectionBanner from '@/components/ui/ConnectionBanner';
import BottomWidgetsPanel from '@/components/widgets/BottomWidgetsPanel';
import WatchlistPanel from '@/components/widgets/WatchlistPanel';
import QuickTradeBar from '@/components/trading/QuickTradeBar';
import { useTradingStore } from '@/stores/useTradingStore';
import { ChartSkeleton } from '@/components/ui/Skeleton';

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

const FuturesMetricsWidget = dynamic(
  () => import('@/components/widgets/FuturesMetricsWidget'),
  { ssr: false }
);

export default function FootprintPageContent() {
  const [symbol, setSymbol] = useState('btcusdt');
  const [showFutures, setShowFutures] = useState(true);
  const [futuresWidth, setFuturesWidth] = useState(240);
  const [showWatchlist, setShowWatchlist] = useState(true);
  const { showTradeBar, setShowTradeBar } = useTradingStore();
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  const handleFuturesResizeStart = useCallback((e: React.MouseEvent) => {
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

  // Futures data subscription
  useFuturesData(symbol);

  return (
    <div className="h-[calc(100svh-56px)] flex">
      {/* Watchlist Panel — hidden on mobile */}
      <div
        className={`flex-shrink-0 border-r overflow-hidden relative panel-slide hidden sm:block ${!showWatchlist ? 'panel-collapsed' : ''}`}
        style={{
          width: showWatchlist ? 180 : 24,
          borderColor: 'var(--border)',
          backgroundColor: showWatchlist ? 'var(--surface)' : 'var(--background)',
        }}
      >
        {showWatchlist ? (
          <div className="h-full flex flex-col panel-content-fade" style={{ width: 180 }}>
            <WatchlistPanel activeSymbol={symbol} onSymbolSelect={setSymbol} />
            <button
              onClick={() => setShowWatchlist(false)}
              className="px-2 py-1 border-t text-[10px] hover:bg-white/5 transition-colors button-press"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}
            >
              Hide
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowWatchlist(true)}
            className="w-full h-full flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group button-press"
          >
            <span
              className="text-[10px] font-semibold tracking-wider uppercase group-hover:text-[var(--text-secondary)] transition-colors"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', color: 'var(--text-dimmed)' }}
            >
              Watch
            </span>
          </button>
        )}
      </div>

      {/* Chart + Bottom Widgets */}
      <div className="flex-1 flex flex-col min-w-0 relative animate-scaleIn stagger-1">
        <ConnectionBanner />

        {/* Quick Trade Toggle + Bar */}
        <div className="flex items-center" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowTradeBar(!showTradeBar)}
            className="px-2 py-1 text-[10px] font-medium transition-colors"
            style={{
              color: showTradeBar ? 'var(--primary)' : 'var(--text-muted)',
              background: showTradeBar ? 'rgba(16,185,129,0.08)' : 'transparent',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            Trade
          </button>
        </div>
        <div style={{ height: showTradeBar ? 38 : 0, overflow: 'hidden', transition: 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}>
          <QuickTradeBar
            symbol={symbol}
            colors={{
              surface: 'var(--surface)',
              border: 'var(--border)',
              text: 'var(--text-primary)',
              textSecondary: 'var(--text-secondary)',
              textMuted: 'var(--text-muted)',
              success: '#22c55e',
              error: '#ef4444',
              background: 'var(--background)',
            }}
          />
        </div>

        {/* Footprint Chart */}
        <ChartErrorBoundary fallbackTitle="Footprint Error">
          <div className="flex-1">
            <FootprintChartPro className="h-full" onSymbolChange={setSymbol} />
          </div>
        </ChartErrorBoundary>

        <BottomWidgetsPanel symbol={symbol} />
      </div>

      {/* Futures Panel — animated width + drag resize, hidden on mobile */}
      <div
        className={`flex-shrink-0 border-l border-[var(--border)] overflow-hidden relative panel-slide animate-slideInRight stagger-2 hidden sm:block ${!showFutures ? 'panel-collapsed' : ''}`}
        style={{
          width: showFutures ? futuresWidth : 24,
          transition: isDraggingRef.current ? 'none' : undefined,
          backgroundColor: showFutures ? 'var(--background)' : 'var(--surface)',
        }}
      >
        {/* Resize handle */}
        {showFutures && (
          <div
            onMouseDown={handleFuturesResizeStart}
            className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-10 group resize-handle"
          >
            <div className="absolute inset-y-0 left-0 w-full bg-[var(--primary)] opacity-0 group-hover:opacity-40 transition-opacity" />
            <div className="absolute inset-y-1/3 left-[2px] w-[2px] rounded-full bg-[var(--text-dimmed)] opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
        )}
        {showFutures ? (
          <div className="h-full overflow-y-auto p-2.5 panel-content-fade" style={{ width: futuresWidth }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Futures Data
              </h3>
              <button
                onClick={() => setShowFutures(false)}
                className="text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] text-[10px] transition-colors button-press"
              >
                Hide
              </button>
            </div>
            <FuturesMetricsWidget />
          </div>
        ) : (
          <button
            onClick={() => setShowFutures(true)}
            className="w-full h-full flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group button-press"
          >
            <span
              className="text-[10px] font-semibold tracking-wider uppercase text-[var(--text-dimmed)] group-hover:text-[var(--text-secondary)] transition-colors"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Futures
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
