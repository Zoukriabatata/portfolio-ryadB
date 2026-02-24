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

const ORDER_TYPES: OrderType[] = ['market', 'limit', 'stop', 'stop_limit'];
const RR_PRESETS = [
  { label: '1:1', tp: 1, sl: 1 },
  { label: '1:2', tp: 2, sl: 1 },
  { label: '1:3', tp: 3, sl: 1 },
];

export default function QuickTradeBar({ symbol, colors }: QuickTradeBarProps) {
  const {
    activeBroker,
    connections,
    contractQuantity,
    setContractQuantity,
    placeOrder,
    connect,
  } = useTradingStore();

  const { markPrice } = useFuturesStore();

  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [lastAction, setLastAction] = useState<{ side: 'buy' | 'sell'; time: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Advanced panel
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tpEnabled, setTpEnabled] = useState(false);
  const [slEnabled, setSlEnabled] = useState(false);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [trailingEnabled, setTrailingEnabled] = useState(false);
  const [trailingOffset, setTrailingOffset] = useState('');
  const [trailingMode, setTrailingMode] = useState<'points' | 'percent'>('points');

  const lastActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
    };
  }, []);

  const isConnected = activeBroker && connections[activeBroker]?.connected;
  const currentPrice = markPrice || 0;

  // Apply R:R preset
  const applyRRPreset = useCallback((tp: number, sl: number, side: 'buy' | 'sell') => {
    if (currentPrice <= 0) return;
    // Default risk = 0.5% of current price
    const risk = currentPrice * 0.005;
    if (side === 'buy') {
      setSlPrice((currentPrice - risk * sl).toFixed(2));
      setTpPrice((currentPrice + risk * tp).toFixed(2));
    } else {
      setSlPrice((currentPrice + risk * sl).toFixed(2));
      setTpPrice((currentPrice - risk * tp).toFixed(2));
    }
    setTpEnabled(true);
    setSlEnabled(true);
  }, [currentPrice]);

  const handleTrade = useCallback(async (side: 'buy' | 'sell') => {
    if (!activeBroker || !isConnected || isSubmitting) return;

    const price = (orderType === 'limit' || orderType === 'stop_limit')
      ? parseFloat(limitPrice) : currentPrice;
    if (isNaN(price) || price <= 0) return;

    const stp = (orderType === 'stop' || orderType === 'stop_limit')
      ? parseFloat(stopPrice) : undefined;
    if ((orderType === 'stop' || orderType === 'stop_limit') && (!stp || isNaN(stp))) return;

    setIsSubmitting(true);
    try {
      // Main entry order
      await placeOrder({
        broker: activeBroker,
        symbol: symbol.toUpperCase(),
        side,
        type: orderType,
        quantity: contractQuantity,
        price: (orderType === 'limit' || orderType === 'stop_limit') ? price : undefined,
        stopPrice: stp,
        marketPrice: currentPrice,
      });

      // Bracket: TP limit order
      if (tpEnabled && tpPrice) {
        const tp = parseFloat(tpPrice);
        if (!isNaN(tp) && tp > 0) {
          await placeOrder({
            broker: activeBroker,
            symbol: symbol.toUpperCase(),
            side: side === 'buy' ? 'sell' : 'buy',
            type: 'limit',
            quantity: contractQuantity,
            price: tp,
            marketPrice: currentPrice,
          });
        }
      }

      // Bracket: SL stop order
      if (slEnabled && slPrice) {
        const sl = parseFloat(slPrice);
        if (!isNaN(sl) && sl > 0) {
          await placeOrder({
            broker: activeBroker,
            symbol: symbol.toUpperCase(),
            side: side === 'buy' ? 'sell' : 'buy',
            type: 'stop',
            quantity: contractQuantity,
            stopPrice: sl,
            marketPrice: currentPrice,
          });
        }
      }

      setLastAction({ side, time: Date.now() });
      if (lastActionTimerRef.current) clearTimeout(lastActionTimerRef.current);
      lastActionTimerRef.current = setTimeout(() => setLastAction(null), 1000);
    } catch {
      // Order failed
    } finally {
      setIsSubmitting(false);
    }
  }, [activeBroker, isConnected, isSubmitting, orderType, limitPrice, stopPrice, currentPrice, contractQuantity, symbol, placeOrder, tpEnabled, tpPrice, slEnabled, slPrice]);

  // Not connected state
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
          style={{ backgroundColor: '#7c3aed', color: '#fff' }}
        >
          {activeBroker ? `Connect ${BROKER_INFO[activeBroker].name}` : 'Demo Account'}
        </button>
      </div>
    );
  }

  const brokerInfo = BROKER_INFO[activeBroker!];
  const balance = connections[activeBroker!]?.balance;
  const currency = connections[activeBroker!]?.currency;
  const needsLimit = orderType === 'limit' || orderType === 'stop_limit';
  const needsStop = orderType === 'stop' || orderType === 'stop_limit';

  return (
    <div style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      className="border-b">
      {/* Main bar */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs">
        {/* Broker badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold"
            style={{ backgroundColor: brokerInfo.color + '30', color: brokerInfo.color }}>
            {brokerInfo.logo}
          </div>
          {balance !== undefined && (
            <span className="font-mono" style={{ color: colors.textSecondary }}>
              {balance.toLocaleString()} {currency}
            </span>
          )}
        </div>

        <div className="w-px h-4" style={{ backgroundColor: colors.border }} />

        {/* Order type selector (all 4 types) */}
        <div className="flex items-center rounded overflow-hidden"
          style={{ border: `1px solid ${colors.border}` }}>
          {ORDER_TYPES.map(t => (
            <button key={t}
              onClick={() => setOrderType(t)}
              className="px-1.5 py-0.5 text-[10px] font-medium capitalize transition-all button-press"
              style={{
                backgroundColor: orderType === t ? colors.background : 'transparent',
                color: orderType === t ? colors.text : colors.textMuted,
              }}>
              {t === 'stop_limit' ? 'S-Lmt' : t}
            </button>
          ))}
        </div>

        {/* Price inputs */}
        {needsLimit && (
          <input type="number" value={limitPrice}
            onChange={e => setLimitPrice(e.target.value)}
            placeholder={currentPrice.toFixed(2)}
            className="w-20 px-1.5 py-0.5 rounded text-xs font-mono focus:outline-none"
            style={{ backgroundColor: colors.background, color: colors.text, border: `1px solid ${colors.border}` }}
          />
        )}
        {needsStop && (
          <div className="flex items-center gap-1">
            <span className="text-[9px]" style={{ color: colors.textMuted }}>Stop</span>
            <input type="number" value={stopPrice}
              onChange={e => setStopPrice(e.target.value)}
              placeholder={currentPrice.toFixed(2)}
              className="w-20 px-1.5 py-0.5 rounded text-xs font-mono focus:outline-none"
              style={{ backgroundColor: colors.background, color: colors.text, border: `1px solid ${colors.border}` }}
            />
          </div>
        )}

        {/* Quantity */}
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: colors.textMuted }}>Qty</span>
          <div className="flex items-center rounded overflow-hidden"
            style={{ border: `1px solid ${colors.border}` }}>
            <button onClick={() => setContractQuantity(Math.max(1, contractQuantity - 1))}
              className="w-5 h-5 flex items-center justify-center hover:bg-white/5 button-press"
              style={{ color: colors.textSecondary }}>-</button>
            <input type="number" value={contractQuantity}
              onChange={e => setContractQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-10 text-center text-xs font-mono focus:outline-none"
              style={{ backgroundColor: colors.background, color: colors.text }} />
            <button onClick={() => setContractQuantity(contractQuantity + 1)}
              className="w-5 h-5 flex items-center justify-center hover:bg-white/5 button-press"
              style={{ color: colors.textSecondary }}>+</button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-0.5">
          {[1, 5, 10].map(q => (
            <button key={q} onClick={() => setContractQuantity(q)}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono button-press"
              style={{
                backgroundColor: contractQuantity === q ? colors.background : 'transparent',
                color: contractQuantity === q ? colors.text : colors.textMuted,
              }}>{q}</button>
          ))}
        </div>

        {/* Advanced toggle */}
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-1.5 py-0.5 rounded text-[10px] transition-all button-press"
          style={{
            color: showAdvanced ? colors.text : colors.textMuted,
            backgroundColor: showAdvanced ? colors.background : 'transparent',
            border: `1px solid ${showAdvanced ? colors.border : 'transparent'}`,
          }}>
          {showAdvanced ? '▾ Adv' : '▸ Adv'}
        </button>

        <div className="flex-1" />

        {/* Buy / Sell buttons */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => handleTrade('buy')} disabled={isSubmitting}
            className={`px-4 py-1 rounded font-semibold text-xs transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${lastAction?.side === 'buy' ? 'trade-success' : ''}`}
            style={{
              backgroundColor: lastAction?.side === 'buy' ? '#059669' : '#10b981',
              color: '#fff',
              boxShadow: lastAction?.side === 'buy' ? '0 0 12px rgba(5,150,105,0.5)' : undefined,
            }}>
            {isSubmitting ? <span className="spinner inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> : 'BUY'}
          </button>
          <button onClick={() => handleTrade('sell')} disabled={isSubmitting}
            className={`px-4 py-1 rounded font-semibold text-xs transition-all hover:brightness-110 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${lastAction?.side === 'sell' ? 'trade-success' : ''}`}
            style={{
              backgroundColor: lastAction?.side === 'sell' ? '#dc2626' : '#ef4444',
              color: '#fff',
              boxShadow: lastAction?.side === 'sell' ? '0 0 12px rgba(220,38,38,0.5)' : undefined,
            }}>
            {isSubmitting ? <span className="spinner inline-block w-3 h-3 border border-white border-t-transparent rounded-full" /> : 'SELL'}
          </button>
        </div>
      </div>

      {/* Advanced panel (collapsible) */}
      {showAdvanced && (
        <div className="px-3 py-2 border-t flex items-center gap-4 text-xs animate-dropdown-in"
          style={{ borderColor: colors.border, backgroundColor: colors.background + '80' }}>

          {/* TP */}
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={tpEnabled} onChange={e => setTpEnabled(e.target.checked)}
                className="w-3 h-3 rounded accent-emerald-500" />
              <span className="text-[10px] font-medium" style={{ color: tpEnabled ? '#10b981' : colors.textMuted }}>TP</span>
            </label>
            {tpEnabled && (
              <input type="number" value={tpPrice}
                onChange={e => setTpPrice(e.target.value)}
                placeholder="Take Profit"
                className="w-20 px-1.5 py-0.5 rounded text-xs font-mono focus:outline-none"
                style={{ backgroundColor: colors.surface, color: '#10b981', border: `1px solid ${colors.border}` }}
              />
            )}
          </div>

          {/* SL */}
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={slEnabled} onChange={e => setSlEnabled(e.target.checked)}
                className="w-3 h-3 rounded accent-red-500" />
              <span className="text-[10px] font-medium" style={{ color: slEnabled ? '#ef4444' : colors.textMuted }}>SL</span>
            </label>
            {slEnabled && (
              <input type="number" value={slPrice}
                onChange={e => setSlPrice(e.target.value)}
                placeholder="Stop Loss"
                className="w-20 px-1.5 py-0.5 rounded text-xs font-mono focus:outline-none"
                style={{ backgroundColor: colors.surface, color: '#ef4444', border: `1px solid ${colors.border}` }}
              />
            )}
          </div>

          <div className="w-px h-4" style={{ backgroundColor: colors.border }} />

          {/* R:R presets */}
          <div className="flex items-center gap-1">
            <span className="text-[10px]" style={{ color: colors.textMuted }}>R:R</span>
            {RR_PRESETS.map(rr => (
              <button key={rr.label}
                onClick={() => applyRRPreset(rr.tp, rr.sl, 'buy')}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono button-press hover:bg-white/5"
                style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}>
                {rr.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4" style={{ backgroundColor: colors.border }} />

          {/* Trailing stop */}
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={trailingEnabled} onChange={e => setTrailingEnabled(e.target.checked)}
                className="w-3 h-3 rounded accent-amber-500" />
              <span className="text-[10px] font-medium" style={{ color: trailingEnabled ? '#f59e0b' : colors.textMuted }}>Trail</span>
            </label>
            {trailingEnabled && (
              <>
                <input type="number" value={trailingOffset}
                  onChange={e => setTrailingOffset(e.target.value)}
                  placeholder="Offset"
                  className="w-16 px-1.5 py-0.5 rounded text-xs font-mono focus:outline-none"
                  style={{ backgroundColor: colors.surface, color: '#f59e0b', border: `1px solid ${colors.border}` }}
                />
                <div className="flex items-center rounded overflow-hidden"
                  style={{ border: `1px solid ${colors.border}` }}>
                  {(['points', 'percent'] as const).map(m => (
                    <button key={m} onClick={() => setTrailingMode(m)}
                      className="px-1 py-0.5 text-[9px] button-press"
                      style={{
                        backgroundColor: trailingMode === m ? colors.surface : 'transparent',
                        color: trailingMode === m ? colors.text : colors.textMuted,
                      }}>
                      {m === 'points' ? 'pts' : '%'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
