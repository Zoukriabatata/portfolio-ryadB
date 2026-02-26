import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSoundManager } from '@/lib/audio/SoundManager';
import { useAccountPrefsStore } from '@/stores/useAccountPrefsStore';

/**
 * TRADING STORE
 * Manages broker connections, orders, and trading state
 */

// Supported brokers (Futures, Crypto, Options only - no CFD)
export type BrokerType = 'binance' | 'bybit' | 'tradovate' | 'rithmic' | 'deribit' | 'demo';

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export interface BrokerConnection {
  broker: BrokerType;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  balance?: number;
  currency?: string;
  lastUpdate?: number;
}

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';

export interface Order {
  id: string;
  broker: BrokerType;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  marketPrice?: number; // Current market price for market orders
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Position {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openedAt: number; // timestamp for journal tracking
}

// Closed trade record for auto-journaling
export interface ClosedTrade {
  id: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  entryTime: number;
  exitTime: number;
  broker: BrokerType;
  synced: boolean; // true once posted to journal API
}

interface TradingState {
  // Broker connections
  activeBroker: BrokerType | null;
  connections: Record<BrokerType, BrokerConnection>;
  credentials: Record<BrokerType, BrokerCredentials | null>;

  // Trading settings
  contractQuantity: number;
  leverage: number;
  quickOrderEnabled: boolean;
  confirmOrders: boolean;

  // Orders & Positions
  orders: Order[];
  positions: Position[];

  // Auto-journal: closed trades pending sync
  closedTrades: ClosedTrade[];

  // UI State
  showBrokerSelector: boolean;
  showTradeBar: boolean;

  // Actions
  setActiveBroker: (broker: BrokerType | null) => void;
  setCredentials: (broker: BrokerType, creds: BrokerCredentials | null) => void;
  connect: (broker: BrokerType) => Promise<boolean>;
  disconnect: (broker: BrokerType) => void;

  setContractQuantity: (qty: number) => void;
  setLeverage: (lev: number) => void;
  setQuickOrderEnabled: (enabled: boolean) => void;
  setConfirmOrders: (confirm: boolean) => void;
  setShowBrokerSelector: (show: boolean) => void;
  setShowTradeBar: (show: boolean) => void;

  // Order actions
  placeOrder: (order: Omit<Order, 'id' | 'status' | 'filledQuantity' | 'createdAt' | 'updatedAt'>) => Promise<Order | null>;
  cancelOrder: (orderId: string) => Promise<boolean>;

  // Position actions
  closePosition: (symbol: string) => Promise<boolean>;
  updatePositionPrices: (symbol: string, currentPrice: number) => void;

  // Auto-journal actions
  markTradesSynced: (ids: string[]) => void;
}

// Broker display info (Futures, Crypto, Options only)
export const BROKER_INFO: Record<BrokerType, { name: string; logo: string; color: string; description: string; category: 'crypto' | 'futures' | 'options' }> = {
  binance: {
    name: 'Binance Futures',
    logo: 'B',
    color: '#F0B90B',
    description: 'Crypto perpetual futures',
    category: 'crypto',
  },
  bybit: {
    name: 'Bybit',
    logo: 'BY',
    color: '#FFAB00',
    description: 'Crypto derivatives & options',
    category: 'crypto',
  },
  tradovate: {
    name: 'Tradovate',
    logo: 'TV',
    color: '#00BCD4',
    description: 'CME & ICE futures',
    category: 'futures',
  },
  rithmic: {
    name: 'Rithmic',
    logo: 'R',
    color: '#4CAF50',
    description: 'Professional futures trading',
    category: 'futures',
  },
  deribit: {
    name: 'Deribit',
    logo: 'DB',
    color: '#00D084',
    description: 'BTC & ETH options',
    category: 'options',
  },
  demo: {
    name: 'Demo Account',
    logo: 'D',
    color: '#9E9E9E',
    description: 'Paper trading (simulated)',
    category: 'crypto',
  },
};

const initialConnections: Record<BrokerType, BrokerConnection> = {
  binance: { broker: 'binance', connected: false, connecting: false, error: null },
  bybit: { broker: 'bybit', connected: false, connecting: false, error: null },
  tradovate: { broker: 'tradovate', connected: false, connecting: false, error: null },
  rithmic: { broker: 'rithmic', connected: false, connecting: false, error: null },
  deribit: { broker: 'deribit', connected: false, connecting: false, error: null },
  demo: { broker: 'demo', connected: false, connecting: false, error: null },
};

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      activeBroker: null,
      connections: initialConnections,
      credentials: {
        binance: null,
        bybit: null,
        tradovate: null,
        rithmic: null,
        deribit: null,
        demo: null,
      },

