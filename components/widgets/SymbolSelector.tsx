'use client';

import { useMarketStore } from '@/stores/useMarketStore';
import { SYMBOLS, type Symbol, type Timeframe } from '@/types/market';

const cryptoSymbols: Symbol[] = ['BTCUSDT', 'ETHUSDT'];
const indexSymbols: Symbol[] = ['MNQH5', 'MESH5', 'NQH5', 'ESH5'];
const goldSymbols: Symbol[] = ['GCJ5', 'MGCJ5'];
const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function SymbolSelector() {
  const { symbol, timeframe, currentPrice, setSymbol, setTimeframe } = useMarketStore();

  const formatPrice = (price: number) => {
    if (price === 0) return '---';
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const currentExchange = SYMBOLS[symbol]?.exchange;

  return (
    <div className="flex items-center gap-4">
      {/* Symbol Selector */}
      <div className="flex items-center gap-2">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as Symbol)}
          className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

        {/* Exchange badge */}
        <span className={`text-xs px-2 py-0.5 rounded ${
          currentExchange === 'bybit'
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-orange-500/20 text-orange-400'
        }`}>
          {currentExchange === 'bybit' ? 'Bybit' : 'CME'}
        </span>
      </div>

      {/* Current Price */}
      <div className="text-xl font-mono font-semibold text-white">
        ${formatPrice(currentPrice)}
      </div>

      {/* Timeframe Selector */}
      <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-700 p-0.5">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`
              px-3 py-1.5 text-sm font-medium rounded-md transition-colors
              ${timeframe === tf
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-white'
              }
            `}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}
