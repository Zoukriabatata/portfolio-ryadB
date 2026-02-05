'use client';

import { useEffect, useRef, useState } from 'react';
import { StaircaseHeatmap, type DataMode } from '@/components/charts/StaircaseHeatmap';

/**
 * LIQUIDITY HEATMAP V2
 *
 * Features:
 * - Staircase lines (bid/ask)
 * - Bulles de trades visibles
 * - Heatmap ordres passifs
 * - Mode Simulation ou LIVE Binance
 */

// Available symbols
const SYMBOLS = [
  { value: 'btcusdt', label: 'BTC/USDT', tickSize: 10 },
  { value: 'ethusdt', label: 'ETH/USDT', tickSize: 1 },
  { value: 'solusdt', label: 'SOL/USDT', tickSize: 0.1 },
];

export default function LiquidityPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [heatmapHeight, setHeatmapHeight] = useState(650);
  const [symbol, setSymbol] = useState('btcusdt');
  const [dataMode, setDataMode] = useState<DataMode>('simulation');

  const selectedSymbol = SYMBOLS.find(s => s.value === symbol) || SYMBOLS[0];

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

  // Get config based on mode
  const getConfig = () => {
    if (dataMode === 'live') {
      // Live mode - use symbol's tick size
      return {
        basePrice: symbol === 'btcusdt' ? 100000 : symbol === 'ethusdt' ? 3500 : 200,
        tickSize: selectedSymbol.tickSize,
        volatility: 0.0001,
        tradeFrequency: 15,
        avgTradeSize: 0.5,
        orderBookDepth: 20,
        baseLiquidity: 5,
        wallProbability: 0.05,
        tradeLifetimeMs: 4000,
      };
    } else {
      // Simulation mode - simplified config
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
  };

  return (
    <div className="h-full flex flex-col p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900/50 rounded-xl border border-zinc-800/50 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold text-white">Liquidity Heatmap</h1>
          <p className="text-zinc-500 text-[11px]">
            Staircase chart + Trade bubbles + Passive orders
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Symbol Selector (only in Live mode) */}
          {dataMode === 'live' && (
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {SYMBOLS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}

          {/* Mode Badge */}
          <div className={`px-2.5 py-1 rounded text-[10px] font-medium border ${
            dataMode === 'live'
              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30'
              : 'bg-amber-600/20 text-amber-400 border-amber-600/30'
          }`}>
            {dataMode === 'live' ? `LIVE ${selectedSymbol.label}` : 'SIMULATION'}
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div
        ref={containerRef}
        className="flex-1 rounded-xl border border-zinc-800/50 overflow-hidden min-h-[500px]"
      >
        <StaircaseHeatmap
          key={`${dataMode}-${symbol}`}
          height={heatmapHeight}
          config={getConfig()}
          symbol={symbol}
          initialMode={dataMode}
        />
      </div>
    </div>
  );
}
