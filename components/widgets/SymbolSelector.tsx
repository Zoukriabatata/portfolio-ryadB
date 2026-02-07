'use client';

import { useMarketStore } from '@/stores/useMarketStore';
import { SYMBOLS, type Symbol, type Timeframe } from '@/types/market';

// Crypto Futures - FREE real-time data from Binance
const cryptoSymbols: Symbol[] = [
  'BTCUSDT',   // Bitcoin - Most liquid
  'ETHUSDT',   // Ethereum
  'SOLUSDT',   // Solana
  'BNBUSDT',   // BNB
  'XRPUSDT',   // XRP
  'DOGEUSDT',  // Doge
  'ARBUSDT',   // Arbitrum
  'SUIUSDT',   // Sui
  'AVAXUSDT',  // Avalanche
  'LINKUSDT',  // Chainlink
];

// CME Index Futures (requires paid data)
const indexSymbols: Symbol[] = ['NQ', 'MNQ', 'ES', 'MES'];

// CME Gold Futures (requires paid data)
const goldSymbols: Symbol[] = ['GC', 'MGC'];

const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export default function SymbolSelector() {
  const { symbol, timeframe, currentPrice, setSymbol, setTimeframe } = useMarketStore();

  const formatPrice = (price: number) => {
    if (price === 0) return '---';
    // Adjust decimals based on price magnitude
    const decimals = price < 1 ? 5 : price < 10 ? 4 : price < 100 ? 3 : 2;
    return price.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const symbolInfo = SYMBOLS[symbol];
  const currentExchange = symbolInfo?.exchange;
  const isCrypto = currentExchange === 'binance';

  return (
    <div className="flex items-center gap-4">
      {/* Symbol Selector */}
      <div className="flex items-center gap-2">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value as Symbol)}
          className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <optgroup label="🔥 Crypto Futures (Live - Free)">
            {cryptoSymbols.map((s) => (
              <option key={s} value={s}>
                {SYMBOLS[s]?.name || s}
              </option>
            ))}
          </optgroup>
          <optgroup label="📊 CME Index (Requires License)">
            {indexSymbols.map((s) => (
              <option key={s} value={s}>
                {SYMBOLS[s]?.name || s}
              </option>
            ))}
          </optgroup>
          <optgroup label="🥇 CME Gold (Requires License)">
            {goldSymbols.map((s) => (
              <option key={s} value={s}>
                {SYMBOLS[s]?.name || s}
              </option>
            ))}
          </optgroup>
        </select>

        {/* Exchange badge */}
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          currentExchange === 'binance'
            ? 'bg-yellow-500/20 text-yellow-400'
            : currentExchange === 'tradovate'
            ? 'bg-blue-500/20 text-blue-400'
            : 'bg-zinc-500/20 text-zinc-400'
        }`}>
          {currentExchange === 'binance' ? '🟢 Binance' : currentExchange === 'tradovate' ? 'CME' : currentExchange}
        </span>

        {/* Live indicator for crypto */}
        {isCrypto && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
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
