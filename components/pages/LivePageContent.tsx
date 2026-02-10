'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useFuturesData } from '@/hooks/useFuturesData';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import ConnectionBanner from '@/components/ui/ConnectionBanner';
import BottomWidgetsPanel from '@/components/widgets/BottomWidgetsPanel';
import WatchlistPanel from '@/components/widgets/WatchlistPanel';

const LiveChartPro = dynamic(
  () => import('@/components/charts/LiveChartPro'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[var(--background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[var(--text-muted)] text-sm">Loading chart...</span>
        </div>
      </div>
    ),
  }
);

const FuturesMetricsWidget = dynamic(
  () => import('@/components/widgets/FuturesMetricsWidget'),
  { ssr: false }
);

type LayoutMode = '1x1' | '2x1' | '2x2';

const LAYOUT_ICONS: Record<LayoutMode, React.ReactNode> = {
  '1x1': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  '2x1': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  '2x2': (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
};

export default function LivePageContent() {
  const [symbol, setSymbol] = useState('btcusdt');
  const [showFutures, setShowFutures] = useState(true);
  const [futuresWidth, setFuturesWidth] = useState(240);
  const [layout, setLayout] = useState<LayoutMode>('1x1');
  const [showWatchlist, setShowWatchlist] = useState(true);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(240);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount to prevent leaked listeners
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

  // WebSocket + REST polling pour les données futures
  useFuturesData(symbol);

  return (
    <div className="h-[calc(100vh-56px)] flex">
      {/* Watchlist Panel */}
      <div
        className="flex-shrink-0 border-r overflow-hidden relative"
        style={{
          width: showWatchlist ? 180 : 24,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          borderColor: 'var(--border)',
          backgroundColor: showWatchlist ? 'var(--surface)' : 'var(--background)',
        }}
      >
        {showWatchlist ? (
          <div className="h-full flex flex-col" style={{ width: 180 }}>
            <WatchlistPanel activeSymbol={symbol} onSymbolSelect={setSymbol} />
            <button
              onClick={() => setShowWatchlist(false)}
              className="px-2 py-1 border-t text-[10px] hover:bg-white/5 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}
            >
              Hide
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowWatchlist(true)}
            className="w-full h-full flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group"
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
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ConnectionBanner />

        {/* Layout Selector */}
        <div className="flex items-center gap-0.5 absolute top-1 left-1/2 -translate-x-1/2 z-30 px-1.5 py-0.5 rounded-lg"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {(['1x1', '2x1', '2x2'] as LayoutMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setLayout(mode)}
              className="w-6 h-6 flex items-center justify-center rounded transition-all"
              style={{
                backgroundColor: layout === mode ? 'var(--primary)' : 'transparent',
                color: layout === mode ? '#fff' : 'var(--text-muted)',
              }}
              title={mode === '1x1' ? 'Single chart' : mode === '2x1' ? 'Side by side' : '2x2 grid'}
            >
              {LAYOUT_ICONS[mode]}
            </button>
          ))}
        </div>

        {/* Chart Grid */}
        {layout === '1x1' ? (
          <ChartErrorBoundary fallbackTitle="Chart Error">
            <LiveChartPro className="flex-1" onSymbolChange={setSymbol} />
          </ChartErrorBoundary>
        ) : layout === '2x1' ? (
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 min-w-0 border-r border-[var(--border)]">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
              </ChartErrorBoundary>
            </div>
            <div className="flex-1 min-w-0">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-2 grid-rows-2 min-h-0">
            <div className="border-r border-b border-[var(--border)] min-w-0 min-h-0">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
              </ChartErrorBoundary>
            </div>
            <div className="border-b border-[var(--border)] min-w-0 min-h-0">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
            <div className="border-r border-[var(--border)] min-w-0 min-h-0">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
            <div className="min-w-0 min-h-0">
              <ChartErrorBoundary fallbackTitle="Chart Error">
                <LiveChartPro className="h-full" />
              </ChartErrorBoundary>
            </div>
          </div>
        )}

        <BottomWidgetsPanel symbol={symbol} />
      </div>

      {/* Futures Panel — animated width + drag resize */}
      <div
        className="flex-shrink-0 border-l border-[var(--border)] overflow-hidden relative"
        style={{
          width: showFutures ? futuresWidth : 24,
          transition: isDraggingRef.current ? 'none' : 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          backgroundColor: showFutures ? 'var(--background)' : 'var(--surface)',
        }}
      >
        {/* Resize handle */}
        {showFutures && (
          <div
            onMouseDown={handleFuturesResizeStart}
            className="absolute top-0 left-0 bottom-0 w-1.5 cursor-col-resize z-10 group transition-colors"
          >
            <div className="absolute inset-y-0 left-0 w-full bg-[var(--primary)] opacity-0 group-hover:opacity-40 transition-opacity" />
            <div className="absolute inset-y-1/3 left-[2px] w-[2px] rounded-full bg-[var(--text-dimmed)] opacity-0 group-hover:opacity-60 transition-opacity" />
          </div>
        )}
        {showFutures ? (
          <div className="h-full overflow-y-auto p-2.5" style={{ width: futuresWidth }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Futures Data
              </h3>
              <button
                onClick={() => setShowFutures(false)}
                className="text-[var(--text-dimmed)] hover:text-[var(--text-secondary)] text-[10px] transition-colors"
              >
                Hide
              </button>
            </div>
            <FuturesMetricsWidget />
          </div>
        ) : (
          <button
            onClick={() => setShowFutures(true)}
            className="w-full h-full flex items-center justify-center hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer group"
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
