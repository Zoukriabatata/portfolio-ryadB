'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useTradingStore } from '@/stores/useTradingStore';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import ChartPageShell from '@/components/layouts/ChartPageShell';

const LiveChartPro = dynamic(
  () => import('@/components/charts/LiveChartPro'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

// ─── Types & constants ────────────────────────────────────────────────────────

type LayoutMode = '1x1' | '2x1' | '2x2';

const LAYOUTS: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: '1x1',
    label: 'Single',
    icon: (
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    mode: '2x1',
    label: 'Split',
    icon: (
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    mode: '2x2',
    label: 'Grid',
    icon: (
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
        <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
];

// ─── Layout Selector ──────────────────────────────────────────────────────────

function LayoutSelector({ layout, onChange }: { layout: LayoutMode; onChange: (m: LayoutMode) => void }) {
  return (
    <div
      className="flex items-center overflow-hidden rounded-md"
      style={{ border: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
    >
      {LAYOUTS.map(({ mode, label, icon }, i) => {
        const active = layout === mode;
        return (
          <button
            key={mode}
            data-testid={`layout-${mode}`}
            onClick={() => onChange(mode)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium transition-all duration-150"
            style={{
              backgroundColor: active ? 'var(--primary)' : 'transparent',
              color: active ? '#fff' : 'var(--text-secondary)',
              borderRight: i < LAYOUTS.length - 1 ? '1px solid var(--border)' : undefined,
              lineHeight: 1,
            }}
            title={mode === '1x1' ? 'Single chart' : mode === '2x1' ? 'Side-by-side' : '2×2 grid'}
          >
            <span style={{ opacity: active ? 1 : 0.7 }}>{icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Chart count badge ────────────────────────────────────────────────────────

function ChartBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span
      className="text-[9px] font-bold rounded px-1 py-0.5 tabular-nums"
      style={{ backgroundColor: 'var(--primary)', color: '#fff', lineHeight: 1 }}
    >
      ×{count}
    </span>
  );
}

// ─── Chart grid ───────────────────────────────────────────────────────────────

function ChartGrid({ layout, setSymbol, layoutKey }: {
  layout: LayoutMode;
  setSymbol: (s: string) => void;
  layoutKey: number;
}) {
  if (layout === '1x1') {
    return (
      <ChartErrorBoundary fallbackTitle="Chart Error">
        <div key={`chart-1x1-${layoutKey}`} className="h-full chart-panel-enter">
          <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
        </div>
      </ChartErrorBoundary>
    );
  }

  if (layout === '2x1') {
    return (
      <div className="h-full flex min-h-0">
        <div key={`chart-2x1-a-${layoutKey}`} className="flex-1 min-w-0 border-r border-[var(--border)] chart-panel-enter">
          <ChartErrorBoundary fallbackTitle="Chart Error">
            <LiveChartPro className="h-full" onSymbolChange={setSymbol} />
          </ChartErrorBoundary>
        </div>
        <div key={`chart-2x1-b-${layoutKey}`} className="flex-1 min-w-0 chart-panel-enter-stagger-1">
          <ChartErrorBoundary fallbackTitle="Chart Error">
            <LiveChartPro className="h-full" />
          </ChartErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-2 grid-rows-2 min-h-0">
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivePageContent() {
  const { tradingSymbol, setTradingSymbol } = useTradingStore();
  const [layout, setLayout] = useState<LayoutMode>('1x1');
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    setLayoutKey(prev => prev + 1);
  }, [layout]);

  const chartCount = layout === '1x1' ? 1 : layout === '2x1' ? 2 : 4;

  return (
    <ChartPageShell
      symbol={tradingSymbol}
      onSymbolChange={setTradingSymbol}
      toolbarRight={
        <div className="flex items-center gap-2">
          <ChartBadge count={chartCount} />
          <LayoutSelector layout={layout} onChange={setLayout} />
        </div>
      }
    >
      <ChartGrid layout={layout} setSymbol={setTradingSymbol} layoutKey={layoutKey} />
    </ChartPageShell>
  );
}
