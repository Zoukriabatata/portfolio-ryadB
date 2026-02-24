'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { usePageActive } from '@/hooks/usePageActive';
import {
  useWatchlistStore,
  type WatchlistItem,
  type CryptoSubCategory,
  CRYPTO_CATEGORIES,
} from '@/stores/useWatchlistStore';
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

    let min = Infinity, max = -Infinity;
    for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
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

type SortBy = 'default' | 'change' | 'volume' | 'name';
type FilterCategory = 'all' | CryptoSubCategory;

const CATEGORY_COLORS: Record<CryptoSubCategory, string> = {
  top10: '#3b82f6',
  defi: '#8b5cf6',
  layer1: '#f59e0b',
  layer2: '#06b6d4',
  meme: '#ec4899',
};

const ADDABLE_SYMBOLS: WatchlistItem[] = [
  // Top 10
  { symbol: 'btcusdt', label: 'BTC/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'ethusdt', label: 'ETH/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'solusdt', label: 'SOL/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'xrpusdt', label: 'XRP/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'bnbusdt', label: 'BNB/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'adausdt', label: 'ADA/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'tonusdt', label: 'TON/USDT', category: 'crypto', subCategory: 'top10' },
  { symbol: 'trxusdt', label: 'TRX/USDT', category: 'crypto', subCategory: 'top10' },
  // Layer 1
  { symbol: 'avaxusdt', label: 'AVAX/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'suiusdt', label: 'SUI/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'aptusdt', label: 'APT/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'nearusdt', label: 'NEAR/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'atomusdt', label: 'ATOM/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'dotusdt', label: 'DOT/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'ftmusdt', label: 'FTM/USDT', category: 'crypto', subCategory: 'layer1' },
  { symbol: 'injusdt', label: 'INJ/USDT', category: 'crypto', subCategory: 'layer1' },
  // Layer 2
  { symbol: 'arbusdt', label: 'ARB/USDT', category: 'crypto', subCategory: 'layer2' },
  { symbol: 'opusdt', label: 'OP/USDT', category: 'crypto', subCategory: 'layer2' },
  { symbol: 'maticusdt', label: 'MATIC/USDT', category: 'crypto', subCategory: 'layer2' },
  // DeFi
  { symbol: 'linkusdt', label: 'LINK/USDT', category: 'crypto', subCategory: 'defi' },
  { symbol: 'aaveusdt', label: 'AAVE/USDT', category: 'crypto', subCategory: 'defi' },
  { symbol: 'uniusdt', label: 'UNI/USDT', category: 'crypto', subCategory: 'defi' },
  { symbol: 'runeusdt', label: 'RUNE/USDT', category: 'crypto', subCategory: 'defi' },
  { symbol: 'jupusdt', label: 'JUP/USDT', category: 'crypto', subCategory: 'defi' },
  // Meme
  { symbol: 'dogeusdt', label: 'DOGE/USDT', category: 'crypto', subCategory: 'meme' },
  { symbol: 'shibusdt', label: 'SHIB/USDT', category: 'crypto', subCategory: 'meme' },
  { symbol: 'pepeusdt', label: 'PEPE/USDT', category: 'crypto', subCategory: 'meme' },
  { symbol: 'tiausdt', label: 'TIA/USDT', category: 'crypto', subCategory: 'meme' },
  { symbol: 'ltcusdt', label: 'LTC/USDT', category: 'crypto', subCategory: 'top10' },
];

