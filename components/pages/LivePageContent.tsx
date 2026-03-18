'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useTradingStore } from '@/stores/useTradingStore';
import { useShallow } from 'zustand/react/shallow';
import ChartErrorBoundary from '@/components/ui/ChartErrorBoundary';
import { ChartSkeleton } from '@/components/ui/Skeleton';
import ChartPageShell from '@/components/layouts/ChartPageShell';
import { DOMladder } from '@/components/live/DOMladder';
import { LiveTape } from '@/components/live/LiveTape';
import { ConnectionStatusBadge } from '@/components/live/ConnectionStatus';
import { useLiveStore } from '@/stores/useLiveStore';
import { useTradovatePanel } from '@/hooks/useTradovatePanel';
import { CME_SYMBOLS } from '@/lib/websocket/TradovateWS';
import { isCMESymbol } from '@/lib/utils/symbolUtils';
import Link from 'next/link';

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

// ─── Trading Panel (DOM + Tape) ───────────────────────────────────────────────

/**
 * TradingPanel subscribes to Tradovate DOM/quotes/trades for CME symbols
 * and renders the DOM Ladder + Live Tape side panel.
 */
function TradingPanel({ symbol }: { symbol: string }) {
  useTradovatePanel(symbol);
  const { dom, quote, trades, status } = useLiveStore();
  const tickSize = CME_SYMBOLS[symbol.toUpperCase()]?.tickSize ?? 0.25;
  const [activeTab, setActiveTab] = useState<'dom' | 'tape'>('dom');

  return (
    <div
      className="flex flex-col h-full border-l"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)', minWidth: 220, maxWidth: 280 }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-2 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex gap-1">
          {(['dom', 'tape'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-2.5 py-0.5 rounded text-[10px] font-medium transition-colors"
              style={{
                backgroundColor: activeTab === tab ? 'var(--primary)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--text-muted)',
              }}
            >
              {tab === 'dom' ? 'DOM' : 'Tape'}
            </button>
          ))}
        </div>
        <ConnectionStatusBadge status={status} />
      </div>

      {/* Panel content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Show setup prompt when connection fails */}
        {status === 'error' ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Tradovate not connected
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Add your credentials to stream live CME data
              </p>
            </div>
            <Link
              href="/boutique"
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
            >
              Connect Tradovate →
            </Link>
          </div>
        ) : activeTab === 'dom' ? (
          <DOMladder dom={dom} quote={quote} tickSize={tickSize} depth={14} />
        ) : (
          <LiveTape trades={trades} tickSize={tickSize} />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivePageContent() {
  const { tradingSymbol, setTradingSymbol } = useTradingStore(
    useShallow(s => ({ tradingSymbol: s.tradingSymbol, setTradingSymbol: s.setTradingSymbol }))
  );
  const [layout, setLayout] = useState<LayoutMode>('1x1');
  const [layoutKey, setLayoutKey] = useState(0);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    setLayoutKey(prev => prev + 1);
  }, [layout]);

  const chartCount = layout === '1x1' ? 1 : layout === '2x1' ? 2 : 4;
  const showTradingPanel = showPanel && isCMESymbol(tradingSymbol) && layout === '1x1';

  return (
    <ChartPageShell
      symbol={tradingSymbol}
      onSymbolChange={setTradingSymbol}
      toolbarRight={
        <div className="flex items-center gap-2">
          <ChartBadge count={chartCount} />
          <LayoutSelector layout={layout} onChange={setLayout} />

          {/* Trading panel toggle — only for CME futures symbols */}
          {isCMESymbol(tradingSymbol) && (
            <button
              onClick={() => setShowPanel((p) => !p)}
              title={showPanel ? 'Hide DOM & Tape' : 'Show DOM & Tape'}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150"
              style={{
                backgroundColor: showPanel ? 'var(--primary)' : 'var(--surface)',
                color: showPanel ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {/* Simple order book icon */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0" y="0" width="4" height="1.5" rx="0.5" fill="currentColor" opacity={0.5} />
                <rect x="5" y="0" width="5" height="1.5" rx="0.5" fill="#22c55e" />
                <rect x="0" y="2.5" width="6" height="1.5" rx="0.5" fill="currentColor" opacity={0.5} />
                <rect x="7" y="2.5" width="3" height="1.5" rx="0.5" fill="#22c55e" />
                <rect x="0" y="5" width="7" height="1.5" rx="0.5" fill="currentColor" opacity={0.5} />
                <rect x="8" y="5" width="2" height="1.5" rx="0.5" fill="#ef4444" />
                <rect x="0" y="7.5" width="5" height="1.5" rx="0.5" fill="currentColor" opacity={0.5} />
                <rect x="6" y="7.5" width="4" height="1.5" rx="0.5" fill="#ef4444" />
              </svg>
              DOM
            </button>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        <div className="flex-1 min-w-0 min-h-0">
          <ChartGrid layout={layout} setSymbol={setTradingSymbol} layoutKey={layoutKey} />
        </div>

        {/* Trading panel: DOM Ladder + Live Tape */}
        {showTradingPanel && (
          <TradingPanel symbol={tradingSymbol} />
        )}
      </div>
    </ChartPageShell>
  );
}
