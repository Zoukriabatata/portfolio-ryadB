'use client';

/**
 * TRADING PANEL
 * Quick trading interface with:
 * - Buy/Sell buttons
 * - Contract quantity selector
 * - Broker connection status
 * - Broker selector dropdown
 */

import { useState, useRef, useEffect } from 'react';
import { useTradingStore, BROKER_INFO, type BrokerType, type OrderSide } from '@/stores/useTradingStore';

interface TradingPanelProps {
  symbol: string;
  currentPrice: number;
  onOrderPlaced?: (side: OrderSide, quantity: number) => void;
}

export default function TradingPanel({ symbol, currentPrice, onOrderPlaced }: TradingPanelProps) {
  const {
    activeBroker,
    connections,
    contractQuantity,
    setContractQuantity,
    showBrokerSelector,
    setShowBrokerSelector,
    connect,
    disconnect,
    placeOrder,
    quickOrderEnabled,
  } = useTradingStore();

  const [isPlacingOrder, setIsPlacingOrder] = useState<OrderSide | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowBrokerSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowBrokerSelector]);

  const connection = activeBroker ? connections[activeBroker] : null;
  const brokerInfo = activeBroker ? BROKER_INFO[activeBroker] : null;

  const handleQuickOrder = async (side: OrderSide) => {
    if (!activeBroker || !connection?.connected) {
      setShowBrokerSelector(true);
      return;
    }

    setIsPlacingOrder(side);

    try {
      await placeOrder({
        broker: activeBroker,
        symbol,
        side,
        type: 'market',
        quantity: contractQuantity,
        price: currentPrice,
      });

      onOrderPlaced?.(side, contractQuantity);
    } catch (error) {
      console.error('Order failed:', error);
    } finally {
      setIsPlacingOrder(null);
    }
  };

  const handleConnect = async (broker: BrokerType) => {
    await connect(broker);
    setShowBrokerSelector(false);
  };

  // Quick quantity presets
  const quantityPresets = [1, 2, 5, 10, 25, 50, 100];

  return (
    <div className="flex items-center gap-2">
      {/* Broker Selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowBrokerSelector(!showBrokerSelector)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:bg-[var(--surface-hover)]"
          style={{
            backgroundColor: connection?.connected ? `${brokerInfo?.color}15` : 'var(--surface-elevated)',
            border: `1px solid ${connection?.connected ? brokerInfo?.color + '40' : 'var(--border)'}`,
          }}
        >
          {/* Broker Logo */}
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: brokerInfo?.color || '#525252',
              color: '#000',
            }}
          >
            {brokerInfo?.logo || '?'}
          </div>

          {/* Status */}
          <div className="flex flex-col items-start">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {connection?.connected ? 'Connected' : 'Not connected'}
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: brokerInfo?.color || '#a1a1aa' }}
            >
              {brokerInfo?.name || 'Select Broker'}
            </span>
          </div>

          {/* Arrow */}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${showBrokerSelector ? 'rotate-180' : ''}`}
            style={{ color: 'var(--text-dimmed)' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>

          {/* Connection indicator */}
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: connection?.connected
                ? 'var(--bull)'
                : connection?.connecting
                  ? 'var(--warning)'
                  : 'var(--text-dimmed)',
              animation: connection?.connected || connection?.connecting ? 'pulse 2s infinite' : undefined,
            }}
          />
        </button>

        {/* Broker Dropdown */}
        {showBrokerSelector && (
          <div
            className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--border-light)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Select Broker</h3>
              <p className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Connect to trade</p>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2">
              {(Object.keys(BROKER_INFO) as BrokerType[]).map((broker) => {
                const info = BROKER_INFO[broker];
                const conn = connections[broker];

                return (
                  <div
                    key={broker}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: info.color, color: '#000' }}
                      >
                        {info.logo}
                      </div>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{info.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>{info.description}</div>
                      </div>
                    </div>

                    {conn.connected ? (
                      <button
                        onClick={() => disconnect(broker)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors"
                        style={{ backgroundColor: 'var(--bear-bg)', color: 'var(--bear)' }}
                      >
                        Disconnect
                      </button>
                    ) : conn.connecting ? (
                      <div className="px-3 py-1.5 rounded-lg text-[10px] font-medium" style={{ backgroundColor: 'var(--warning-bg, rgba(234,179,8,0.2))', color: 'var(--warning)' }}>
                        Connecting...
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnect(broker)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors"
                        style={{
                          backgroundColor: `${info.color}20`,
                          color: info.color,
                        }}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Balance display */}
            {connection?.connected && connection.balance !== undefined && (
              <div className="p-3 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>Account Balance</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--bull)' }}>
                    {connection.balance.toLocaleString()} {connection.currency}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-8" style={{ backgroundColor: 'var(--border)' }} />

      {/* Sell Button */}
      <button
        onClick={() => handleQuickOrder('sell')}
        disabled={isPlacingOrder !== null}
        className="relative px-6 py-2.5 rounded-lg font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
        style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          boxShadow: isPlacingOrder === 'sell'
            ? '0 0 20px rgba(239, 68, 68, 0.5)'
            : '0 4px 12px rgba(239, 68, 68, 0.3)',
        }}
      >
        <div className="flex flex-col items-center">
          <span className="text-[10px] opacity-80" style={{ color: 'var(--bear)' }}>SELL</span>
          <span style={{ color: '#fff' }}>{currentPrice.toFixed(2)}</span>
        </div>
        {isPlacingOrder === 'sell' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>

      {/* Contract Quantity */}
      <div className="flex flex-col items-center gap-1 px-3">
        <span className="text-[9px] uppercase" style={{ color: 'var(--text-dimmed)' }}>Contracts</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setContractQuantity(contractQuantity - 1)}
            className="w-6 h-6 rounded flex items-center justify-center text-sm transition-colors hover:bg-[var(--surface-hover)]"
            style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            -
          </button>
          <input
            type="number"
            value={contractQuantity}
            onChange={(e) => setContractQuantity(parseInt(e.target.value) || 1)}
            className="w-12 h-6 text-center text-sm font-bold rounded focus:outline-none"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            onClick={() => setContractQuantity(contractQuantity + 1)}
            className="w-6 h-6 rounded flex items-center justify-center text-sm transition-colors hover:bg-[var(--surface-hover)]"
            style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-muted)' }}
          >
            +
          </button>
        </div>
        {/* Quick presets */}
        <div className="flex gap-0.5">
          {quantityPresets.slice(0, 5).map((qty) => (
            <button
              key={qty}
              onClick={() => setContractQuantity(qty)}
              className="px-1.5 py-0.5 rounded text-[9px] transition-colors"
              style={{
                backgroundColor: contractQuantity === qty ? 'var(--primary-glow)' : 'var(--surface-elevated)',
                color: contractQuantity === qty ? 'var(--primary)' : 'var(--text-dimmed)',
              }}
            >
              {qty}
            </button>
          ))}
        </div>
      </div>

      {/* Buy Button */}
      <button
        onClick={() => handleQuickOrder('buy')}
        disabled={isPlacingOrder !== null}
        className="relative px-6 py-2.5 rounded-lg font-bold text-sm transition-all active:scale-95 disabled:opacity-50"
        style={{
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          boxShadow: isPlacingOrder === 'buy'
            ? '0 0 20px rgba(34, 197, 94, 0.5)'
            : '0 4px 12px rgba(34, 197, 94, 0.3)',
        }}
      >
        <div className="flex flex-col items-center">
          <span className="text-[10px] opacity-80" style={{ color: 'var(--bull)' }}>BUY</span>
          <span style={{ color: '#fff' }}>{currentPrice.toFixed(2)}</span>
        </div>
        {isPlacingOrder === 'buy' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>
    </div>
  );
}
