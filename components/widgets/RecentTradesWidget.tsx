'use client';

import { useTrades } from '@/hooks/useTrades';

interface RecentTradesWidgetProps {
  rows?: number;
}

export default function RecentTradesWidget({ rows = 15 }: RecentTradesWidgetProps) {
  const { trades, isLive } = useTrades();

  // Get most recent trades (reversed so newest is at top)
  const recentTrades = trades.slice(-rows).reverse();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatQty = (qty: number) => {
    if (qty >= 1000) {
      return (qty / 1000).toFixed(2) + 'K';
    }
    if (qty >= 1) {
      return qty.toFixed(3);
    }
    return qty.toFixed(4);
  };

  // Calculate max quantity for highlighting large trades
  const avgQty = recentTrades.length > 0
    ? recentTrades.reduce((sum, t) => sum + t.quantity, 0) / recentTrades.length
    : 0;

  if (!isLive) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Real-time trades only available for Bybit symbols
      </div>
    );
  }

  if (recentTrades.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        Waiting for trades...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 text-xs text-zinc-500 px-1">
        <span>Time</span>
        <span>Price</span>
        <span>Size</span>
      </div>

      {/* Trades list */}
      <div className="flex-1 overflow-hidden">
        {recentTrades.map((trade, index) => {
          const isBuy = !trade.isBuyerMaker;
          const isLarge = trade.quantity > avgQty * 2;

          return (
            <div
              key={`${trade.id}-${index}`}
              className={`flex items-center justify-between py-0.5 px-1 text-xs ${
                isLarge ? 'bg-zinc-800/50 rounded' : ''
              }`}
            >
              <span className="font-mono text-zinc-500 w-16">
                {formatTime(trade.time)}
              </span>
              <span className={`font-mono font-medium ${
                isBuy ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {formatPrice(trade.price)}
              </span>
              <span className={`font-mono ${
                isLarge ? 'text-yellow-400 font-semibold' : 'text-zinc-400'
              }`}>
                {formatQty(trade.quantity)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Buys: </span>
          <span className="text-emerald-400 font-mono">
            {recentTrades.filter(t => !t.isBuyerMaker).length}
          </span>
        </div>
        <div className="text-right">
          <span className="text-zinc-500">Sells: </span>
          <span className="text-red-400 font-mono">
            {recentTrades.filter(t => t.isBuyerMaker).length}
          </span>
        </div>
      </div>
    </div>
  );
}
