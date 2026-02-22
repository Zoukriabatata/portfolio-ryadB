'use client';

/**
 * ORDER CONTEXT MENU
 * Right-click menu for placing limit and stop orders
 * - Above current price: Limit Sell, Stop Buy
 * - Below current price: Limit Buy, Stop Sell
 */

import { useEffect, useRef } from 'react';
import { useTradingStore, BROKER_INFO } from '@/stores/useTradingStore';

interface OrderContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  clickPrice: number;
  currentPrice: number;
  symbol: string;
  onClose: () => void;
  onOrderPlaced?: () => void;
}

export default function OrderContextMenu({
  isOpen,
  position,
  clickPrice,
  currentPrice,
  symbol,
  onClose,
  onOrderPlaced,
}: OrderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { activeBroker, connections, contractQuantity, placeOrder, setShowBrokerSelector } = useTradingStore();

  // Close menu on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isAbovePrice = clickPrice > currentPrice;
  const priceDiff = Math.abs(clickPrice - currentPrice);
  const priceDiffPercent = ((priceDiff / currentPrice) * 100).toFixed(2);

  const connection = activeBroker ? connections[activeBroker] : null;
  const brokerInfo = activeBroker ? BROKER_INFO[activeBroker] : null;
  const isConnected = connection?.connected;

  const handlePlaceOrder = async (type: 'limit' | 'stop', side: 'buy' | 'sell') => {
    if (!isConnected) {
      setShowBrokerSelector(true);
      onClose();
      return;
    }

    if (!activeBroker) return;

    try {
      await placeOrder({
        broker: activeBroker,
        symbol,
        side,
        type,
        quantity: contractQuantity,
        price: type === 'limit' ? clickPrice : undefined,
        stopPrice: type === 'stop' ? clickPrice : undefined,
      });

      onOrderPlaced?.();
      onClose();
    } catch (error) {
      console.error('Order failed:', error);
    }
  };

  // Determine which orders to show based on price position
  const orderOptions = isAbovePrice
    ? [
        {
          type: 'limit' as const,
          side: 'sell' as const,
          label: 'Limit Sell',
          description: 'Sell when price reaches',
          icon: '↓',
          color: '#ef4444',
          bgColor: 'rgba(239, 68, 68, 0.1)',
        },
        {
          type: 'stop' as const,
          side: 'buy' as const,
          label: 'Stop Buy',
          description: 'Buy if price breaks above',
          icon: '↑',
          color: '#22c55e',
          bgColor: 'rgba(34, 197, 94, 0.1)',
        },
      ]
    : [
        {
          type: 'limit' as const,
          side: 'buy' as const,
          label: 'Limit Buy',
          description: 'Buy when price reaches',
          icon: '↑',
          color: '#22c55e',
          bgColor: 'rgba(34, 197, 94, 0.1)',
        },
        {
          type: 'stop' as const,
          side: 'sell' as const,
          label: 'Stop Sell',
          description: 'Sell if price breaks below',
          icon: '↓',
          color: '#ef4444',
          bgColor: 'rgba(239, 68, 68, 0.1)',
        },
      ];

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div
        className="rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-light)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
          minWidth: 220,
        }}
      >
        {/* Header - Price Info */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase" style={{ color: 'var(--text-dimmed)' }}>Order at Price</span>
            <span
              className="text-[10px] px-2 py-0.5 rounded"
              style={{
                backgroundColor: isAbovePrice ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: isAbovePrice ? '#22c55e' : '#ef4444',
              }}
            >
              {isAbovePrice ? `+${priceDiffPercent}%` : `-${priceDiffPercent}%`}
            </span>
          </div>
          <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
            {clickPrice.toFixed(2)}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
            Current: {currentPrice.toFixed(2)} | Qty: {contractQuantity}
          </div>
        </div>

        {/* Order Options */}
        <div className="p-2">
          {orderOptions.map((option) => (
            <button
              key={`${option.type}-${option.side}`}
              onClick={() => handlePlaceOrder(option.type, option.side)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: option.bgColor,
              }}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl font-bold"
                style={{
                  backgroundColor: option.color + '30',
                  color: option.color,
                }}
              >
                {option.icon}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{option.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{option.description}</div>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={option.color}
                strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>

        {/* Broker Status */}
        <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isConnected ? 'var(--bull)' : 'var(--text-dimmed)' }}
              />
              <span className="text-[10px]" style={{ color: 'var(--text-dimmed)' }}>
                {isConnected ? brokerInfo?.name : 'Not connected'}
              </span>
            </div>
            {!isConnected && (
              <button
                onClick={() => {
                  setShowBrokerSelector(true);
                  onClose();
                }}
                className="text-[10px] hover:opacity-80 transition-opacity"
                style={{ color: 'var(--primary)' }}
              >
                Connect
              </button>
            )}
          </div>
        </div>

        {/* Cancel */}
        <div className="px-2 pb-2">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg text-xs transition-all hover:bg-[var(--surface-hover)] active:scale-[0.98]"
            style={{ color: 'var(--text-dimmed)' }}
          >
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
