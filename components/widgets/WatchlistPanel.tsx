'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import { useWatchlistStore, type WatchlistItem } from '@/stores/useWatchlistStore';
import { formatPrice, formatVolume } from '@/lib/utils/formatters';

interface WatchlistPanelProps {
  activeSymbol: string;
  onSymbolSelect: (symbol: string) => void;
}

// Sparkline mini chart (canvas-based for perf)
function Sparkline({ data, color, width = 48, height = 18 }: { data: number[]; color: string; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((data[i] - min) / range) * (height - 2) - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [data, color, width, height]);

  return <canvas ref={canvasRef} style={{ width, height }} />;
}

export default function WatchlistPanel({ activeSymbol, onSymbolSelect }: WatchlistPanelProps) {
  const { items, prices, removeItem, addItem, updatePrice } = useWatchlistStore();
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isActive = usePageActive();

  // Stable symbol list key to avoid reconnecting on every reorder
  const symbolsKey = useMemo(() => items.map((i) => i.symbol).sort().join(','), [items]);

  // Connect mini-ticker WebSocket for all watchlist symbols — paused when page hidden
  useEffect(() => {
    if (!isActive) return;
    const symbols = symbolsKey.split(',').filter(Boolean);
    if (symbols.length === 0) return;

    // Use combined stream for all symbols
    const streams = symbols.map((s) => `${s}@miniTicker`).join('/');
    const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
    // Throttle sparkline updates — only add a new point every 2s per symbol
    const lastSparklineUpdate: Record<string, number> = {};

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const data = msg.data;
        if (!data || !data.s) return;

        const symbol = data.s.toLowerCase();
        const price = parseFloat(data.c);
        const change24h = parseFloat(data.c) - parseFloat(data.o);
        const changePercent24h = parseFloat(data.o) > 0 ? (change24h / parseFloat(data.o)) * 100 : 0;

        const existing = useWatchlistStore.getState().prices[symbol];
        const now = Date.now();
        let newSparkline = existing?.sparkline || [];

        // Only add sparkline point every 2 seconds
        if (!lastSparklineUpdate[symbol] || now - lastSparklineUpdate[symbol] >= 2000) {
          newSparkline = [...newSparkline, price].slice(-20);
          lastSparklineUpdate[symbol] = now;
        }

        updatePrice(symbol, {
          price,
          prevPrice: existing?.price || price,
          change24h,
          changePercent24h,
          high24h: parseFloat(data.h),
          low24h: parseFloat(data.l),
          volume24h: parseFloat(data.v),
          sparkline: newSparkline,
        });
      } catch { /* ignore parse errors */ }
    };

    return () => {
      ws.close();
    };
  }, [isActive, symbolsKey, updatePrice]);

  const fmtPrice = formatPrice;
  const fmtVol = formatVolume;

  const ADDABLE_SYMBOLS: WatchlistItem[] = [
    { symbol: 'btcusdt', label: 'BTC/USDT', category: 'crypto' },
    { symbol: 'ethusdt', label: 'ETH/USDT', category: 'crypto' },
    { symbol: 'solusdt', label: 'SOL/USDT', category: 'crypto' },
    { symbol: 'xrpusdt', label: 'XRP/USDT', category: 'crypto' },
    { symbol: 'dogeusdt', label: 'DOGE/USDT', category: 'crypto' },
    { symbol: 'adausdt', label: 'ADA/USDT', category: 'crypto' },
    { symbol: 'avaxusdt', label: 'AVAX/USDT', category: 'crypto' },
    { symbol: 'dotusdt', label: 'DOT/USDT', category: 'crypto' },
    { symbol: 'linkusdt', label: 'LINK/USDT', category: 'crypto' },
    { symbol: 'maticusdt', label: 'MATIC/USDT', category: 'crypto' },
    { symbol: 'bnbusdt', label: 'BNB/USDT', category: 'crypto' },
    { symbol: 'ltcusdt', label: 'LTC/USDT', category: 'crypto' },
    { symbol: 'arbusdt', label: 'ARB/USDT', category: 'crypto' },
    { symbol: 'opusdt', label: 'OP/USDT', category: 'crypto' },
    { symbol: 'suiusdt', label: 'SUI/USDT', category: 'crypto' },
    { symbol: 'aptusdt', label: 'APT/USDT', category: 'crypto' },
    { symbol: 'nearusdt', label: 'NEAR/USDT', category: 'crypto' },
    { symbol: 'aaveusdt', label: 'AAVE/USDT', category: 'crypto' },
    { symbol: 'uniusdt', label: 'UNI/USDT', category: 'crypto' },
    { symbol: 'pepeusdt', label: 'PEPE/USDT', category: 'crypto' },
  ];

  const filteredAddable = ADDABLE_SYMBOLS.filter(
    (s) => !items.some((i) => i.symbol === s.symbol) && (
      searchQuery === '' ||
      s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="h-full flex flex-col text-[11px]" style={{ backgroundColor: 'var(--surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Watchlist
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
          style={{ color: showAdd ? 'var(--primary)' : 'var(--text-muted)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Add symbol dropdown */}
      {showAdd && (
        <div className="border-b px-2 py-1.5 space-y-1" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbol..."
            className="w-full px-2 py-1 rounded text-[11px] focus:outline-none"
            style={{ backgroundColor: 'var(--background)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            autoFocus
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {filteredAddable.slice(0, 8).map((s) => (
              <button
                key={s.symbol}
                onClick={() => {
                  addItem(s);
                  setSearchQuery('');
                  setShowAdd(false);
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-white/5 transition-colors flex items-center justify-between"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="font-medium">{s.label}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Symbols list */}
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => {
          const data = prices[item.symbol];
          const isActive = item.symbol === activeSymbol;
          const isUp = data ? data.changePercent24h >= 0 : true;
          const color = isUp ? 'var(--trade-buy, #34d399)' : 'var(--trade-sell, #f87171)';

          return (
            <div
              key={item.symbol}
              onClick={() => onSymbolSelect(item.symbol)}
              className="flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors group"
              style={{
                backgroundColor: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-semibold truncate" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 11 }}>
                  {item.label}
                </span>
                {data && (
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                    Vol {fmtVol(data.volume24h)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Sparkline */}
                {data && data.sparkline.length > 2 && (
                  <Sparkline data={data.sparkline} color={isUp ? '#34d399' : '#f87171'} />
                )}

                <div className="flex flex-col items-end">
                  {data ? (
                    <>
                      <span className="font-mono font-medium" style={{ color, fontSize: 11 }}>
                        {fmtPrice(data.price)}
                      </span>
                      <span className="text-[9px] font-mono" style={{ color }}>
                        {data.changePercent24h >= 0 ? '+' : ''}{data.changePercent24h.toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>...</span>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(item.symbol); }}
                  className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
