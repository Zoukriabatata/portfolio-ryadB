'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useTradingStore, BROKER_INFO, type OrderType } from '@/stores/useTradingStore';
import { useFuturesStore } from '@/stores/useFuturesStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useAccountRulesStore } from '@/stores/useAccountRulesStore';
import DemoAccountPanel from './DemoAccountPanel';

/** Poll /api/spot-price every 5s; returns 0 while loading or on error */
function useSpotPrice(symbol: string): number {
  const [price, setPrice] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function fetch_() {
      try {
        const res = await fetch(`/api/spot-price?ticker=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const data = await res.json() as { price?: number };
        if (!cancelled && typeof data.price === 'number' && data.price > 0) setPrice(data.price);
      } catch { /* network error — keep previous price */ }
    }
    fetch_();
    const id = setInterval(fetch_, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbol]);
  return price;
}

function getTickSize(symbol: string): { tick: number; decimals: number } {
  const s = symbol.toUpperCase();
  if (s.includes('BTC')) return { tick: 0.10, decimals: 2 };
  if (s.includes('ETH')) return { tick: 0.01, decimals: 2 };
  if (s.includes('SOL') || s.includes('AVAX') || s.includes('DOGE') || s.includes('XRP'))
    return { tick: 0.0001, decimals: 4 };
  if (s.includes('SHIB') || s.includes('PEPE') || s.includes('FLOKI'))
    return { tick: 0.00000001, decimals: 8 };
  if (s.includes('ES') || s.includes('NQ') || s.includes('YM'))
    return { tick: 0.25, decimals: 2 };
  if (s.includes('CL')) return { tick: 0.01, decimals: 2 };
  if (s.includes('GC')) return { tick: 0.10, decimals: 2 };
  return { tick: 0.01, decimals: 2 };
}

type RRPreset = '1:1' | '1:2' | '1:3' | 'off';

interface QuickTradeBarProps {
  symbol: string;
  colors: {
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    success: string;
    error: string;
    background: string;
  };
}

export default function QuickTradeBar({ symbol, colors }: QuickTradeBarProps) {
  const {
    activeBroker,
    connections,
    contractQuantity,
    setContractQuantity,
    placeOrder,
    cancelOrder,
    closePosition,
    positions,
    orders,
    connect,
  } = useTradingStore(
    useShallow(s => ({
      activeBroker: s.activeBroker,
      connections: s.connections,
      contractQuantity: s.contractQuantity,
      setContractQuantity: s.setContractQuantity,
      placeOrder: s.placeOrder,
      cancelOrder: s.cancelOrder,
      closePosition: s.closePosition,
      positions: s.positions,
      orders: s.orders,
      connect: s.connect,
    }))
  );

  const markPrice = useFuturesStore(s => s.markPrice);
  const marketPrice = useMarketStore((s) => s.currentPrice);
  const spotPrice = useSpotPrice(symbol);

  // Account rules — read live so the trade bar reflects locked / passed state
  const { rulesEnabled, accountState, lockedReason } = useAccountRulesStore(
    useShallow(s => ({
      rulesEnabled: s.enabled,
      accountState: s.accountState,
      lockedReason: s.lockedReason,
    })),
  );
  const accountBlocked = rulesEnabled && (accountState === 'LOCKED' || accountState === 'PASSED');

  const { tick, decimals } = useMemo(() => getTickSize(symbol), [symbol]);

  // Priority: live WebSocket price > futures mark price > spot API
  const currentPrice = marketPrice || markPrice || spotPrice || 0;

  // Auto-connect to demo if no broker is active
  useEffect(() => {
    if (!activeBroker) {
      connect('demo');
    }
  }, []);

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');

  // Auto-fill limit/stop price when switching order type OR when live price first arrives
  useEffect(() => {
    if (currentPrice <= 0) return;
    if ((orderType === 'limit' || orderType === 'stop_limit') && !limitPrice) {
      setLimitPrice(currentPrice.toFixed(decimals));
    }
    if ((orderType === 'stop' || orderType === 'stop_limit') && !stopPrice) {
      setStopPrice(currentPrice.toFixed(decimals));
    }
  }, [orderType, currentPrice]);
  const [lastAction, setLastAction] = useState<{ side: 'buy' | 'sell'; time: number } | null>(null);
  const [showDemoPanel, setShowDemoPanel] = useState(false);

  // Bracket order state (TP + SL)
  const [bracketEnabled, setBracketEnabled] = useState(false);
  const [rrPreset, setRrPreset] = useState<RRPreset>('off');
  const [tpOffset, setTpOffset] = useState(''); // offset from entry in price units
  const [slOffset, setSlOffset] = useState(''); // offset from entry in price units

  const lastActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spam-friendly per-side gate. Refs so the check is synchronous — no
  // React re-render needed between clicks (the previous `isSubmitting`
  // state was the source of perceived spam-click latency).
  // 25ms = 40 fires/sec per side, faster than any human can spam.
  const SPAM_GATE_MS = 25;
  const lastFireRef    = useRef<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  // Throttle toasts so spamming 10 buys in 1s doesn't stack 10 toasts.
  const lastToastRef   = useRef<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  const TOAST_THROTTLE_MS = 250;

  useEffect(() => {
    return () => { if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current); };
  }, []);

  // Auto-calculate TP/SL when R:R preset changes
  useEffect(() => {
    if (rrPreset === 'off') return;
    const sl = parseFloat(slOffset);
    if (!sl || sl <= 0) return;
    const ratio = rrPreset === '1:1' ? 1 : rrPreset === '1:2' ? 2 : 3;
    setTpOffset((sl * ratio).toFixed(decimals));
  }, [rrPreset, slOffset, decimals]);

  const isConnected = activeBroker && connections[activeBroker]?.connected;

  const handleTrade = useCallback((side: 'buy' | 'sell') => {
    if (!activeBroker) {
      toast.error('No broker selected — open Data Feeds to configure one');
      return;
    }
    if (!isConnected) {
      toast.error(`Broker ${activeBroker} not connected`);
      return;
    }

    // Account rules guard — clear feedback before even firing the order
    if (accountBlocked) {
      toast.error(
        accountState === 'PASSED'
          ? `Challenge passed — open a new account to keep trading.`
          : `Account locked: ${lockedReason ?? 'risk limit hit'}`,
        { duration: 2500 },
      );
      return;
    }

    // Spam gate (synchronous via ref — no React render needed)
    const now = performance.now();
    if (now - lastFireRef.current[side] < SPAM_GATE_MS) return;
    lastFireRef.current[side] = now;

    const isLimit = orderType === 'limit' || orderType === 'stop_limit';
    const isStop  = orderType === 'stop'  || orderType === 'stop_limit';

    const price = isLimit ? parseFloat(limitPrice) : currentPrice;
    if (isLimit && (isNaN(price) || price <= 0)) {
      toast.error('Invalid limit price');
      return;
    }
    const stp = isStop ? parseFloat(stopPrice) : undefined;
    if (isStop && (!stp || isNaN(stp) || stp <= 0)) {
      toast.error('Invalid stop price');
      return;
    }

    // Optimistic visual feedback — fires immediately on click
    setLastAction({ side, time: Date.now() });
    if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
    lastActionTimerRef.current = setTimeout(() => setLastAction(null), 500);

    // Fire-and-forget the order. placeOrder is synchronous internally for
    // demo market orders — the store mutation lands on the same tick — but
    // we don't AWAIT it so the click handler returns instantly and the
    // next click is unblocked immediately.
    const promise = placeOrder({
      broker:      activeBroker,
      symbol:      symbol.toUpperCase(),
      side,
      type:        orderType,
      quantity:    contractQuantity,
      price:       isLimit ? price : undefined,
      stopPrice:   stp,
      marketPrice: currentPrice,
    });

    // Toast handling — throttled per side so spam doesn't stack 10 toasts.
    promise.then(result => {
      const t = performance.now();
      if (t - lastToastRef.current[side] < TOAST_THROTTLE_MS) return;
      lastToastRef.current[side] = t;
      if (result) {
        const fillPrice = result.avgFillPrice ?? price;
        toast.success(
          `${side === 'buy' ? 'BUY' : 'SELL'} ${contractQuantity} ${symbol.toUpperCase()} @ ${fillPrice.toFixed(decimals)}`,
          { duration: 900 },
        );
      } else {
        toast.error('Order failed', { duration: 1200 });
      }
    });

    // Bracket orders (TP + SL) — fired in parallel after main resolves so
    // they get the actual entry price.
    if (bracketEnabled) {
      promise.then(() => {
        const tp = parseFloat(tpOffset);
        const sl = parseFloat(slOffset);
        const entryPrice = isLimit ? price : currentPrice;
        const oppositeSide = side === 'buy' ? 'sell' : 'buy';

        if (tp > 0) {
          const tpPrice = side === 'buy' ? entryPrice + tp : entryPrice - tp;
          placeOrder({
            broker:      activeBroker,
            symbol:      symbol.toUpperCase(),
            side:        oppositeSide,
            type:        'limit',
            quantity:    contractQuantity,
            price:       parseFloat(tpPrice.toFixed(decimals)),
            marketPrice: currentPrice,
          });
        }

        if (sl > 0) {
          const slPrice = side === 'buy' ? entryPrice - sl : entryPrice + sl;
          placeOrder({
            broker:      activeBroker,
            symbol:      symbol.toUpperCase(),
            side:        oppositeSide,
            type:        'stop',
            quantity:    contractQuantity,
            stopPrice:   parseFloat(slPrice.toFixed(decimals)),
            marketPrice: currentPrice,
          });
        }
      });
    }
  }, [activeBroker, isConnected, accountBlocked, accountState, lockedReason, orderType, limitPrice, stopPrice, currentPrice, contractQuantity, symbol, placeOrder, bracketEnabled, tpOffset, slOffset, decimals]);

  const handleFlatten = useCallback(async () => {
    if (!activeBroker || !isConnected) return;
    await closePosition(symbol.toUpperCase());
  }, [activeBroker, isConnected, closePosition, symbol]);

  const handleReverse = useCallback(async () => {
    if (!activeBroker || !isConnected) return;
    const sym = symbol.toUpperCase();
    const pos = positions.find(p => p.symbol === sym);
    if (!pos) return;
    await closePosition(sym);
    await placeOrder({
      broker: activeBroker,
      symbol: sym,
      side: pos.side === 'buy' ? 'sell' : 'buy',
      type: 'market',
      quantity: pos.quantity,
      marketPrice: currentPrice,
    });
  }, [activeBroker, isConnected, positions, symbol, closePosition, placeOrder, currentPrice]);

  const handleCancelAll = useCallback(async () => {
    if (!activeBroker || !isConnected) return;
    const sym = symbol.toUpperCase();
    const pending = orders.filter(o => o.symbol === sym && o.status === 'pending');
    for (const o of pending) {
      await cancelOrder(o.id);
    }
  }, [activeBroker, isConnected, orders, symbol, cancelOrder]);

  const currentPosition = positions.find(p => p.symbol === symbol.toUpperCase());
  const pendingOrders = orders.filter(o => o.symbol === symbol.toUpperCase() && o.status === 'pending');

  // Keyboard hotkeys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!isConnected) return;
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); handleTrade('buy'); break;
        case 's': e.preventDefault(); handleTrade('sell'); break;
        case 'x': e.preventDefault(); handleFlatten(); break;
        case 'f': e.preventDefault(); handleReverse(); break;
        case 'escape': e.preventDefault(); handleCancelAll(); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isConnected, handleTrade, handleFlatten, handleReverse, handleCancelAll]);

  // Not connected
  if (!isConnected) {
    return (
      <>
        <div className="flex items-center justify-between px-3 h-[34px] text-xs"
          style={{ backgroundColor: colors.background, borderBottom: `1px solid ${colors.border}` }}>
          <span className="text-[11px]" style={{ color: colors.textMuted }}>Connect to trade</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowDemoPanel(true)}
              className="px-3 py-1 rounded text-[11px] font-medium transition-colors hover:brightness-110"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--text-primary)' }}>
              Demo Account
            </button>
            {activeBroker && activeBroker !== 'demo' && (
              <button onClick={() => connect(activeBroker)}
                className="px-3 py-1 rounded text-[11px] font-medium"
                style={{ backgroundColor: BROKER_INFO[activeBroker].color, color: '#fff' }}>
                {BROKER_INFO[activeBroker].name}
              </button>
            )}
          </div>
        </div>
        <DemoAccountPanel isOpen={showDemoPanel} onClose={() => setShowDemoPanel(false)} />
      </>
    );
  }

  const balance = connections[activeBroker!]?.balance;
  const needsLimit = orderType === 'limit' || orderType === 'stop_limit';
  const needsStop = orderType === 'stop' || orderType === 'stop_limit';

  return (
    <div className="flex items-center h-[34px] px-2.5 gap-1.5 text-[11px] overflow-x-auto"
      style={{ backgroundColor: colors.background, borderBottom: `1px solid ${colors.border}`, scrollbarWidth: 'none' }}>

      {/* Balance — clickable for demo settings */}
      {balance !== undefined && (
        <button
          onClick={() => activeBroker === 'demo' && setShowDemoPanel(true)}
          className="text-[10px] shrink-0 tabular-nums font-medium transition-colors hover:brightness-125 px-1.5 py-0.5 rounded"
          style={{ color: colors.textSecondary, cursor: activeBroker === 'demo' ? 'pointer' : 'default', backgroundColor: colors.surface }}
        >
          ${balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </button>
      )}

      <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />

      {/* Order type — includes stop_limit */}
      <div className="flex items-center rounded overflow-hidden shrink-0"
        style={{ border: `1px solid ${colors.border}` }}>
        {(['market', 'limit', 'stop', 'stop_limit'] as OrderType[]).map(t => (
          <button key={t}
            onClick={() => setOrderType(t)}
            className="px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              backgroundColor: orderType === t ? colors.surface : 'transparent',
              color: orderType === t ? colors.text : colors.textMuted,
            }}>
            {t === 'stop_limit' ? 'S/L' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Limit/Stop price inputs */}
      {needsLimit && (
        <div className="flex items-center rounded overflow-hidden shrink-0"
          style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
          <button onClick={() => setLimitPrice(((parseFloat(limitPrice) || currentPrice) - tick).toFixed(decimals))}
            className="w-5 h-5 flex items-center justify-center hover:bg-[var(--surface-hover)] text-[10px]"
            style={{ color: colors.textMuted }}>-</button>
          <input type="number" value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            step={tick}
            placeholder={currentPrice.toFixed(decimals)}
            className="w-[68px] px-1 text-center text-[10px] tabular-nums focus:outline-none bg-transparent"
            style={{ color: colors.text }} />
          <button onClick={() => setLimitPrice(((parseFloat(limitPrice) || currentPrice) + tick).toFixed(decimals))}
            className="w-5 h-5 flex items-center justify-center hover:bg-[var(--surface-hover)] text-[10px]"
            style={{ color: colors.textMuted }}>+</button>
        </div>
      )}
      {needsStop && (
        <div className="flex items-center rounded overflow-hidden shrink-0"
          style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
          <span className="px-1 text-[9px] font-medium" style={{ color: '#f59e0b' }}>STP</span>
          <input type="number" value={stopPrice}
            onChange={e => setStopPrice(e.target.value)}
            step={tick}
            placeholder={currentPrice.toFixed(decimals)}
            className="w-[68px] px-1 text-center text-[10px] tabular-nums focus:outline-none bg-transparent"
            style={{ color: colors.text }} />
        </div>
      )}

      <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />

      {/* Quantity control — compact */}
      <div className="flex items-center gap-0.5 shrink-0">
        <div className="flex items-center rounded overflow-hidden"
          style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
          <button onClick={() => setContractQuantity(Math.max(1, contractQuantity - 1))}
            className="w-5 h-5 flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: colors.textMuted }}>
            <svg width="8" height="8" viewBox="0 0 10 10"><line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <input type="number" value={contractQuantity}
            onChange={e => setContractQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-7 text-center text-[10px] font-semibold focus:outline-none bg-transparent tabular-nums"
            style={{ color: colors.text }} />
          <button onClick={() => setContractQuantity(contractQuantity + 1)}
            className="w-5 h-5 flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors"
            style={{ color: colors.textMuted }}>
            <svg width="8" height="8" viewBox="0 0 10 10"><line x1="5" y1="2" x2="5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        {/* Quick qty presets */}
        {[1, 5, 10, 25].map(q => (
          <button key={q} onClick={() => setContractQuantity(q)}
            className="w-5 h-5 rounded text-[9px] font-medium transition-colors"
            style={{
              backgroundColor: contractQuantity === q ? colors.surface : 'transparent',
              color: contractQuantity === q ? colors.text : colors.textMuted,
            }}>{q}</button>
        ))}
      </div>

      <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />

      {/* Bracket Toggle + R:R */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => { setBracketEnabled(!bracketEnabled); if (!bracketEnabled && rrPreset === 'off') setRrPreset('1:2'); }}
          className="h-5 px-1.5 rounded text-[9px] font-semibold tracking-wide transition-colors"
          title="Bracket order (TP + SL)"
          style={{
            backgroundColor: bracketEnabled ? 'rgba(168,85,247,0.15)' : 'transparent',
            color: bracketEnabled ? '#a855f7' : colors.textMuted,
            border: `1px solid ${bracketEnabled ? '#a855f740' : colors.border}`,
          }}
        >
          BKT
        </button>
        {bracketEnabled && (
          <>
            {(['1:1', '1:2', '1:3'] as RRPreset[]).map(rr => (
              <button key={rr}
                onClick={() => setRrPreset(rr)}
                className="h-5 px-1 rounded text-[9px] font-medium transition-colors"
                style={{
                  backgroundColor: rrPreset === rr ? 'rgba(251,191,36,0.15)' : 'transparent',
                  color: rrPreset === rr ? '#fbbf24' : colors.textMuted,
                }}>
                {rr}
              </button>
            ))}
            <div className="flex items-center rounded overflow-hidden shrink-0"
              style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
              <span className="px-1 text-[8px] font-bold" style={{ color: '#ef4444' }}>SL</span>
              <input type="number" value={slOffset}
                onChange={e => setSlOffset(e.target.value)}
                step={tick}
                placeholder={tick.toFixed(decimals)}
                className="w-[48px] px-0.5 text-center text-[10px] tabular-nums focus:outline-none bg-transparent"
                style={{ color: colors.text }} />
            </div>
            <div className="flex items-center rounded overflow-hidden shrink-0"
              style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.surface }}>
              <span className="px-1 text-[8px] font-bold" style={{ color: '#22c55e' }}>TP</span>
              <input type="number" value={tpOffset}
                onChange={e => { setTpOffset(e.target.value); setRrPreset('off'); }}
                step={tick}
                placeholder={tick.toFixed(decimals)}
                className="w-[48px] px-0.5 text-center text-[10px] tabular-nums focus:outline-none bg-transparent"
                style={{ color: colors.text }} />
            </div>
          </>
        )}
      </div>

      <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />

      {/* Position info — TradingView/Topstep style */}
      {currentPosition && (
        <>
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] tabular-nums">
            <span className="px-1.5 py-px rounded text-[9px] font-bold tracking-wide"
              style={{
                backgroundColor: currentPosition.side === 'buy' ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)',
                color: currentPosition.side === 'buy' ? '#10b981' : '#ef4444',
              }}>
              {currentPosition.side === 'buy' ? 'LONG' : 'SHORT'} {currentPosition.quantity}
            </span>
            <span className="text-[9px]" style={{ color: colors.textMuted }}>
              @ {currentPosition.entryPrice.toFixed(decimals)}
            </span>
            <span className="font-bold text-[10px]" style={{ color: currentPosition.pnl >= 0 ? '#10b981' : '#ef4444' }}>
              {currentPosition.pnl >= 0 ? '+' : ''}{currentPosition.pnl.toFixed(2)}
            </span>
            <span className="text-[9px] font-medium" style={{ color: currentPosition.pnl >= 0 ? '#10b98199' : '#ef444499' }}>
              ({currentPosition.pnlPercent >= 0 ? '+' : ''}{currentPosition.pnlPercent.toFixed(2)}%)
            </span>
          </div>
          <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />
        </>
      )}

      {/* Action buttons: Flatten, Reverse, Cancel */}
      {(currentPosition || pendingOrders.length > 0) && (
        <>
          <div className="flex items-center gap-0.5 shrink-0">
            {currentPosition && (
              <>
                <button onClick={handleFlatten} title="Flatten (X)"
                  className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: '#a78bfa' }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
                  </svg>
                </button>
                <button onClick={handleReverse} title="Reverse (F)"
                  className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: '#fbbf24' }}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 6,2 10,6" /><line x1="6" y1="2" x2="6" y2="11" />
                    <polyline points="6,10 10,14 14,10" /><line x1="10" y1="5" x2="10" y2="14" />
                  </svg>
                </button>
              </>
            )}
            {pendingOrders.length > 0 && (
              <button onClick={handleCancelAll} title="Cancel all (Esc)"
                className="h-5 px-1.5 rounded flex items-center justify-center text-[9px] font-medium transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: colors.textMuted }}>
                CXL{pendingOrders.length > 1 && <span className="ml-0.5 text-[8px] opacity-60">{pendingOrders.length}</span>}
              </button>
            )}
          </div>
          <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />
        </>
      )}

      <div className="flex-1" />

      {/* Live price ticker (TradingView style) */}
      {currentPrice > 0 && (
        <>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: colors.textMuted }}>Last</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: colors.text }}>
              {currentPrice.toFixed(decimals)}
            </span>
          </div>
          <div className="w-px h-4 shrink-0" style={{ backgroundColor: colors.border }} />
        </>
      )}

      {/* Account state banner — shown only when blocked */}
      {accountBlocked && (
        <a
          href="/trading"
          title={lockedReason ?? (accountState === 'PASSED' ? 'Challenge passed' : 'Account locked')}
          className="px-2 h-6 rounded text-[10px] font-bold tracking-wider flex items-center gap-1.5 shrink-0 transition-colors hover:brightness-110"
          style={{
            background: accountState === 'PASSED' ? 'rgba(168,85,247,0.18)' : 'rgba(239,68,68,0.18)',
            color:      accountState === 'PASSED' ? '#a78bfa' : '#ef4444',
            border:     `1px solid ${accountState === 'PASSED' ? 'rgba(168,85,247,0.4)' : 'rgba(239,68,68,0.4)'}`,
          }}
        >
          {accountState === 'PASSED' ? '🏆 PASSED' : '🔒 LOCKED'}
          <span className="hidden md:inline opacity-70 font-medium normal-case tracking-normal">
            · view rules
          </span>
        </a>
      )}

      {/* Buy / Sell — TradingView/Topstep style with hotkey badge */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => handleTrade('sell')}
          disabled={accountBlocked}
          title={accountBlocked ? lockedReason ?? 'Account locked' : 'Sell at market (S)'}
          className="relative h-6 px-3 rounded font-bold text-[10px] tracking-wider transition-all duration-100 active:scale-90 hover:brightness-110 flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:brightness-100"
          style={{
            backgroundColor: lastAction?.side === 'sell' ? '#b91c1c' : '#ef4444',
            color: '#fff',
            boxShadow: lastAction?.side === 'sell'
              ? '0 0 12px rgba(239,68,68,0.7), inset 0 0 6px rgba(0,0,0,0.3)'
              : '0 1px 2px rgba(0,0,0,0.2)',
            transform: lastAction?.side === 'sell' ? 'scale(0.95)' : 'scale(1)',
          }}
        >
          SELL
          <span className="hidden sm:inline-flex h-3.5 min-w-[12px] px-1 items-center justify-center rounded text-[8px] font-mono opacity-70 bg-black/25">S</span>
        </button>
        <button
          onClick={() => handleTrade('buy')}
          disabled={accountBlocked}
          title={accountBlocked ? lockedReason ?? 'Account locked' : 'Buy at market (B)'}
          className="relative h-6 px-3 rounded font-bold text-[10px] tracking-wider transition-all duration-100 active:scale-90 hover:brightness-110 flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:brightness-100"
          style={{
            backgroundColor: lastAction?.side === 'buy' ? '#047857' : '#10b981',
            color: '#fff',
            boxShadow: lastAction?.side === 'buy'
              ? '0 0 12px rgba(16,185,129,0.7), inset 0 0 6px rgba(0,0,0,0.3)'
              : '0 1px 2px rgba(0,0,0,0.2)',
            transform: lastAction?.side === 'buy' ? 'scale(0.95)' : 'scale(1)',
          }}
        >
          BUY
          <span className="hidden sm:inline-flex h-3.5 min-w-[12px] px-1 items-center justify-center rounded text-[8px] font-mono opacity-70 bg-black/25">B</span>
        </button>
      </div>

      <DemoAccountPanel isOpen={showDemoPanel} onClose={() => setShowDemoPanel(false)} />
    </div>
  );
}
