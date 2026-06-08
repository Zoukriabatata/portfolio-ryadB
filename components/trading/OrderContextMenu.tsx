'use client';

/**
 * ORDER CONTEXT MENU
 * Right-click menu for placing limit and stop orders
 * - Above current price: Limit Sell, Stop Buy
 * - Below current price: Limit Buy, Stop Sell
 */

import { useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  const orderOptions: {
    type: 'limit' | 'stop';
    side: 'buy' | 'sell';
    label: string;
    description: string;
    Icon: LucideIcon;
    color: string;
    bgColor: string;
    iconBg: string;
  }[] = isAbovePrice
    ? [
        {
          type: 'limit' as const,
          side: 'sell' as const,
          label: 'Limit Sell',
          description: 'Sell when price reaches',
          Icon: ArrowDown,
          color: 'var(--bear)',
          bgColor: 'rgb(var(--bear-rgb) / 0.1)',
          iconBg: 'rgb(var(--bear-rgb) / 0.2)',
        },
        {
          type: 'stop' as const,
          side: 'buy' as const,
          label: 'Stop Buy',
          description: 'Buy if price breaks above',
          Icon: ArrowUp,
          color: 'var(--bull)',
          bgColor: 'rgb(var(--bull-rgb) / 0.1)',
          iconBg: 'rgb(var(--bull-rgb) / 0.2)',
        },
      ]
    : [
        {
          type: 'limit' as const,
          side: 'buy' as const,
          label: 'Limit Buy',
          description: 'Buy when price reaches',
          Icon: ArrowUp,
          color: 'var(--bull)',
          bgColor: 'rgb(var(--bull-rgb) / 0.1)',
          iconBg: 'rgb(var(--bull-rgb) / 0.2)',
        },
        {
          type: 'stop' as const,
          side: 'sell' as const,
          label: 'Stop Sell',
          description: 'Sell if price breaks below',
          Icon: ArrowDown,
          color: 'var(--bear)',
          bgColor: 'rgb(var(--bear-rgb) / 0.1)',
          iconBg: 'rgb(var(--bear-rgb) / 0.2)',
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
        className="panel-glass rounded-xl overflow-hidden"
        style={{
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
                backgroundColor: isAbovePrice ? 'rgb(var(--bull-rgb) / 0.2)' : 'rgb(var(--bear-rgb) / 0.2)',
                color: isAbovePrice ? 'var(--bull)' : 'var(--bear)',
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
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: option.iconBg,
                  color: option.color,
                }}
              >
                <option.Icon size={20} strokeWidth={1.5} />
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{option.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{option.description}</div>
              </div>
              <ChevronRight size={16} strokeWidth={1.5} style={{ color: option.color }} />
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
