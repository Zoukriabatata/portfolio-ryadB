'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { StaircaseHeatmap, type DataMode } from '@/components/charts/StaircaseHeatmap';
import { CME_CONTRACTS } from '@/types/ib-protocol';

const IBLiquidityView = dynamic(
  () => import('@/components/charts/IBLiquidityView').then(m => ({ default: m.IBLiquidityView })),
  { ssr: false }
);

const Heatmap3D = dynamic(
  () => import('@/components/charts/Heatmap3D').then(m => ({ default: m.Heatmap3D })),
  { ssr: false }
);

type DataSourceType = 'crypto' | 'cme';
type ViewMode = '2d' | '3d';

// Crypto symbols with approximate base prices and heatmap tick sizes
const CRYPTO_SYMBOLS = [
  { value: 'btcusdt', label: 'BTC/USDT', tickSize: 10, basePrice: 100000 },
  { value: 'ethusdt', label: 'ETH/USDT', tickSize: 1, basePrice: 3500 },
  { value: 'solusdt', label: 'SOL/USDT', tickSize: 0.1, basePrice: 200 },
  { value: 'bnbusdt', label: 'BNB/USDT', tickSize: 0.1, basePrice: 600 },
  { value: 'xrpusdt', label: 'XRP/USDT', tickSize: 0.001, basePrice: 2.5 },
  { value: 'dogeusdt', label: 'DOGE/USDT', tickSize: 0.0001, basePrice: 0.35 },
  { value: 'avaxusdt', label: 'AVAX/USDT', tickSize: 0.01, basePrice: 35 },
  { value: 'linkusdt', label: 'LINK/USDT', tickSize: 0.01, basePrice: 20 },
];

// CME symbols from contracts (for IB view)
const CME_SYMBOLS = Object.entries(CME_CONTRACTS).map(([sym, spec]) => ({
  value: sym,
  label: `${sym} - ${spec.description}`,
  tickSize: spec.tickSize,
}));

export default function LiquidityPageContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [heatmapHeight, setHeatmapHeight] = useState(650);
  const [dataSource, setDataSource] = useState<DataSourceType>('crypto');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [symbol, setSymbol] = useState('btcusdt');
  const [ibSymbol, setIBSymbol] = useState('ES');
  const [dataMode, setDataMode] = useState<DataMode>('live');

  const selectedSymbol = CRYPTO_SYMBOLS.find(s => s.value === symbol) || CRYPTO_SYMBOLS[0];

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setHeatmapHeight(Math.max(500, rect.height - 8));
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Get config for crypto modes (memoized to avoid re-renders)
  const config = useMemo(() => {
    const adaptiveBaseLiquidity = selectedSymbol.tickSize >= 1 ? 50 : selectedSymbol.tickSize >= 0.1 ? 20 : 5;

    if (dataMode === 'live') {
      return {
        basePrice: selectedSymbol.basePrice,
        tickSize: selectedSymbol.tickSize,
        volatility: 0.0001,
        tradeFrequency: 15,
        avgTradeSize: 0.5,
        orderBookDepth: 20,
        baseLiquidity: adaptiveBaseLiquidity,
        wallProbability: 0.05,
        tradeLifetimeMs: 4000,
      };
    } else {
      return {
        basePrice: 5000,
        tickSize: 0.5,
        volatility: 0.00015,
        tradeFrequency: 10,
        avgTradeSize: 5,
        orderBookDepth: 35,
        baseLiquidity: 25,
        wallProbability: 0.04,
        tradeLifetimeMs: 3000,
      };
    }
  }, [dataMode, selectedSymbol]);

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between bg-[var(--surface)] rounded-xl border border-[var(--border)] px-4 py-3 animate-slideUp stagger-1">
        <div>
          <h1 className="text-base font-semibold text-[var(--text-primary)]">Liquidity Heatmap</h1>
          <p className="text-[var(--text-muted)] text-[11px]">
            {viewMode === '2d'
              ? 'Staircase chart + Trade bubbles + Passive orders'
              : '3D surface terrain — Orderbook depth visualization'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 2D / 3D View Toggle */}
          {dataSource === 'crypto' && (
            <div className="flex items-center bg-[var(--surface-elevated)] rounded-lg p-0.5 border border-[var(--border-light)]">
              <button
                onClick={() => setViewMode('2d')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === '2d'
                    ? 'bg-[var(--primary-glow)] text-[var(--primary-light)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                2D
              </button>
              <button
                onClick={() => setViewMode('3d')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  viewMode === '3d'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                3D
              </button>
            </div>
          )}

          {/* Data Source Toggle */}
          <div className="flex items-center bg-[var(--surface-elevated)] rounded-lg p-0.5 border border-[var(--border-light)]">
            <button
              onClick={() => { setDataSource('crypto'); }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                dataSource === 'crypto'
                  ? 'bg-[var(--primary-glow)] text-[var(--primary-light)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              Crypto
            </button>
            <button
              onClick={() => { setDataSource('cme'); setViewMode('2d'); }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                dataSource === 'cme'
                  ? 'bg-[var(--accent-glow)] text-[var(--accent-light)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              CME Futures
            </button>
          </div>

          {/* Crypto controls */}
          {dataSource === 'crypto' && (
            <>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-[var(--surface-elevated)] border border-[var(--border-light)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {CRYPTO_SYMBOLS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>

              <div className={`px-2.5 py-1 rounded text-[10px] font-medium border ${
                dataMode === 'live'
                  ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-bg)]'
                  : 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-bg)]'
              }`}>
                {dataMode === 'live' ? `LIVE ${selectedSymbol.label}` : 'SIMULATION'}
              </div>
            </>
          )}

          {/* CME controls */}
          {dataSource === 'cme' && (
            <div className="px-2.5 py-1 rounded text-[10px] font-medium border bg-[var(--info-bg)] text-[var(--info)] border-[var(--info-bg)]">
              IB Gateway
            </div>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div
        ref={containerRef}
        className="flex-1 rounded-xl border border-[var(--border)] overflow-hidden min-h-[500px] animate-scaleIn stagger-2"
      >
        {dataSource === 'crypto' && viewMode === '3d' ? (
          <Heatmap3D
            key={`3d-${dataMode}-${symbol}`}
            height={heatmapHeight}
            config={config}
            symbol={symbol}
            initialMode={dataMode}
          />
        ) : dataSource === 'crypto' ? (
          <StaircaseHeatmap
            key={`2d-${dataMode}-${symbol}`}
            height={heatmapHeight}
            config={config}
            symbol={symbol}
            initialMode={dataMode}
          />
        ) : (
          <IBLiquidityView
            key={`ib-${ibSymbol}`}
            height={heatmapHeight}
            ibSymbol={ibSymbol}
            onSymbolChange={setIBSymbol}
          />
        )}
      </div>
    </div>
  );
}
