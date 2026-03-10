'use client';

import dynamic from 'next/dynamic';
import { useTradingStore } from '@/stores/useTradingStore';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import QuickTradeBar from '@/components/trading/QuickTradeBar';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import ChartPageShell from '@/components/layouts/ChartPageShell';

const FootprintChartPro = dynamic(
  () => import('@/components/charts/FootprintChartPro'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// ─── Trade toggle button ──────────────────────────────────────────────────────

function TradeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all duration-150"
      style={{
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        backgroundColor: active ? 'rgba(16,185,129,0.10)' : 'transparent',
        color: active ? 'var(--primary)' : 'var(--text-secondary)',
      }}
      title={active ? 'Hide trade bar' : 'Show trade bar'}
    >
      {/* Status dot */}
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
        style={{ backgroundColor: active ? 'var(--primary)' : 'var(--text-dimmed)' }}
      />
      {/* Dollar icon */}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
      Trade
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FootprintPageContent() {
  const { showTradeBar, setShowTradeBar, tradingSymbol, setTradingSymbol } = useTradingStore();

  return (
    <ChartPageShell
      symbol={tradingSymbol}
      onSymbolChange={setTradingSymbol}
      toolbarLeft={
        <TradeToggle active={showTradeBar} onToggle={() => setShowTradeBar(!showTradeBar)} />
      }
      tradeBarVisible={showTradeBar}
      tradeBarSlot={
        <QuickTradeBar
          symbol={tradingSymbol}
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
      }
    >
      <ChartErrorBoundary fallbackTitle="Footprint Error">
        <div className="h-full">
          <FootprintChartPro className="h-full" onSymbolChange={setTradingSymbol} />
        </div>
      </ChartErrorBoundary>
    </ChartPageShell>
  );
}
