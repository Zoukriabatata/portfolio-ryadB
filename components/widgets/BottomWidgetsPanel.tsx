'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getBinanceLiveWS } from '@/lib/live/BinanceLiveWS';
import { useOrderbookStore } from '@/stores/useOrderbookStore';
import { useTradingStore } from '@/stores/useTradingStore';
import { formatPrice, formatQty as fmtQtyUtil, formatTime as fmtTimeUtil, formatVolumeDollar } from '@/lib/utils/formatters';

type TabId = 'trades' | 'delta' | 'orderbook' | 'positions';

// Shared empty state component for consistency
function EmptyState({ message, icon }: { message: string; icon?: 'chart' | 'connection' | 'info' }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 animate-fadeIn" style={{ color: 'var(--text-dimmed)' }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface-elevated)]">
        {icon === 'chart' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={0.5}>
            <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
          </svg>
        ) : icon === 'connection' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={0.5}>
            <path d="M12 2a10 10 0 0110 10" /><path d="M12 6a6 6 0 016 6" /><path d="M12 10a2 2 0 012 2" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity={0.5}>
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
        )}
      </div>
      <span className="text-[10px] font-medium">{message}</span>
    </div>
  );
}

interface TradeEntry {
  id: number;
  price: number;
  qty: number;
  time: number;
  isBuy: boolean;
}

interface BottomWidgetsPanelProps {
  symbol: string;
}

// Trade color constants (semantic, single source of truth)
const TRADE_COLORS = {
  buy: 'var(--trade-buy, #34d399)',
  sell: 'var(--trade-sell, #f87171)',
  buyBg: 'var(--trade-buy-bg, rgba(16,185,129,0.06))',
  sellBg: 'var(--trade-sell-bg, rgba(239,68,68,0.06))',
  buyBgStrong: 'var(--trade-buy-bg-strong, rgba(16,185,129,0.15))',
  sellBgStrong: 'var(--trade-sell-bg-strong, rgba(239,68,68,0.15))',
  buyBgSubtle: 'var(--trade-buy-bg-subtle, rgba(16,185,129,0.04))',
  sellBgSubtle: 'var(--trade-sell-bg-subtle, rgba(239,68,68,0.04))',
  bidBar: 'var(--trade-bid-bar, #10b981)',
  askBar: 'var(--trade-ask-bar, #ef4444)',
  buyFill: 'var(--trade-buy-fill, rgba(52,211,153,0.08))',
  sellFill: 'var(--trade-sell-fill, rgba(248,113,113,0.08))',
  large: 'var(--trade-large, #eab308)',
} as const;

