'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTradingStore, BROKER_INFO, type OrderType } from '@/stores/useTradingStore';
import { useFuturesStore } from '@/stores/useFuturesStore';

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
    confirmOrders,
    placeOrder,
    connect,
    setShowBrokerSelector,
  } = useTradingStore();

  const { markPrice } = useFuturesStore();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [lastAction, setLastAction] = useState<{ side: 'buy' | 'sell'; time: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up lastAction timer on unmount
  useEffect(() => {
    return () => {
      if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
    };
  }, []);

  const isConnected = activeBroker && connections[activeBroker]?.connected;
  const currentPrice = markPrice || 0;

  const handleTrade = useCallback(async (side: 'buy' | 'sell') => {
    if (!activeBroker || !isConnected || isSubmitting) return;

    const price = orderType === 'limit' ? parseFloat(limitPrice) : currentPrice;
    if (isNaN(price) || price <= 0) return;

    setIsSubmitting(true);
    try {
      await placeOrder({
        broker: activeBroker,
        symbol: symbol.toUpperCase(),
        side,
        type: orderType,
        quantity: contractQuantity,
        price: orderType === 'limit' ? price : undefined,
        marketPrice: currentPrice,
      });

      setLastAction({ side, time: Date.now() });
      if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
      lastActionTimerRef.current = setTimeout(() => setLastAction(null), 1000);
    } catch {
      // Order failed — isSubmitting reset in finally
    } finally {
      setIsSubmitting(false);
    }
  }, [activeBroker, isConnected, isSubmitting, orderType, limitPrice, currentPrice, contractQuantity, symbol, placeOrder]);

  // Not connected state - compact connect prompt
  if (!isConnected) {
    return (
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b text-xs"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2" strokeLinecap="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span style={{ color: colors.textMuted }}>Connect a broker to trade</span>
        </div>
        <button
          onClick={() => activeBroker ? connect(activeBroker) : connect('demo')}
          className="px-3 py-1 rounded text-xs font-medium button-press hover-glow"
          style={{
            backgroundColor: '#7c3aed',
            color: '#fff',
          }}
        >
          {activeBroker ? `Connect ${BROKER_INFO[activeBroker].name}` : 'Demo Account'}
        </button>
      </div>
    );
  }

  const brokerInfo = BROKER_INFO[activeBroker!];
  const balance = connections[activeBroker!]?.balance;
  const currency = connections[activeBroker!]?.currency;

  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5 border-b text-xs"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      {/* Broker badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold"
          style={{ backgroundColor: brokerInfo.color + '30', color: brokerInfo.color }}
        >
          {brokerInfo.logo}
        </div>
        {balance !== undefined && (
          <span className="font-mono" style={{ color: colors.textSecondary }}>
            {balance.toLocaleString()} {currency}
          </span>
        )}
      </div>

      <div className="w-px h-4" style={{ backgroundColor: colors.border }} />

      {/* Order type */}
      <div className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
        {(['market', 'limit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className="px-2 py-0.5 text-[10px] font-medium capitalize transition-all button-press"
            style={{
              backgroundColor: orderType === t ? colors.background : 'transparent',
              color: orderType === t ? colors.text : colors.textMuted,
              transform: orderType === t ? 'scale(1)' : 'scale(0.96)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Limit price input */}
      {orderType === 'limit' && (
        <input
          type="number"
          value={limitPrice}
          onChange={e => setLimitPrice(e.target.value)}
          placeholder={currentPrice.toFixed(2)}
          className="w-24 px-2 py-0.5 rounded text-xs font-mono focus:outline-none"
          style={{
            backgroundColor: colors.background,
            color: colors.text,
            border: `1px solid ${colors.border}`,
          }}
        />
      )}

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <span className="text-[10px]" style={{ color: colors.textMuted }}>Qty</span>
        <div className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${colors.border}` }}>
          <button
            onClick={() => setContractQuantity(Math.max(1, contractQuantity - 1))}
            className="w-5 h-5 flex items-center justify-center hover:bg-white/5 transition-all button-press"
            style={{ color: colors.textSecondary }}
          >
            -
          </button>
          <input
            type="number"
            value={contractQuantity}
            onChange={e => setContractQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-10 text-center text-xs font-mono focus:outline-none transition-colors"
            style={{
              backgroundColor: colors.background,
              color: colors.text,
            }}
          />
          <button
            onClick={() => setContractQuantity(contractQuantity + 1)}
            className="w-5 h-5 flex items-center justify-center hover:bg-white/5 transition-all button-press"
            style={{ color: colors.textSecondary }}
          >
            +
          </button>
        </div>
      </div>

      {/* Quick quantity presets */}
      <div className="flex items-center gap-0.5">
        {[1, 5, 10].map(q => (
          <button
            key={q}
            onClick={() => setContractQuantity(q)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono transition-all button-press"
            style={{
              backgroundColor: contractQuantity === q ? colors.background : 'transparent',
              color: contractQuantity === q ? colors.text : colors.textMuted,
              transform: contractQuantity === q ? 'scale(1)' : 'scale(0.96)',
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Buy / Sell buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => handleTrade('buy')}
          disabled={isSubmitting}
          className={`px-4 py-1 rounded font-semibold text-xs transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-95 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed ${lastAction?.side === 'buy' ? 'trade-success' : ''}`}
          style={{
            backgroundColor: lastAction?.side === 'buy' ? '#059669' : '#10b981',
            color: '#fff',
            boxShadow: lastAction?.side === 'buy' ? '0 0 12px rgba(5,150,105,0.5)' : undefined,
          }}
        >
          {isSubmitting ? (
            <span className="spinner inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
          ) : (
            'BUY'
          )}
        </button>
        <button
          onClick={() => handleTrade('sell')}
          disabled={isSubmitting}
          className={`px-4 py-1 rounded font-semibold text-xs transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-95 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed ${lastAction?.side === 'sell' ? 'trade-success' : ''}`}
          style={{
            backgroundColor: lastAction?.side === 'sell' ? '#dc2626' : '#ef4444',
            color: '#fff',
            boxShadow: lastAction?.side === 'sell' ? '0 0 12px rgba(220,38,38,0.5)' : undefined,
          }}
        >
          {isSubmitting ? (
            <span className="spinner inline-block w-3 h-3 border border-white border-t-transparent rounded-full" />
          ) : (
            'SELL'
          )}
        </button>
      </div>
    </div>
  );
}
