'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useFuturesData } from '@/hooks/useFuturesData';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import ConnectionBanner from '@/components/ui/ConnectionBanner';
import BottomWidgetsPanel from '@/components/widgets/BottomWidgetsPanel';
import WatchlistPanel from '@/components/widgets/WatchlistPanel';

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[var(--background)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <span className="text-[var(--text-muted)] text-sm">Loading footprint...</span>
        </div>
      </div>
    ),
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
    <div className="h-[calc(100vh-56px)] flex">
      {/* Watchlist Panel */}
      <div
        className={`flex-shrink-0 border-r overflow-hidden relative panel-slide ${!showWatchlist ? 'panel-collapsed' : ''}`}
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

        {/* Footprint Chart */}
        <ChartErrorBoundary fallbackTitle="Footprint Error">
          <div className="flex-1">
            <FootprintChartPro className="h-full" onSymbolChange={setSymbol} />
          </div>
        </ChartErrorBoundary>

        <BottomWidgetsPanel symbol={symbol} />
      </div>

      {/* Futures Panel — animated width + drag resize */}
      <div
        className={`flex-shrink-0 border-l border-[var(--border)] overflow-hidden relative panel-slide animate-slideInRight stagger-2 ${!showFutures ? 'panel-collapsed' : ''}`}
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