export default function BottomWidgetsPanel({ symbol }: BottomWidgetsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('trades');
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(180);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(180);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount to prevent leaked listeners
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startYRef.current - ev.clientY;
      setHeight(Math.max(100, Math.min(400, startHeightRef.current + delta)));
    };
    const handleUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      cleanupRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    cleanupRef.current = handleUp;
  }, [height]);

  const TABS: { id: TabId; label: string }[] = [
    { id: 'trades', label: 'Time & Sales' },
    { id: 'delta', label: 'Delta' },
    { id: 'orderbook', label: 'Order Book' },
    { id: 'positions', label: 'Positions' },
  ];

  return (
    <div
      className="flex flex-col border-t overflow-hidden relative"
      style={{
        height: collapsed ? 28 : height,
        transition: isDraggingRef.current ? 'none' : 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Resize handle with dot indicator */}
      {!collapsed && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 right-0 h-2 cursor-row-resize z-10 group"
        >
          <div className="absolute inset-x-0 top-0 h-full bg-[var(--primary)] opacity-0 group-hover:opacity-30 transition-opacity duration-200" />
          {/* Center dots — always visible at low opacity */}
          <div className="absolute top-[3px] left-1/2 -translate-x-1/2 flex gap-1">
            <div className="w-1 h-1 rounded-full bg-[var(--text-dimmed)] opacity-30 group-hover:opacity-80 group-hover:bg-[var(--primary)] transition-all duration-200" />
            <div className="w-1 h-1 rounded-full bg-[var(--text-dimmed)] opacity-30 group-hover:opacity-80 group-hover:bg-[var(--primary)] transition-all duration-200" />
            <div className="w-1 h-1 rounded-full bg-[var(--text-dimmed)] opacity-30 group-hover:opacity-80 group-hover:bg-[var(--primary)] transition-all duration-200" />
          </div>
        </div>
      )}
      {/* Tab bar / Collapsed bar */}
      <div
        className="flex items-center justify-between px-2 py-0.5 flex-shrink-0"
        style={{ borderBottom: collapsed ? 'none' : '1px solid var(--border)', minHeight: 28 }}
      >
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1.5 text-[10px] font-medium transition-colors hover:text-[var(--text-secondary)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 15l6-6 6 6" />
            </svg>
            Widgets
          </button>
        ) : (
          <>
            <div className="flex items-center gap-0.5">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-2.5 py-1 rounded text-[10px] font-medium transition-all button-press"
                  style={{
                    backgroundColor: activeTab === tab.id ? 'var(--background)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    transform: activeTab === tab.id ? 'scale(1)' : 'scale(0.96)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Content — unmount when collapsed to save resources */}
      {!collapsed && (
        <div key={activeTab} className="flex-1 overflow-hidden animate-tab-enter">
          {activeTab === 'trades' && <TimeSalesTab symbol={symbol} />}
          {activeTab === 'delta' && <DeltaTab symbol={symbol} />}
          {activeTab === 'orderbook' && <OrderBookTab />}
          {activeTab === 'positions' && <PositionsTab />}
        </div>
      )}
    </div>
  );
}

// ─── TIME & SALES TAB ───────────────────────────────────────────────

function TimeSalesTab({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    const ws = getBinanceLiveWS();
    const unsub = ws.onTick((tick) => {
      setTrades(prev => {
        const entry: TradeEntry = {
          id: ++idCounter.current,
          price: tick.price,
          qty: tick.quantity,
          time: tick.timestamp,
          isBuy: !tick.isBuyerMaker,
        };
        const next = [entry, ...prev];
        return next.length > 50 ? next.slice(0, 50) : next;
      });
    });
    return unsub;
  }, [symbol]);

  // Avg qty for highlighting large trades
  const avgQty = trades.length > 0 ? trades.reduce((s, t) => s + t.qty, 0) / trades.length : 0;

  return (
    <div className="h-full flex flex-col text-[11px] font-mono">
      <div className="flex items-center justify-between px-2 py-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
        <span className="w-16">Time</span>
        <span>Price</span>
        <span className="w-16 text-right">Size</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map(t => {
          const isLarge = t.qty > avgQty * 2.5;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between px-2 py-[1px]"
              style={{
                backgroundColor: isLarge
                  ? t.isBuy ? TRADE_COLORS.buyBg : TRADE_COLORS.sellBg
                  : undefined,
              }}
            >
              <span className="w-16" style={{ color: 'var(--text-dimmed)' }}>{fmtTimeUtil(t.time)}</span>
              <span style={{ color: t.isBuy ? TRADE_COLORS.buy : TRADE_COLORS.sell }}>{formatPrice(t.price)}</span>
              <span
                className="w-16 text-right"
                style={{ color: isLarge ? TRADE_COLORS.large : 'var(--text-muted)', fontWeight: isLarge ? 600 : 400 }}
              >
                {fmtQtyUtil(t.qty)}
              </span>
            </div>
          );
        })}
        {trades.length === 0 && <EmptyState message="Waiting for trades..." icon="chart" />}
      </div>
    </div>
  );
}

// ─── DELTA TAB ──────────────────────────────────────────────────────