      contractQuantity: 1,
      leverage: 10,
      quickOrderEnabled: true,
      confirmOrders: true,

      orders: [],
      positions: [],
      closedTrades: [],

      showBrokerSelector: false,
      showTradeBar: false,

      setActiveBroker: (broker) => set({ activeBroker: broker }),

      setCredentials: (broker, creds) => set((state) => ({
        credentials: { ...state.credentials, [broker]: creds },
      })),

      connect: async (broker) => {
        set((state) => ({
          connections: {
            ...state.connections,
            [broker]: { ...state.connections[broker], connecting: true, error: null },
          },
        }));

        try {
          // Demo account - instant connection
          if (broker === 'demo') {
            await new Promise((resolve) => setTimeout(resolve, 500));
            set((state) => ({
              activeBroker: broker,
              connections: {
                ...state.connections,
                [broker]: {
                  ...state.connections[broker],
                  connected: true,
                  connecting: false,
                  balance: 100000,
                  currency: 'USD',
                  lastUpdate: Date.now(),
                },
              },
            }));
            return true;
          }

          // Real broker - check credentials
          const creds = get().credentials[broker];
          if (!creds) {
            throw new Error('Credentials required');
          }

          // Simulate connection (in real app, this would call broker API)
          await new Promise((resolve) => setTimeout(resolve, 1000));

          set((state) => ({
            activeBroker: broker,
            connections: {
              ...state.connections,
              [broker]: {
                ...state.connections[broker],
                connected: true,
                connecting: false,
                balance: 50000,
                currency: broker === 'binance' || broker === 'bybit' ? 'USDT' : broker === 'deribit' ? 'BTC' : 'USD',
                lastUpdate: Date.now(),
              },
            },
          }));

          return true;
        } catch (error) {
          set((state) => ({
            connections: {
              ...state.connections,
              [broker]: {
                ...state.connections[broker],
                connected: false,
                connecting: false,
                error: error instanceof Error ? error.message : 'Connection failed',
              },
            },
          }));
          return false;
        }
      },

      disconnect: (broker) => {
        set((state) => ({
          activeBroker: state.activeBroker === broker ? null : state.activeBroker,
          connections: {
            ...state.connections,
            [broker]: { ...initialConnections[broker] },
          },
        }));
      },

      setContractQuantity: (qty) => set({ contractQuantity: Math.max(1, qty) }),
      setLeverage: (lev) => set({ leverage: Math.max(1, Math.min(125, lev)) }),
      setQuickOrderEnabled: (enabled) => set({ quickOrderEnabled: enabled }),
      setConfirmOrders: (confirm) => set({ confirmOrders: confirm }),
      setShowBrokerSelector: (show) => set({ showBrokerSelector: show }),
      setShowTradeBar: (show) => set({ showTradeBar: show }),

