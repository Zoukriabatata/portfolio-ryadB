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
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:bg-white/5"
          style={{
            backgroundColor: connection?.connected ? `${brokerInfo?.color}15` : 'rgba(39, 39, 42, 0.8)',
            border: `1px solid ${connection?.connected ? brokerInfo?.color + '40' : 'rgba(63, 63, 70, 0.5)'}`,
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
            <span className="text-[10px] text-zinc-400">
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
            className={`text-zinc-500 transition-transform ${showBrokerSelector ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>

          {/* Connection indicator */}
          <div
            className={`w-2 h-2 rounded-full ${
              connection?.connected
                ? 'bg-green-500 animate-pulse'
                : connection?.connecting
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-zinc-600'
            }`}
          />
        </button>

        {/* Broker Dropdown */}
        {showBrokerSelector && (
          <div
            className="absolute top-full left-0 mt-2 w-72 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            style={{
              backgroundColor: 'rgba(20, 20, 28, 0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="p-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">Select Broker</h3>
              <p className="text-[10px] text-zinc-500">Connect to trade</p>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2">
              {(Object.keys(BROKER_INFO) as BrokerType[]).map((broker) => {
                const info = BROKER_INFO[broker];
                const conn = connections[broker];

                return (
                  <div
                    key={broker}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold"
                        style={{ backgroundColor: info.color, color: '#000' }}
                      >
                        {info.logo}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{info.name}</div>
                        <div className="text-[10px] text-zinc-500">{info.description}</div>
                      </div>
                    </div>

                    {conn.connected ? (
                      <button
                        onClick={() => disconnect(broker)}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Disconnect
                      </button>
                    ) : conn.connecting ? (
                      <div className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-yellow-500/20 text-yellow-400">
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
              <div className="p-3 border-t border-white/10 bg-black/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500">Account Balance</span>
                  <span className="text-sm font-bold text-green-400">
                    {connection.balance.toLocaleString()} {connection.currency}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-zinc-700/50" />

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
          <span className="text-[10px] text-red-200 opacity-80">SELL</span>
          <span className="text-white">{currentPrice.toFixed(2)}</span>
        </div>
        {isPlacingOrder === 'sell' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </button>

      {/* Contract Quantity */}
      <div className="flex flex-col items-center gap-1 px-3">
        <span className="text-[9px] text-zinc-500 uppercase">Contracts</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setContractQuantity(contractQuantity - 1)}
            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors flex items-center justify-center text-sm"
          >
            -
          </button>
          <input
            type="number"
            value={contractQuantity}
            onChange={(e) => setContractQuantity(parseInt(e.target.value) || 1)}
            className="w-12 h-6 text-center text-sm font-bold bg-zinc-900 border border-zinc-700 rounded text-white focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => setContractQuantity(contractQuantity + 1)}
            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors flex items-center justify-center text-sm"
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
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                contractQuantity === qty
                  ? 'bg-blue-500/30 text-blue-400'
                  : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
              }`}
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
          <span className="text-[10px] text-green-200 opacity-80">BUY</span>
          <span className="text-white">{currentPrice.toFixed(2)}</span>
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