export default function WatchlistPanel({ activeSymbol, onSymbolSelect }: WatchlistPanelProps) {
  const { items, prices, removeItem, addItem, updatePrice } = useWatchlistStore();
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [addCategory, setAddCategory] = useState<FilterCategory>('all');
  const isActive = usePageActive();

  // Stable symbol list key to avoid reconnecting on every reorder
  const symbolsKey = useMemo(() => items.map((i) => i.symbol).sort().join(','), [items]);

  // Connect mini-ticker WebSocket for all watchlist symbols — paused when page hidden
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSparklineUpdateRef = useRef<Record<string, number>>({});

  const connectWatchlistWS = useCallback(() => {
    const symbols = symbolsKey.split(',').filter(Boolean);
    if (symbols.length === 0) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const streams = symbols.map((s) => `${s}@miniTicker`).join('/');
    const ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streams}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const data = msg.data;
        if (!data || !data.s) return;

        const sym = data.s.toLowerCase();
        const price = parseFloat(data.c);
        const change24h = parseFloat(data.c) - parseFloat(data.o);
        const changePercent24h = parseFloat(data.o) > 0 ? (change24h / parseFloat(data.o)) * 100 : 0;

        const existing = useWatchlistStore.getState().prices[sym];
        const now = Date.now();
        let newSparkline = existing?.sparkline || [];

        // Only add sparkline point every 2 seconds
        const lastUpdate = lastSparklineUpdateRef.current;
        if (!lastUpdate[sym] || now - lastUpdate[sym] >= 2000) {
          newSparkline = [...newSparkline, price].slice(-20);
          lastUpdate[sym] = now;
        }

        updatePrice(sym, {
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

    // Auto-reconnect on close (with backoff)
    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWatchlistWS();
      }, 3000);
    };

    ws.onerror = () => {
      // onclose will fire after this, triggering reconnect
    };
  }, [symbolsKey, updatePrice]);

  useEffect(() => {
    if (!isActive) {
      // Cleanup when page hidden
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    connectWatchlistWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isActive, connectWatchlistWS]);

  // Filter + sort items
  const filteredSortedItems = useMemo(() => {
    let result = items;

    // Apply category filter
    if (filterCategory !== 'all') {
      result = result.filter((i) => i.subCategory === filterCategory);
    }

    // Apply sort
    if (sortBy === 'default') return result;
    return [...result].sort((a, b) => {
      const da = prices[a.symbol];
      const db = prices[b.symbol];
      if (sortBy === 'change') {
        return (db?.changePercent24h || 0) - (da?.changePercent24h || 0);
      }
      if (sortBy === 'volume') {
        return (db?.volume24h || 0) - (da?.volume24h || 0);
      }
      // name
      return a.label.localeCompare(b.label);
    });
  }, [items, prices, sortBy, filterCategory]);

  const fmtPrice = formatPrice;
  const fmtVol = formatVolume;

  // Filter addable symbols by category and search
  const filteredAddable = useMemo(() => {
    return ADDABLE_SYMBOLS.filter(
      (s) =>
        !items.some((i) => i.symbol === s.symbol) &&
        (addCategory === 'all' || s.subCategory === addCategory) &&
        (searchQuery === '' ||
          s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [items, addCategory, searchQuery]);

  // Group addable by subcategory for display
  const groupedAddable = useMemo(() => {
    if (addCategory !== 'all') return null; // flat list when filtered
    const groups: Partial<Record<CryptoSubCategory, WatchlistItem[]>> = {};
    for (const s of filteredAddable) {
      const cat = s.subCategory || 'top10';
      if (!groups[cat]) groups[cat] = [];
      groups[cat]!.push(s);
    }
    return groups;
  }, [filteredAddable, addCategory]);

  const categoryFilterTabs: { key: FilterCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    ...Object.entries(CRYPTO_CATEGORIES).map(([k, v]) => ({ key: k as FilterCategory, label: v })),
  ];

  return (
    <div className="h-full flex flex-col text-[11px]" style={{ backgroundColor: 'var(--surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Watchlist
        </h3>
        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-[9px] bg-transparent border rounded px-1 py-0.5 focus:outline-none cursor-pointer"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            <option value="default">Default</option>
            <option value="change">% Change</option>
            <option value="volume">Volume</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => { setShowAdd(!showAdd); setSearchQuery(''); setAddCategory('all'); }}
            aria-label={showAdd ? 'Close add symbol' : 'Add symbol'}
            aria-expanded={showAdd}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ color: showAdd ? 'var(--primary)' : 'var(--text-muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {showAdd ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        {categoryFilterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterCategory(tab.key)}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: filterCategory === tab.key ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: filterCategory === tab.key
                ? (tab.key === 'all' ? 'var(--primary)' : CATEGORY_COLORS[tab.key as CryptoSubCategory] || 'var(--primary)')
                : 'var(--text-dimmed)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Add symbol dropdown */}
      {showAdd && (
        <div className="border-b px-2 py-1.5 space-y-1.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-elevated)' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbol..."
            aria-label="Search symbol to add"
            className="w-full px-2 py-1 rounded text-[11px] focus:outline-none"
            style={{ backgroundColor: 'var(--background)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            autoFocus
          />
          {/* Category tabs for add panel */}
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {categoryFilterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setAddCategory(tab.key)}
                className="px-1.5 py-0.5 rounded text-[8px] font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: addCategory === tab.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: addCategory === tab.key
                    ? (tab.key === 'all' ? 'var(--primary)' : CATEGORY_COLORS[tab.key as CryptoSubCategory] || 'var(--primary)')
                    : 'var(--text-dimmed)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {addCategory === 'all' && groupedAddable ? (
              // Grouped view
              Object.entries(groupedAddable).map(([cat, symbols]) => (
                <div key={cat}>
                  <div className="text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 mt-1" style={{ color: CATEGORY_COLORS[cat as CryptoSubCategory] || 'var(--text-dimmed)' }}>
                    {CRYPTO_CATEGORIES[cat as CryptoSubCategory] || cat}
                  </div>
                  {symbols.map((s) => (
                    <AddSymbolRow key={s.symbol} item={s} onAdd={(item) => { addItem(item); setSearchQuery(''); setShowAdd(false); }} />
                  ))}
                </div>
              ))
            ) : (
              // Flat filtered list
              filteredAddable.slice(0, 15).map((s) => (
                <AddSymbolRow key={s.symbol} item={s} onAdd={(item) => { addItem(item); setSearchQuery(''); setShowAdd(false); }} />
              ))
            )}
            {filteredAddable.length === 0 && (
              <div className="text-center py-2 text-[9px]" style={{ color: 'var(--text-dimmed)' }}>No symbols found</div>
            )}
          </div>
        </div>
      )}

      {/* Symbols list */}
      <div className="flex-1 overflow-y-auto">
        {filteredSortedItems.map((item) => {
          const data = prices[item.symbol];
          const isItemActive = item.symbol === activeSymbol;
          const isUp = data ? data.changePercent24h >= 0 : true;
          const color = isUp ? 'var(--bull)' : 'var(--bear)';
          const catColor = item.subCategory ? CATEGORY_COLORS[item.subCategory] : undefined;

          return (
            <div
              key={item.symbol}
              onClick={() => onSymbolSelect(item.symbol)}
              className="flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors group"
              style={{
                backgroundColor: isItemActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                borderLeft: isItemActive ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold truncate" style={{ color: isItemActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 11 }}>
                    {item.label}
                  </span>
                  {catColor && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: catColor }}
                      title={item.subCategory ? CRYPTO_CATEGORIES[item.subCategory] : ''}
                    />
                  )}
                </div>
                {data && (
                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
                    Vol {fmtVol(data.volume24h)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Sparkline */}
                {data && data.sparkline.length > 2 && (
                  <Sparkline data={data.sparkline} color={isUp ? 'var(--bull)' : 'var(--bear)'} />
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
                  aria-label={`Remove ${item.label}`}
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
        {filteredSortedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-4 gap-1">
            <span className="text-[9px]" style={{ color: 'var(--text-dimmed)' }}>No symbols in this category</span>
            <button
              onClick={() => setFilterCategory('all')}
              className="text-[9px] font-medium"
              style={{ color: 'var(--primary)' }}
            >
              Show all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small row component for add-symbol list */
function AddSymbolRow({ item, onAdd }: { item: WatchlistItem; onAdd: (item: WatchlistItem) => void }) {
  const catColor = item.subCategory ? CATEGORY_COLORS[item.subCategory] : undefined;
  return (
    <button
      onClick={() => onAdd(item)}
      className="w-full text-left px-2 py-1 rounded hover:bg-white/5 transition-colors flex items-center justify-between"
      style={{ color: 'var(--text-secondary)' }}
    >
      <div className="flex items-center gap-1.5">
        {catColor && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
        <span className="font-medium text-[11px]">{item.label}</span>
      </div>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
