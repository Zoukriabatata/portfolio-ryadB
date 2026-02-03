'use client';

import { useEffect, useRef, useState } from 'react';
import { LiquidityHeatmapPro } from '@/components/charts';
import { useOrderbook } from '@/hooks/useOrderbook';
import { useMarketStore } from '@/stores/useMarketStore';
import { useTradeStore } from '@/stores/useTradeStore';
import { SYMBOLS, type Symbol } from '@/types/market';

const cryptoSymbols: Symbol[] = ['BTCUSDT'];
const indexSymbols: Symbol[] = ['MNQH5', 'MESH5', 'NQH5', 'ESH5'];
const goldSymbols: Symbol[] = ['GCJ5', 'MGCJ5'];

export default function LiquidityPage() {
  const { symbol, setSymbol, currentPrice } = useMarketStore();
  const {
    midPrice,
    spread,
    bidAskImbalance,
    bidWalls,
    askWalls,
  } = useOrderbook();
  const { tradeCount, recentBuyVolume, recentSellVolume } = useTradeStore();

  // Dynamic height for heatmap
  const containerRef = useRef<HTMLDivElement>(null);
  const [heatmapHeight, setHeatmapHeight] = useState(600);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setHeatmapHeight(Math.max(400, rect.height - 8)); // -8 for padding
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Check if current symbol is live or simulated
  const isBinanceSymbol = symbol.toUpperCase().includes('USDT');

  const formatPrice = (price: number) => {
    if (!price) return '---';
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatImbalance = (imbalance: number) => {
    const percent = (imbalance * 100).toFixed(1);
    const prefix = imbalance > 0 ? '+' : '';
    return `${prefix}${percent}%`;
  };

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900/50 rounded-xl border border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-semibold text-white">Liquidity Heatmap Pro</h1>
            <p className="text-zinc-500 text-xs">
              Right-click for menu • Drag on price axis to zoom
            </p>
          </div>

          {/* Symbol Selector */}
          <div className="flex items-center gap-2">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value as Symbol)}
              className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <optgroup label="Crypto Futures (Live Data)">
                {cryptoSymbols.map((s) => (
                  <option key={s} value={s}>
                    {SYMBOLS[s].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Index Futures (Simulated)">
                {indexSymbols.map((s) => (
                  <option key={s} value={s}>
                    {SYMBOLS[s].name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gold Futures (Simulated)">
                {goldSymbols.map((s) => (
                  <option key={s} value={s}>
                    {SYMBOLS[s].name}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className={`text-xs px-2 py-0.5 rounded ${
              isBinanceSymbol
                ? 'bg-green-500/20 text-green-400'
                : 'bg-blue-500/20 text-blue-400'
            }`}>
              {isBinanceSymbol ? 'LIVE' : 'SIM'}
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-zinc-500">Mid Price</p>
            <p className="text-lg font-mono font-semibold text-white">
              ${formatPrice(currentPrice || midPrice)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Spread</p>
            <p className="text-sm font-mono text-zinc-300">
              ${formatPrice(spread)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Imbalance</p>
            <p className={`text-sm font-mono ${
              bidAskImbalance > 0 ? 'text-green-400' : bidAskImbalance < 0 ? 'text-red-400' : 'text-zinc-300'
            }`}>
              {formatImbalance(bidAskImbalance)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Walls</p>
            <p className="text-sm font-mono">
              <span className="text-green-400">{bidWalls.length}</span>
              <span className="text-zinc-500"> / </span>
              <span className="text-red-400">{askWalls.length}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Trades</p>
            <p className="text-sm font-mono">
              <span className="text-green-400">{recentBuyVolume.toFixed(1)}</span>
              <span className="text-zinc-500"> / </span>
              <span className="text-red-400">{recentSellVolume.toFixed(1)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Heatmap - Takes remaining space */}
      <div
        ref={containerRef}
        className="flex-1 bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden min-h-[400px]"
      >
        <LiquidityHeatmapPro height={heatmapHeight} priceRangeTicks={150} />
      </div>
    </div>
  );
}
