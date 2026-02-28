'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useFuturesData } from '@/hooks/useFuturesData';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import ConnectionBanner from '@/components/ui/ConnectionBanner';
import BottomWidgetsPanel from '@/components/widgets/BottomWidgetsPanel';
import WatchlistPanel from '@/components/widgets/WatchlistPanel';
import { useTradingStore } from '@/stores/useTradingStore';
import { ChartSkeleton } from '@/components/ui/Skeleton';

const LiveChartPro = dynamic(
  () => import('@/components/charts/LiveChartPro'),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

const FuturesMetricsWidget = dynamic(
  () => import('@/components/widgets/FuturesMetricsWidget'),
  { ssr: false }
);

type LayoutMode = '1x1' | '2x1' | '2x2';

const LAYOUT_ICONS: Record<LayoutMode, React.ReactNode> = {
  '1x1': (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  '2x1': (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  '2x2': (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
};

export default function LivePageContent() {
  const { tradingSymbol, setTradingSymbol } = useTradingStore();
  const symbol = tradingSymbol;
  const setSymbol = setTradingSymbol;
  const [showFutures, setShowFutures] = useState(true);
  const [futuresWidth, setFuturesWidth] = useState(240);
  const [layout, setLayout] = useState<LayoutMode>('1x1');
  const [showWatchlist, setShowWatchlist] = useState(true);
  const [layoutKey, setLayoutKey] = useState(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount to prevent leaked listeners
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  // Trigger animations when layout changes
  useEffect(() => {
    setLayoutKey(prev => prev + 1);
  }, [layout]);

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

  // WebSocket + REST polling pour les données futures
  useFuturesData(symbol);

  return (
    <div className="h-[calc(100svh-56px)] flex animate-fadeIn" style={{ backgroundColor: 'var(--background)' }}>
      {/* Watchlist Panel — hidden on mobile */}
      <div
        className={`flex-shrink-0 border-r overflow-hidden relative panel-slide hidden sm:block ${!showWatchlist ? 'panel-collapsed' : ''}`}
        style={{
          width: showWatchlist ? 180 : 20,
          borderColor: 'var(--border)',
          backgroundColor: showWatchlist ? 'var(--surface)' : 'var(--background)',
        }}
      >
        {showWatchlist ? (
          <div className="h-full flex flex-col panel-content-fade" style={{ width: 180 }}>
            <WatchlistPanel activeSymbol={symbol} onSymbolSelect={setSymbol} />
            <button
              data-testid="watchlist-hide"
              onClick={() => setShowWatchlist(false)}
              className="px-2 py-1 border-t text-[10px] hover:bg-white/5 transition-colors button-press flex items-center justify-center gap-1"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Hide
            </button>
          </div>
        ) : (
          <button
            data-testid="watchlist-show"
            onClick={() => setShowWatchlist(true)}
            className="w-full h-full flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group button-press"
          >
            <span
              className="text-[9px] font-semibold tracking-wider uppercase group-hover:text-[var(--text-secondary)] transition-colors"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', color: 'var(--text-dimmed)' }}
            >
              Watch
            </span>
          </button>
        )}
      </div>

      {/* Chart + Bottom Widgets */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ConnectionBanner />

        {/* Toolbar: Layout selector */}
        <div className="flex items-center justify-end" style={{ borderBottom: '1px solid var(--border)' }}>
          {/* Layout Selector */}
          <div
            data-testid="layout-selector"
            className="flex items-center gap-0.5 px-1.5 py-0.5 mr-1.5 rounded-md"
            style={{
              backgroundColor: 'var(--background)',
              border: '1px solid var(--border)',
            }}
          >
            {(['1x1', '2x1', '2x2'] as LayoutMode[]).map(mode => (
              <button
                key={mode}
                data-testid={`layout-${mode}`}
                onClick={() => setLayout(mode)}
                className="layout-button button-press flex items-center justify-center rounded transition-all duration-150"
                style={{
                  backgroundColor: layout === mode ? 'var(--primary)' : 'transparent',
                  color: layout === mode ? '#fff' : 'var(--text-secondary)',
                  width: 24,
                  height: 24,
                }}
                title={mode === '1x1' ? 'Single chart' : mode === '2x1' ? 'Side by side' : '2x2 grid'}
              >
                {LAYOUT_ICONS[mode]}
              </button>
            ))}
          </div>
        </div>
        {/* Chart Grid */}
        {layout === '1x1' ? (
          <ChartErrorBoundary fallbackTitle="Chart Error">
            <div key={`chart-1x1-${layoutKey}`} className="flex-1 chart-panel-enter">
              <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
            </div>
          </ChartErrorBoundary>
        ) : layout === '2x1' ? (
          <div className="flex-1 flex min-h-0">
            <div key={`chart-2x1-1-${layoutKey}`} className="flex-1 min-w-0 border-r border-[var(--border)] chart-panel-enter">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
              </ChartErrorBoundary>
            </div>
            <div key={`chart-2x1-2-${layoutKey}`} className="flex-1 min-w-0 chart-panel-enter-stagger-1">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-2 grid-rows-2 min-h-0">
            <div key={`chart-2x2-1-${layoutKey}`} className="border-r border-b border-[var(--border)] min-w-0 min-h-0 chart-panel-enter">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
              </ChartErrorBoundary>
            </div>
            <div key={`chart-2x2-2-${layoutKey}`} className="border-b border-[var(--border)] min-w-0 min-h-0 chart-panel-enter-stagger-1">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
            <div key={`chart-2x2-3-${layoutKey}`} className="border-r border-[var(--border)] min-w-0 min-h-0 chart-panel-enter-stagger-2">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
            <div key={`chart-2x2-4-${layoutKey}`} className="min-w-0 min-h-0 chart-panel-enter-stagger-3">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
          </div>
        )}

        <BottomWidgetsPanel symbol={symbol} />
      </div>

      {/* Futures Panel — animated width + drag resize, hidden on mobile */}
      <div
        className={`flex-shrink-0 border-l border-[var(--border)] overflow-hidden relative panel-slide hidden sm:block ${!showFutures ? 'panel-collapsed' : ''}`}
        style={{
          width: showFutures ? futuresWidth : 20,
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
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
                </svg>
                Futures
              </h3>
              <button
                onClick={() => setShowFutures(false)}
                className="text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] transition-colors button-press p-0.5 rounded hover:bg-white/5"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
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
              className="text-[9px] font-semibold tracking-wider uppercase text-[var(--text-dimmed)] group-hover:text-[var(--text-secondary)] transition-colors"
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
