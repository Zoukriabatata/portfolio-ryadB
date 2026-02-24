'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ReplayTradingEngine, type ReplayTradingState, type ReplayOrderType } from '@/lib/replay/ReplayTradingEngine';

interface ReplayTradingBarProps {
  currentBid: number;
  currentAsk: number;
  timestamp: number;
  symbol: string;
}

// Singleton engine for replay trading
let engineInstance: ReplayTradingEngine | null = null;
function getEngine(): ReplayTradingEngine {
  if (!engineInstance) engineInstance = new ReplayTradingEngine(100000);
  return engineInstance;
}

export default function ReplayTradingBar({ currentBid, currentAsk, timestamp, symbol }: ReplayTradingBarProps) {
  const [state, setState] = useState<ReplayTradingState>({
    orders: [], position: null, balance: 100000, realizedPnl: 0, tradeCount: 0,
  });
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState<ReplayOrderType>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [lastAction, setLastAction] = useState<'buy' | 'sell' | null>(null);
  const lastActionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick engine each render
  useEffect(() => {
    const engine = getEngine();
    if (currentBid > 0 && currentAsk > 0) {
      engine.tick(currentBid, currentAsk, timestamp);
      setState(engine.getState());
    }
  }, [currentBid, currentAsk, timestamp]);

  const handleTrade = useCallback((side: 'buy' | 'sell') => {
    const engine = getEngine();
    const price = orderType === 'market'
      ? (side === 'buy' ? currentAsk : currentBid)
      : parseFloat(limitPrice);
    if (!price || price <= 0) return;

    engine.placeOrder(side, orderType, quantity, side === 'buy' ? currentAsk : currentBid, orderType !== 'market' ? price : undefined);
    setState(engine.getState());

    setLastAction(side);
    if (lastActionTimer.current) clearTimeout(lastActionTimer.current);
    lastActionTimer.current = setTimeout(() => setLastAction(null), 800);
  }, [orderType, limitPrice, quantity, currentBid, currentAsk]);

  const pnlColor = (state.position?.pnl ?? 0) >= 0 ? '#10b981' : '#ef4444';

  return (
    <div className="absolute bottom-[70px] left-1/2 -translate-x-1/2 z-25 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs animate-slideUp"
      style={{ background: 'rgba(10,10,15,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Symbol + Balance */}
      <div className="flex items-center gap-1.5 mr-1">
        <span className="text-[9px] font-mono font-bold" style={{ color: 'var(--primary)' }}>{symbol}</span>
        <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
          ${state.balance.toFixed(0)}
        </span>
      </div>

      <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Order type */}
      <div className="flex rounded overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        {(['market', 'limit', 'stop'] as const).map(t => (
          <button key={t} onClick={() => setOrderType(t)}
            className="px-1.5 py-0.5 text-[9px] capitalize"
            style={{
              background: orderType === t ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: orderType === t ? 'var(--primary)' : 'rgba(255,255,255,0.3)',
            }}>{t}</button>
        ))}
      </div>

      {/* Limit price input */}
      {orderType !== 'market' && (
        <input type="number" value={limitPrice}
          onChange={e => setLimitPrice(e.target.value)}
          placeholder={currentAsk.toFixed(2)}
          className="w-16 px-1 py-0.5 rounded text-[10px] font-mono focus:outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      )}

      {/* Quantity */}
      <div className="flex items-center gap-0.5">
        <button onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="w-4 h-4 rounded text-[10px] flex items-center justify-center"
          style={{ color: 'rgba(255,255,255,0.4)' }}>-</button>
        <span className="text-[10px] font-mono w-4 text-center" style={{ color: '#fff' }}>{quantity}</span>
        <button onClick={() => setQuantity(quantity + 1)}
          className="w-4 h-4 rounded text-[10px] flex items-center justify-center"
          style={{ color: 'rgba(255,255,255,0.4)' }}>+</button>
      </div>

      {/* Buy / Sell */}
      <button onClick={() => handleTrade('buy')}
        className="px-3 py-1 rounded font-semibold text-[10px] transition-all hover:brightness-110"
        style={{
          background: lastAction === 'buy' ? '#059669' : '#10b981',
          color: '#fff',
          boxShadow: lastAction === 'buy' ? '0 0 8px rgba(16,185,129,0.4)' : undefined,
        }}>BUY</button>
      <button onClick={() => handleTrade('sell')}
        className="px-3 py-1 rounded font-semibold text-[10px] transition-all hover:brightness-110"
        style={{
          background: lastAction === 'sell' ? '#dc2626' : '#ef4444',
          color: '#fff',
          boxShadow: lastAction === 'sell' ? '0 0 8px rgba(239,68,68,0.4)' : undefined,
        }}>SELL</button>

      {/* Position info */}
      {state.position && (
        <>
          <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="flex items-center gap-1.5 text-[9px] font-mono">
            <span style={{ color: state.position.side === 'buy' ? '#10b981' : '#ef4444' }}>
              {state.position.side === 'buy' ? 'LONG' : 'SHORT'} {state.position.quantity}
            </span>
            <span style={{ color: pnlColor }}>
              {state.position.pnl >= 0 ? '+' : ''}{state.position.pnl.toFixed(2)}
            </span>
          </div>
        </>
      )}

      {/* Realized PnL */}
      {state.realizedPnl !== 0 && (
        <span className="text-[9px] font-mono" style={{ color: state.realizedPnl >= 0 ? '#10b981' : '#ef4444' }}>
          R: {state.realizedPnl >= 0 ? '+' : ''}{state.realizedPnl.toFixed(2)}
        </span>
      )}
    </div>
  );
}
