'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useTradingStore } from '@/stores/useTradingStore';
import { useMarketStore } from '@/stores/useMarketStore';
import { useAccountRulesStore } from '@/stores/useAccountRulesStore';

const POPULAR_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT',
  'MNQ', 'MES', 'MGC', 'CL',
];

const QTY_PRESETS = [1, 5, 10, 25];

/**
 * QuickTradePanel — place BUY/SELL market orders directly from /trading
 * without leaving the page. Mirrors the QuickTradeBar logic minus the
 * limit/stop/bracket complexity (intentional — this is the dashboard
 * quick-action card; keep it simple).
 */
export default function QuickTradePanel() {
  const { activeBroker, connections, placeOrder, contractQuantity, setContractQuantity, tradingSymbol, setTradingSymbol } =
    useTradingStore(useShallow(s => ({
      activeBroker:     s.activeBroker,
      connections:      s.connections,
      placeOrder:       s.placeOrder,
      contractQuantity: s.contractQuantity,
      setContractQuantity: s.setContractQuantity,
      tradingSymbol:    s.tradingSymbol,
      setTradingSymbol: s.setTradingSymbol,
    })));

  const marketPrice = useMarketStore(s => s.currentPrice);

  const { rulesEnabled, accountState, lockedReason } = useAccountRulesStore(useShallow(s => ({
    rulesEnabled: s.enabled,
    accountState: s.accountState,
    lockedReason: s.lockedReason,
  })));
  const blocked = rulesEnabled && (accountState === 'LOCKED' || accountState === 'PASSED');

  const [symbolInput, setSymbolInput] = useState(tradingSymbol.toUpperCase());
  useEffect(() => setSymbolInput(tradingSymbol.toUpperCase()), [tradingSymbol]);

  // Spam-friendly per-side gate (same pattern as QuickTradeBar)
  const SPAM_GATE_MS = 25;
  const lastFireRef  = useRef<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  const lastToastRef = useRef<{ buy: number; sell: number }>({ buy: 0, sell: 0 });
  const TOAST_THROTTLE_MS = 250;

  const [flashSide, setFlashSide] = useState<'buy' | 'sell' | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  const isConnected = activeBroker && connections[activeBroker]?.connected;
  const sym         = (symbolInput || tradingSymbol).trim().toUpperCase();
  const livePrice   = marketPrice && marketPrice > 0 ? marketPrice : 0;

  const handleTrade = useCallback((side: 'buy' | 'sell') => {
    if (!activeBroker) {
      toast.error('No broker selected — open Data Feeds');
      return;
    }
    if (!isConnected) {
      toast.error(`Broker ${activeBroker} not connected`);
      return;
    }
    if (blocked) {
      toast.error(
        accountState === 'PASSED'
          ? 'Challenge passed — open a new account to keep trading'
          : `Account locked: ${lockedReason ?? 'risk limit hit'}`,
        { duration: 2500 },
      );
      return;
    }

    const now = performance.now();
    if (now - lastFireRef.current[side] < SPAM_GATE_MS) return;
    lastFireRef.current[side] = now;

    setFlashSide(side);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashSide(null), 500);

    const promise = placeOrder({
      broker:      activeBroker,
      symbol:      sym,
      side,
      type:        'market',
      quantity:    contractQuantity,
      marketPrice: livePrice || undefined,
    });

    promise.then(result => {
      const t = performance.now();
      if (t - lastToastRef.current[side] < TOAST_THROTTLE_MS) return;
      lastToastRef.current[side] = t;
      if (result) {
        const fillPrice = result.avgFillPrice ?? livePrice;
        toast.success(`${side === 'buy' ? 'BUY' : 'SELL'} ${contractQuantity} ${sym} @ ${fillPrice.toFixed(2)}`, { duration: 900 });
      } else {
        toast.error('Order failed', { duration: 1200 });
      }
    });
  }, [activeBroker, isConnected, blocked, accountState, lockedReason, sym, contractQuantity, livePrice, placeOrder]);

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Quick Trade</h3>
        {livePrice > 0 && (
          <span className="text-[11px] tabular-nums font-bold" style={{ color: 'var(--text-primary)' }}>
            {livePrice.toFixed(2)}
            <span className="ml-1.5 text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>last</span>
          </span>
        )}
      </div>

      {/* Symbol input + popular shortcuts */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={symbolInput}
            onChange={e => setSymbolInput(e.target.value.toUpperCase())}
            onBlur={() => setTradingSymbol(symbolInput.toLowerCase())}
            onKeyDown={e => { if (e.key === 'Enter') setTradingSymbol(symbolInput.toLowerCase()); }}
            placeholder="Symbol"
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {POPULAR_SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => { setSymbolInput(s); setTradingSymbol(s.toLowerCase()); }}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
              style={{
                background: sym === s ? 'rgba(74,222,128,0.10)' : 'var(--surface-elevated)',
                color:      sym === s ? 'var(--primary)' : 'var(--text-muted)',
                border:     `1px solid ${sym === s ? 'var(--primary)' : 'var(--border)'}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Qty</span>
        <div className="flex items-center rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-elevated)' }}>
          <button
            onClick={() => setContractQuantity(Math.max(1, contractQuantity - 1))}
            className="w-7 h-7 text-[12px]"
            style={{ color: 'var(--text-muted)' }}
          >−</button>
          <input
            type="number"
            min={1}
            value={contractQuantity}
            onChange={e => setContractQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-12 text-center text-[12px] font-semibold tabular-nums focus:outline-none bg-transparent"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            onClick={() => setContractQuantity(contractQuantity + 1)}
            className="w-7 h-7 text-[12px]"
            style={{ color: 'var(--text-muted)' }}
          >+</button>
        </div>
        <div className="flex items-center gap-1">
          {QTY_PRESETS.map(q => (
            <button
              key={q}
              onClick={() => setContractQuantity(q)}
              className="w-7 h-7 rounded text-[10px] font-semibold transition-colors"
              style={{
                background: contractQuantity === q ? 'var(--surface-elevated)' : 'transparent',
                color:      contractQuantity === q ? 'var(--text-primary)' : 'var(--text-muted)',
                border:     `1px solid ${contractQuantity === q ? 'var(--border)' : 'transparent'}`,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* BUY / SELL buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleTrade('sell')}
          disabled={blocked || !isConnected}
          title={blocked ? lockedReason ?? 'Account locked' : 'Sell at market'}
          className="h-11 rounded-lg font-bold text-[13px] tracking-wider transition-all duration-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: flashSide === 'sell' ? '#b91c1c' : '#ef4444',
            color: '#fff',
            boxShadow: flashSide === 'sell'
              ? '0 0 14px rgba(239,68,68,0.7), inset 0 0 6px rgba(0,0,0,0.3)'
              : '0 1px 3px rgba(0,0,0,0.2)',
            transform: flashSide === 'sell' ? 'scale(0.97)' : 'scale(1)',
          }}
        >
          SELL
          {livePrice > 0 && (
            <span className="text-[10px] opacity-80 font-medium normal-case tracking-normal">
              @ {livePrice.toFixed(2)}
            </span>
          )}
        </button>
        <button
          onClick={() => handleTrade('buy')}
          disabled={blocked || !isConnected}
          title={blocked ? lockedReason ?? 'Account locked' : 'Buy at market'}
          className="h-11 rounded-lg font-bold text-[13px] tracking-wider transition-all duration-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: flashSide === 'buy' ? '#047857' : '#10b981',
            color: '#fff',
            boxShadow: flashSide === 'buy'
              ? '0 0 14px rgba(16,185,129,0.7), inset 0 0 6px rgba(0,0,0,0.3)'
              : '0 1px 3px rgba(0,0,0,0.2)',
            transform: flashSide === 'buy' ? 'scale(0.97)' : 'scale(1)',
          }}
        >
          BUY
          {livePrice > 0 && (
            <span className="text-[10px] opacity-80 font-medium normal-case tracking-normal">
              @ {livePrice.toFixed(2)}
            </span>
          )}
        </button>
      </div>

      {!livePrice && (
        <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
          ⓘ No live price feed for this symbol — open <a href="/live" className="underline">/live</a> first to subscribe.
        </p>
      )}
    </div>
  );
}