      placeOrder: async (orderData) => {
        const state = get();
        if (!state.activeBroker) {
          console.error('No active broker');
          return null;
        }

        const connection = state.connections[state.activeBroker];
        if (!connection.connected) {
          console.error('Broker not connected');
          return null;
        }

        const order: Order = {
          ...orderData,
          id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'pending',
          filledQuantity: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set((state) => ({
          orders: [order, ...state.orders],
        }));

        // Simulate order fill for demo
        if (state.activeBroker === 'demo') {
          // For market orders, use marketPrice (latest real-time price) first
          const fillPrice = orderData.type === 'market'
            ? (orderData.marketPrice || orderData.price || 0)
            : (orderData.price || orderData.marketPrice || 0);

          setTimeout(() => {
            // Play sound if enabled
            try {
              const { soundEnabled, alertSound } = useAccountPrefsStore.getState();
              if (soundEnabled && alertSound !== 'none') {
                const sm = getSoundManager();
                if (alertSound === 'voice_male') {
                  sm.playVoiceAlert(orderData.side, 'male');
                } else if (alertSound === 'voice_female') {
                  sm.playVoiceAlert(orderData.side, 'female');
                } else if (alertSound === 'voice_senzoukria') {
                  sm.playVoiceAlert(orderData.side, 'senzoukria');
                } else {
                  if (orderData.side === 'buy') sm.playBuyFilled();
                  else sm.playSellFilled();
                }
              }
            } catch {}

            set((state) => {
              // Update order to filled
              const updatedOrders = state.orders.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      status: 'filled' as OrderStatus,
                      filledQuantity: o.quantity,
                      avgFillPrice: fillPrice,
                      updatedAt: Date.now(),
                    }
                  : o
              );

              const now = Date.now();
              const currentBalance = state.connections.demo?.balance || 100000;
              const newClosedTrades = [...state.closedTrades];

              // --- Net position system ---
              // Find ANY existing position for this symbol (regardless of side)
              const existing = state.positions.find((p) => p.symbol === orderData.symbol);
              let positions: Position[];
              let balanceChange = 0;

              if (!existing) {
                // No position — open new
                positions = [
                  ...state.positions,
                  {
                    symbol: orderData.symbol,
                    side: orderData.side,
                    quantity: orderData.quantity,
                    entryPrice: fillPrice,
                    currentPrice: fillPrice,
                    pnl: 0,
                    pnlPercent: 0,
                    openedAt: now,
                  },
                ];
              } else if (existing.side === orderData.side) {
                // Same side — average into position
                const totalQty = existing.quantity + orderData.quantity;
                const avgEntry = (existing.entryPrice * existing.quantity + fillPrice * orderData.quantity) / totalQty;
                positions = state.positions.map((p) =>
                  p === existing ? { ...p, quantity: totalQty, entryPrice: avgEntry } : p
                );
              } else {
                // Opposite side — reduce or close or flip
                if (orderData.quantity === existing.quantity) {
                  // Exact close
                  const pnl = existing.side === 'buy'
                    ? (fillPrice - existing.entryPrice) * existing.quantity
                    : (existing.entryPrice - fillPrice) * existing.quantity;
                  balanceChange = pnl;
                  positions = state.positions.filter((p) => p !== existing);
                  newClosedTrades.push({
                    id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    symbol: existing.symbol,
                    side: existing.side,
                    quantity: existing.quantity,
                    entryPrice: existing.entryPrice,
                    exitPrice: fillPrice,
                    pnl,
                    entryTime: existing.openedAt || now,
                    exitTime: now,
                    broker: state.activeBroker || 'demo',
                    synced: false,
                  });
                } else if (orderData.quantity < existing.quantity) {
                  // Partial close — reduce position size
                  const pnl = existing.side === 'buy'
                    ? (fillPrice - existing.entryPrice) * orderData.quantity
                    : (existing.entryPrice - fillPrice) * orderData.quantity;
                  balanceChange = pnl;
                  positions = state.positions.map((p) =>
                    p === existing ? { ...p, quantity: p.quantity - orderData.quantity } : p
                  );
                  newClosedTrades.push({
                    id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    symbol: existing.symbol,
                    side: existing.side,
                    quantity: orderData.quantity,
                    entryPrice: existing.entryPrice,
                    exitPrice: fillPrice,
                    pnl,
                    entryTime: existing.openedAt || now,
                    exitTime: now,
                    broker: state.activeBroker || 'demo',
                    synced: false,
                  });
                } else {
                  // Flip — close existing + open remainder on new side
                  const pnl = existing.side === 'buy'
                    ? (fillPrice - existing.entryPrice) * existing.quantity
                    : (existing.entryPrice - fillPrice) * existing.quantity;
                  balanceChange = pnl;
                  const remainder = orderData.quantity - existing.quantity;
                  positions = state.positions.filter((p) => p !== existing);
                  newClosedTrades.push({
                    id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    symbol: existing.symbol,
                    side: existing.side,
                    quantity: existing.quantity,
                    entryPrice: existing.entryPrice,
                    exitPrice: fillPrice,
                    pnl,
                    entryTime: existing.openedAt || now,
                    exitTime: now,
                    broker: state.activeBroker || 'demo',
                    synced: false,
                  });
                  if (remainder > 0) {
                    positions.push({
                      symbol: orderData.symbol,
                      side: orderData.side,
                      quantity: remainder,
                      entryPrice: fillPrice,
                      currentPrice: fillPrice,
                      pnl: 0,
                      pnlPercent: 0,
                      openedAt: now,
                    });
                  }
                }
              }

              return {
                orders: updatedOrders,
                positions,
                closedTrades: newClosedTrades,
                connections: {
                  ...state.connections,
                  demo: {
                    ...state.connections.demo,
                    balance: currentBalance + balanceChange,
                    lastUpdate: now,
                  },
                },
              };
            });
          }, 200);
        }

