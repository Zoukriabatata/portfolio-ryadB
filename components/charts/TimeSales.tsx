'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { Pause, Play, RotateCcw, Zap, Waves, Clock } from 'lucide-react';
import { useMarketStore } from '@/stores/useMarketStore';
import { bybitWS } from '@/lib/websocket/BybitWS';
import Segment from '@/components/ui/Segment';
import { useValueFlash } from '@/lib/ui/useValueFlash';

interface TradeEntry {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  time: number;
  isLarge: boolean;
  isAggressive: boolean;
}

interface TimeSalesProps {
  height?: number;
  width?: number;
  maxTrades?: number;
  largeThreshold?: number;
}

const COLORS = {
  background: 'var(--background)',
  backgroundAlt: 'var(--surface)',
  border: 'var(--border)',
  text: 'var(--text-muted)',
  textBright: 'var(--text-primary)',

  // Trade colors
  buy: 'var(--bull)',
  buyBg: 'rgb(var(--bull-rgb) / 0.10)',
  buyLarge: 'var(--bull)',
  buyLargeBg: 'rgb(var(--bull-rgb) / 0.35)',

  sell: 'var(--bear)',
  sellBg: 'rgb(var(--bear-rgb) / 0.10)',
  sellLarge: 'var(--bear)',
  sellLargeBg: 'rgb(var(--bear-rgb) / 0.35)',

  // Special
  aggressive: 'var(--warning)',
  neutral: 'var(--text-dimmed)',
};

