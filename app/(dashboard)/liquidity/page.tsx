'use client';

import { LiquidityHeatmap } from '@/components/charts';
import { useOrderbook } from '@/hooks/useOrderbook';
import { useMarketStore } from '@/stores/useMarketStore';
import { SYMBOLS, type Symbol } from '@/types/market';

const cryptoSymbols: Symbol[] = ['BTCUSDT', 'ETHUSDT'];
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
    <div className="space-y-6">
      {/* Header with Symbol Selector */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white mb-2">Liquidity Heatmap</h1>
            <p className="text-zinc-400 text-sm">
              Real-time DOM depth visualization - {SYMBOLS[symbol]?.name || symbol}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Symbol Selector */}
            <div className="flex items-center gap-2">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value as Symbol)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <optgroup label="Crypto Futures (Live)">
                  {cryptoSymbols.map((s) => (
                    <option key={s} value={s}>
                      {SYMBOLS[s].name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Index Futures">
                  {indexSymbols.map((s) => (
                    <option key={s} value={s}>
                      {SYMBOLS[s].name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Gold Futures">
                  {goldSymbols.map((s) => (
                    <option key={s} value={s}>
                      {SYMBOLS[s].name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <span className={`text-xs px-2 py-0.5 rounded ${
                SYMBOLS[symbol]?.exchange === 'bybit'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-orange-500/20 text-orange-400'
              }`}>
                {SYMBOLS[symbol]?.exchange === 'bybit' ? 'Bybit' : 'CME'}
              </span>
            </div>

            {/* Current Price */}
            <div className="text-xl font-mono font-semibold text-white">
              ${formatPrice(currentPrice || midPrice)}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Mid Price</p>
          <p className="text-xl font-mono font-semibold text-white mt-1">
            ${formatPrice(midPrice)}
          </p>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Spread</p>
          <p className="text-xl font-mono font-semibold text-white mt-1">
            ${formatPrice(spread)}
          </p>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Bid/Ask Imbalance</p>
          <p className={`text-xl font-mono font-semibold mt-1 ${
            bidAskImbalance > 0 ? 'text-emerald-400' : bidAskImbalance < 0 ? 'text-red-400' : 'text-white'
          }`}>
            {formatImbalance(bidAskImbalance)}
          </p>
        </div>
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Walls Detected</p>
          <p className="text-xl font-mono font-semibold text-white mt-1">
            <span className="text-emerald-400">{bidWalls.length}</span>
            {' / '}
            <span className="text-red-400">{askWalls.length}</span>
          </p>
        </div>
      </div>

      {/* ATAS-style Heatmap */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400">DOM Heatmap</h2>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>Style: ATAS</span>
            <span>Update: 100ms</span>
          </div>
        </div>
        <LiquidityHeatmap height={600} priceRange={80} />
      </div>

      {/* Liquidity Walls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bid Walls */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">
            Bid Walls (Support)
          </h2>
          <div className="space-y-2">
            {bidWalls.length === 0 ? (
              <p className="text-zinc-600 text-sm">No walls detected</p>
            ) : (
              bidWalls.slice(0, 5).map((wall, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-emerald-500/10 rounded-lg px-3 py-2"
                >
                  <span className="font-mono text-emerald-400">
                    ${formatPrice(wall.price)}
                  </span>
                  <span className="font-mono text-zinc-400">
                    {wall.quantity.toFixed(2)} contracts
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ask Walls */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">
            Ask Walls (Resistance)
          </h2>
          <div className="space-y-2">
            {askWalls.length === 0 ? (
              <p className="text-zinc-600 text-sm">No walls detected</p>
            ) : (
              askWalls.slice(0, 5).map((wall, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-red-500/10 rounded-lg px-3 py-2"
                >
                  <span className="font-mono text-red-400">
                    ${formatPrice(wall.price)}
                  </span>
                  <span className="font-mono text-zinc-400">
                    {wall.quantity.toFixed(2)} contracts
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">About ATAS Heatmap</h2>
        <div className="text-xs text-zinc-500 space-y-2">
          <p>
            <span className="text-blue-400">Dark blue</span> areas indicate low volume/liquidity in the DOM.
          </p>
          <p>
            <span className="text-cyan-400">Cyan</span> and <span className="text-green-400">green</span> represent medium liquidity levels.
          </p>
          <p>
            <span className="text-yellow-400">Yellow</span> and <span className="text-orange-400">orange</span> highlight high volume concentrations where major market participants may be positioned.
          </p>
          <p className="text-zinc-400 mt-3">
            Use the Smoothing and Contrast controls to adjust visualization clarity.
          </p>
        </div>
      </div>
    </div>
  );
}