        return order;
      },

      cancelOrder: async (orderId) => {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId ? { ...o, status: 'cancelled' as OrderStatus, updatedAt: Date.now() } : o
          ),
        }));
        return true;
      },

      closePosition: async (symbol) => {
        set((state) => {
          const closingPositions = state.positions.filter((p) => p.symbol === symbol);
          const remainingPositions = state.positions.filter((p) => p.symbol !== symbol);

          // Record closed trades for auto-journal
          const now = Date.now();
          const activeBroker = state.activeBroker;
          const newClosedTrades: ClosedTrade[] = closingPositions.map((pos) => ({
            id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
            symbol: pos.symbol,
            side: pos.side,
            quantity: pos.quantity,
            entryPrice: pos.entryPrice,
            exitPrice: pos.currentPrice,
            pnl: pos.pnl,
            entryTime: pos.openedAt || now,
            exitTime: now,
            broker: activeBroker || 'demo',
            synced: false,
          }));

          // Calculate realized PnL and return margin to balance
          const leverage = state.leverage || 10;
          let balanceAdjustment = 0;
          for (const pos of closingPositions) {
            // Return margin (notional / leverage) + realized PnL
            const margin = (pos.entryPrice * pos.quantity) / leverage;
            balanceAdjustment += margin + pos.pnl;
          }

          if (activeBroker === 'demo' && closingPositions.length > 0) {
            const currentBalance = state.connections.demo?.balance || 100000;
            return {
              positions: remainingPositions,
              closedTrades: [...state.closedTrades, ...newClosedTrades],
              connections: {
                ...state.connections,
                demo: { ...state.connections.demo, balance: currentBalance + balanceAdjustment, lastUpdate: Date.now() },
              },
            };
          }

          return { positions: remainingPositions, closedTrades: [...state.closedTrades, ...newClosedTrades] };
        });
        return true;
      },

      updatePositionPrices: (symbol, currentPrice) => {
        set((state) => {
          const hasMatch = state.positions.some((p) => p.symbol === symbol);
          if (!hasMatch) return state;
          return {
            positions: state.positions.map((p) => {
              if (p.symbol !== symbol) return p;
              const pnl = p.side === 'buy'
                ? (currentPrice - p.entryPrice) * p.quantity
                : (p.entryPrice - currentPrice) * p.quantity;
              const pnlPercent = p.entryPrice > 0 ? (pnl / (p.entryPrice * p.quantity)) * 100 : 0;
              return { ...p, currentPrice, pnl, pnlPercent };
            }),
          };
        });
      },

      markTradesSynced: (ids) => {
        set((state) => ({
          closedTrades: state.closedTrades.map((t) =>
            ids.includes(t.id) ? { ...t, synced: true } : t
          ).filter((t) => t.synced), // Remove synced trades to keep the array small
        }));
      },
    }),
    {
      name: 'trading-store',
      partialize: (state) => ({
        activeBroker: state.activeBroker,
        credentials: state.credentials,
        contractQuantity: state.contractQuantity,
        leverage: state.leverage,
        quickOrderEnabled: state.quickOrderEnabled,
        confirmOrders: state.confirmOrders,
        showTradeBar: state.showTradeBar,
        positions: state.positions,
        closedTrades: state.closedTrades.filter(t => !t.synced), // Only persist unsynced trades
        orders: state.orders.filter(o => o.status === 'filled' || o.status === 'pending').slice(0, 50),
        connections: state.activeBroker === 'demo' ? { demo: state.connections.demo } : undefined,
      }),
    }
  )
);
