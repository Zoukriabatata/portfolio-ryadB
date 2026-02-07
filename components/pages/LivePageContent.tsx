'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useFuturesData } from '@/hooks/useFuturesData';

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

export default function LivePageContent() {
  const [symbol, setSymbol] = useState('btcusdt');
  const [showFutures, setShowFutures] = useState(true);

  // WebSocket + REST polling pour les données futures
  useFuturesData(symbol);

  return (
    <div className="h-[calc(100vh-56px)] flex">
      {/* Chart */}
      <div className="flex-1 flex flex-col min-w-0">
        <LiveChartPro
          className="flex-1"
          onSymbolChange={setSymbol}
        />
      </div>

      {/* Futures Panel */}
      {showFutures && (
        <div className="w-60 flex-shrink-0 border-l border-[var(--border)] bg-[var(--background)] overflow-y-auto p-2.5">
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
      )}

      {/* Toggle button when panel is hidden */}
      {!showFutures && (
        <button
          onClick={() => setShowFutures(true)}
          className="absolute right-2 top-16 bg-[var(--surface)] hover:bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[10px] px-2 py-1 rounded border border-[var(--border)] transition-colors"
        >
          Futures
        </button>
      )}
    </div>
  );
}