function DeltaTab({ symbol }: { symbol: string }) {
  const [cumDelta, setCumDelta] = useState(0);
  const [deltaHistory, setDeltaHistory] = useState<number[]>([]);
  const [buyVol, setBuyVol] = useState(0);
  const [sellVol, setSellVol] = useState(0);

  useEffect(() => {
    setCumDelta(0);
    setDeltaHistory([]);
    setBuyVol(0);
    setSellVol(0);

    const ws = getBinanceLiveWS();
    let localDelta = 0;
    let localBuy = 0;
    let localSell = 0;

    const unsub = ws.onTick((tick) => {
      const vol = tick.price * tick.quantity;
      if (!tick.isBuyerMaker) {
        localDelta += vol;
        localBuy += vol;
      } else {
        localDelta -= vol;
        localSell += vol;
      }
      setCumDelta(localDelta);
      setBuyVol(localBuy);
      setSellVol(localSell);
      setDeltaHistory(prev => {
        const next = [...prev, localDelta];
        return next.length > 120 ? next.slice(-120) : next;
      });
    });
    return unsub;
  }, [symbol]);

  const chartH = 80;
  const { points, zeroY } = useMemo(() => {
    if (deltaHistory.length < 2) return { points: '', zeroY: chartH / 2 };
    let min = deltaHistory[0];
    let max = deltaHistory[0];
    for (let i = 1; i < deltaHistory.length; i++) {
      if (deltaHistory[i] < min) min = deltaHistory[i];
      if (deltaHistory[i] > max) max = deltaHistory[i];
    }
    const range = max - min || 1;
    const pts = deltaHistory.map((d, i) => {
      const x = (i / (deltaHistory.length - 1)) * 100;
      const y = ((max - d) / range) * chartH;
      return `${x},${y}`;
    }).join(' ');
    return { points: pts, zeroY: ((max - 0) / range) * chartH };
  }, [deltaHistory]);

  const totalVol = buyVol + sellVol;
  const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;

  return (
    <div className="h-full flex">
      {/* Chart area */}
      <div className="flex-1 relative">
        {deltaHistory.length > 1 ? (
          <svg viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none" className="w-full h-full">
            <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="var(--border, #3f3f46)" strokeWidth="0.5" strokeDasharray="2,2" />
            <polygon
              fill={cumDelta >= 0 ? TRADE_COLORS.buyFill : TRADE_COLORS.sellFill}
              points={`0,${zeroY} ${points} 100,${zeroY}`}
            />
            <polyline
              fill="none"
              stroke={cumDelta >= 0 ? TRADE_COLORS.buy : TRADE_COLORS.sell}
              strokeWidth="1.5"
              points={points}
            />
          </svg>
        ) : (
          <EmptyState message="Waiting for data..." icon="chart" />
        )}
      </div>

      {/* Stats sidebar */}
      <div className="w-32 flex flex-col justify-center gap-2 px-3 border-l" style={{ borderColor: 'var(--border)' }}>
        <div>
          <div className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Cum. Delta</div>
          <div
            className="text-sm font-mono font-bold"
            style={{ color: cumDelta >= 0 ? TRADE_COLORS.buy : TRADE_COLORS.sell }}
          >
            {formatVolumeDollar(Math.abs(cumDelta))}
          </div>
        </div>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-dimmed)' }}>Buy / Sell Vol</div>
          <div className="h-1.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--background)' }}>
            <div className="h-full transition-all duration-300" style={{ width: `${buyPct}%`, backgroundColor: TRADE_COLORS.bidBar }} />
            <div className="h-full transition-all duration-300" style={{ width: `${100 - buyPct}%`, backgroundColor: TRADE_COLORS.askBar }} />
          </div>
          <div className="flex justify-between text-[10px] mt-0.5">
            <span style={{ color: TRADE_COLORS.buy }}>{formatVolumeDollar(buyVol)}</span>
            <span style={{ color: TRADE_COLORS.sell }}>{formatVolumeDollar(sellVol)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ORDER BOOK TAB ─────────────────────────────────────────────────

function OrderBookTab() {
  const { bids, asks, spread, midPrice } = useOrderbookStore();

  const topBids = useMemo(() => {
    return Array.from(bids.entries())
      .sort(([a], [b]) => b - a)
      .slice(0, 8);
  }, [bids]);

  const topAsks = useMemo(() => {
    return Array.from(asks.entries())
      .sort(([a], [b]) => a - b)
      .slice(0, 8);
  }, [asks]);

  const maxQty = useMemo(() => {
    const allQty = [...topBids.map(([, q]) => q), ...topAsks.map(([, q]) => q)];
    return Math.max(...allQty, 0.001);
  }, [topBids, topAsks]);

  if (midPrice === 0) {
    return <EmptyState message="Waiting for orderbook..." icon="connection" />;
  }

  return (
    <div className="h-full flex text-[11px] font-mono">
      {/* Bids */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between px-2 py-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          <span>Size</span><span>Bid</span>
        </div>
        <div className="flex-1 flex flex-col-reverse overflow-hidden">
          {topBids.map(([price, qty]) => (
            <div key={price} className="flex items-center justify-between px-2 py-[1px] relative">
              <div
                className="absolute inset-y-0 right-0 opacity-15"
                style={{ width: `${(qty / maxQty) * 100}%`, backgroundColor: TRADE_COLORS.bidBar }}
              />
              <span className="relative" style={{ color: 'var(--text-muted)' }}>{fmtQtyUtil(qty)}</span>
              <span className="relative" style={{ color: TRADE_COLORS.buy }}>{formatPrice(price)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spread */}
      <div className="flex flex-col items-center justify-center px-2" style={{ minWidth: 60 }}>
        <div className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Spread</div>
        <div className="font-semibold" style={{ color: 'var(--text-muted)' }}>
          {spread.toFixed(2)}
        </div>
      </div>

      {/* Asks */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between px-2 py-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          <span>Ask</span><span>Size</span>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          {topAsks.map(([price, qty]) => (
            <div key={price} className="flex items-center justify-between px-2 py-[1px] relative">
              <div
                className="absolute inset-y-0 left-0 opacity-15"
                style={{ width: `${(qty / maxQty) * 100}%`, backgroundColor: TRADE_COLORS.askBar }}
              />
              <span className="relative" style={{ color: TRADE_COLORS.sell }}>{formatPrice(price)}</span>
              <span className="relative" style={{ color: 'var(--text-muted)' }}>{fmtQtyUtil(qty)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── POSITIONS TAB ─────────────────────────────────────────────────

function PositionsTab() {
  const { positions, orders, activeBroker, connections, closePosition } = useTradingStore();

  const isConnected = activeBroker && connections[activeBroker]?.connected;
  const balance = activeBroker ? connections[activeBroker]?.balance || 0 : 0;
  const currency = activeBroker ? connections[activeBroker]?.currency || 'USD' : 'USD';

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const filledOrders = orders.filter(o => o.status === 'filled').slice(0, 10);

  const fmtPnl = (v: number) => `${v >= 0 ? '+' : ''}$${v.toFixed(2)}`;

  if (!isConnected) {
    return <EmptyState message="Connect a broker to view positions" icon="connection" />;
  }

  return (
    <div className="h-full flex text-[11px] font-mono">
      {/* Positions */}
      <div className="flex-1 flex flex-col border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-2 py-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          <span>Open Positions</span>
          <span style={{ color: totalPnl >= 0 ? TRADE_COLORS.buy : TRADE_COLORS.sell, fontWeight: 600 }}>
            PnL: {fmtPnl(totalPnl)}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {positions.length === 0 ? (
            <EmptyState message="No open positions" />
          ) : (
            positions.map((pos, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-2 py-1 hover:bg-white/[0.02]"
                style={{
                  backgroundColor: pos.pnl >= 0 ? TRADE_COLORS.buyBgSubtle : TRADE_COLORS.sellBgSubtle,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold px-1 rounded"
                    style={{
                      backgroundColor: pos.side === 'buy' ? TRADE_COLORS.buyBgStrong : TRADE_COLORS.sellBgStrong,
                      color: pos.side === 'buy' ? TRADE_COLORS.buy : TRADE_COLORS.sell,
                    }}
                  >
                    {pos.side === 'buy' ? 'LONG' : 'SHORT'}
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{pos.symbol}</span>
                  <span style={{ color: 'var(--text-muted)' }}>×{pos.quantity}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>@ {formatPrice(pos.entryPrice)}</span>
                  <span style={{ color: pos.pnl >= 0 ? TRADE_COLORS.buy : TRADE_COLORS.sell, fontWeight: 600 }}>
                    {fmtPnl(pos.pnl)} ({pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                  </span>
                  <button
                    onClick={() => closePosition(pos.symbol)}
                    className="text-[10px] px-1.5 py-0.5 rounded hover:bg-red-500/20 transition-colors"
                    style={{ color: TRADE_COLORS.sell }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Orders + Balance */}
      <div className="w-48 flex flex-col">
        {/* Balance */}
        <div className="px-2 py-1 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Balance</div>
          <div className="font-bold" style={{ color: 'var(--text-primary)' }}>
            {balance.toLocaleString()} {currency}
          </div>
        </div>

        {/* Recent fills */}
        <div className="px-2 py-0.5 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Recent Fills</div>
        <div className="flex-1 overflow-y-auto">
          {filledOrders.length === 0 ? (
            <div className="px-2 py-1 text-[10px]" style={{ color: 'var(--text-dimmed)' }}>No fills yet</div>
          ) : (
            filledOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between px-2 py-0.5">
                <span
                  style={{ color: order.side === 'buy' ? TRADE_COLORS.buy : TRADE_COLORS.sell, fontSize: 10 }}
                >
                  {order.side === 'buy' ? 'B' : 'S'} {order.quantity}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  @ {formatPrice(order.avgFillPrice || 0)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