export default memo(function TimeSales({
  height = 400,
  width = 250,
  maxTrades = 100,
  largeThreshold = 1,
}: TimeSalesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'large' | 'buys' | 'sells'>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState({ buyVol: 0, sellVol: 0, trades: 0 });

  const symbol = useMarketStore((s) => s.symbol);
  const lastPriceRef = useRef<number>(0);

  // Subscribe to trades
  useEffect(() => {
    bybitWS.connect('linear');

    const unsubscribe = bybitWS.subscribeTrades(
      symbol,
      (trade) => {
        if (isPaused) return;

        const side = trade.isBuyerMaker ? 'sell' : 'buy';
        const isLarge = trade.quantity >= largeThreshold;

        // Detect aggressive trades (price moves in direction of trade)
        const priceChange = trade.price - lastPriceRef.current;
        const isAggressive = (side === 'buy' && priceChange > 0) ||
                            (side === 'sell' && priceChange < 0);
        lastPriceRef.current = trade.price;

        const entry: TradeEntry = {
          id: trade.id,
          price: trade.price,
          size: trade.quantity,
          side,
          time: trade.time,
          isLarge,
          isAggressive,
        };

        setTrades(prev => [entry, ...prev].slice(0, maxTrades));

        // Update stats
        setStats(prev => ({
          buyVol: prev.buyVol + (side === 'buy' ? trade.quantity : 0),
          sellVol: prev.sellVol + (side === 'sell' ? trade.quantity : 0),
          trades: prev.trades + 1,
        }));
      },
      'linear'
    );

    return () => unsubscribe();
  }, [symbol, isPaused, largeThreshold, maxTrades]);

  // Filter trades
  const filteredTrades = trades.filter(t => {
    if (filter === 'large') return t.isLarge;
    if (filter === 'buys') return t.side === 'buy';
    if (filter === 'sells') return t.side === 'sell';
    return true;
  });

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${Math.floor(d.getMilliseconds() / 100)}`;
  };

  const formatSize = (size: number) => {
    if (size >= 1000) return `${(size / 1000).toFixed(2)}K`;
    return size.toFixed(size >= 1 ? 2 : 4);
  };

  const resetStats = () => {
    setStats({ buyVol: 0, sellVol: 0, trades: 0 });
  };

  // Buy-side share of delta (headline value — flashes on change). P8 motion.
  const totalVol = stats.buyVol + stats.sellVol;
  const buyPct = totalVol > 0 ? Math.round((stats.buyVol / totalVol) * 100) : 50;
  const deltaFlash = useValueFlash(buyPct);

  return (
    <div
      ref={containerRef}
      className="flex flex-col"
      style={{ width, height, background: COLORS.background, fontFamily: 'var(--font-jetbrains-mono)' }}
    >
      {/* Header */}
      <div className="panel-glass px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-display text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Time &amp; Sales</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="px-1.5 py-0.5 rounded transition-colors flex items-center justify-center"
              style={{
                background: isPaused ? 'rgb(var(--warning-rgb) / 0.15)' : 'var(--surface-elevated)',
                color: isPaused ? 'var(--warning)' : 'var(--text-muted)',
              }}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play size={11} strokeWidth={1.5} /> : <Pause size={11} strokeWidth={1.5} />}
            </button>
            <button
              onClick={resetStats}
              className="px-1.5 py-0.5 rounded transition-colors flex items-center justify-center"
              style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
              title="Reset stats"
            >
              <RotateCcw size={11} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Filter buttons */}
        <Segment
          options={[
            { id: 'all', label: 'All' },
            { id: 'large', label: 'Large' },
            { id: 'buys', label: 'Buys' },
            { id: 'sells', label: 'Sells' },
          ]}
          value={filter}
          onChange={setFilter}
          size="sm"
        />
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between px-2 py-1 border-b text-[10px]" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--bull)' }}>B: {formatSize(stats.buyVol)}</span>
          <span style={{ color: 'var(--bear)' }}>S: {formatSize(stats.sellVol)}</span>
        </div>
        <span style={{ color: 'var(--text-dimmed)' }}>#{stats.trades}</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-2 py-1 border-b text-[9px] uppercase" style={{ borderColor: 'var(--border)', color: 'var(--text-dimmed)' }}>
        <span className="w-16">Time</span>
        <span className="w-16 text-right">Price</span>
        <span className="w-14 text-right">Size</span>
        <span className="flex-1 text-right">Side</span>
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredTrades.map((trade, idx) => {
          const isBuy = trade.side === 'buy';
          const bgColor = trade.isLarge
            ? (isBuy ? COLORS.buyLargeBg : COLORS.sellLargeBg)
            : (isBuy ? COLORS.buyBg : COLORS.sellBg);
          const textColor = trade.isLarge
            ? (isBuy ? COLORS.buyLarge : COLORS.sellLarge)
            : (isBuy ? COLORS.buy : COLORS.sell);

          return (
            <div
              key={`${trade.id}-${idx}`}
              className="flex items-center px-2 py-0.5 border-b transition-colors"
              style={{
                borderColor: 'var(--border)',
                background: bgColor,
                animation: idx === 0 ? 'fadeIn 0.2s ease-out' : undefined,
              }}
            >
              <span className="w-16 text-[11px] tabular-nums" style={{ color: 'var(--text-dimmed)', fontFamily: 'var(--font-jetbrains-mono)' }}>
                {formatTime(trade.time)}
              </span>
              <span
                className="w-16 text-[11px] font-medium text-right tabular-nums"
                style={{ color: textColor, fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {trade.price.toFixed(2)}
              </span>
              <span
                className={`w-14 text-[11px] text-right tabular-nums ${
                  trade.isLarge ? 'font-bold' : ''
                }`}
                style={{ color: textColor, fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {formatSize(trade.size)}
              </span>
              <div className="flex-1 flex items-center justify-end gap-1">
                {trade.isAggressive && (
                  <Zap size={9} strokeWidth={1.5} style={{ color: 'var(--warning)' }} />
                )}
                {trade.isLarge && (
                  <Waves size={9} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                )}
                <span
                  className="text-[11px] font-medium"
                  style={{ color: textColor }}
                >
                  {isBuy ? 'BUY' : 'SELL'}
                </span>
              </div>
            </div>
          );
        })}

        {filteredTrades.length === 0 && (
          <div className="flex flex-col items-center justify-center h-20 gap-1.5">
            <Clock size={18} strokeWidth={1.5} style={{ color: 'var(--text-dimmed)', opacity: 0.4 }} />
            <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Waiting for trades...</span>
          </div>
        )}
      </div>

      {/* Delta bar at bottom */}
      <div className="panel-glass px-2 py-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-elevated)' }}>
          <div
            className="h-full transition-all duration-300"
            style={{
              background: 'var(--bull)',
              width: `${stats.buyVol + stats.sellVol > 0
                ? (stats.buyVol / (stats.buyVol + stats.sellVol)) * 100
                : 50}%`
            }}
          />
          <div
            className="h-full transition-all duration-300"
            style={{
              background: 'var(--bear)',
              width: `${stats.buyVol + stats.sellVol > 0
                ? (stats.sellVol / (stats.buyVol + stats.sellVol)) * 100
                : 50}%`
            }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px]">
          <span className={deltaFlash ? 'value-flash' : ''} style={{ color: 'var(--bull)' }}>
            {stats.buyVol + stats.sellVol > 0
              ? ((stats.buyVol / (stats.buyVol + stats.sellVol)) * 100).toFixed(0)
              : 50}%
          </span>
          <span style={{ color: 'var(--text-dimmed)' }}>Delta</span>
          <span style={{ color: 'var(--bear)' }}>
            {stats.buyVol + stats.sellVol > 0
              ? ((stats.sellVol / (stats.buyVol + stats.sellVol)) * 100).toFixed(0)
              : 50}%
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});
