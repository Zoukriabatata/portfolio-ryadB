import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface TradingState {
  // Broker connections
  activeBroker: BrokerType | null;
  connections: Record<BrokerType, BrokerConnection>;
  credentials: Record<BrokerType, BrokerCredentials | null>;

  // Trading settings
  contractQuantity: number;
  quickOrderEnabled: boolean;
  confirmOrders: boolean;

  // Orders & Positions
  orders: Order[];
  positions: Position[];

  // UI State
  showBrokerSelector: boolean;

  // Actions
  setActiveBroker: (broker: BrokerType | null) => void;
  setCredentials: (broker: BrokerType, creds: BrokerCredentials | null) => void;
  connect: (broker: BrokerType) => Promise<boolean>;
  disconnect: (broker: BrokerType) => void;

  setContractQuantity: (qty: number) => void;
  setQuickOrderEnabled: (enabled: boolean) => void;
  setConfirmOrders: (confirm: boolean) => void;
  setShowBrokerSelector: (show: boolean) => void;

  // Order actions
  placeOrder: (order: Omit<Order, 'id' | 'status' | 'filledQuantity' | 'createdAt' | 'updatedAt'>) => Promise<Order | null>;
  cancelOrder: (orderId: string) => Promise<boolean>;

  // Position actions
  closePosition: (symbol: string) => Promise<boolean>;
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
      quickOrderEnabled: true,
      confirmOrders: true,

      orders: [],
      positions: [],

      showBrokerSelector: false,

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
      setQuickOrderEnabled: (enabled) => set({ quickOrderEnabled: enabled }),
      setConfirmOrders: (confirm) => set({ confirmOrders: confirm }),
      setShowBrokerSelector: (show) => set({ showBrokerSelector: show }),

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
          setTimeout(() => {
            set((state) => ({
              orders: state.orders.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      status: 'filled' as OrderStatus,
                      filledQuantity: o.quantity,
                      avgFillPrice: o.price || orderData.price,
                      updatedAt: Date.now(),
                    }
                  : o
              ),
            }));
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
        set((state) => ({
          positions: state.positions.filter((p) => p.symbol !== symbol),
        }));
        return true;
      },
    }),
    {
      name: 'trading-store',
      partialize: (state) => ({
        activeBroker: state.activeBroker,
        credentials: state.credentials,
        contractQuantity: state.contractQuantity,
        quickOrderEnabled: state.quickOrderEnabled,
        confirmOrders: state.confirmOrders,
      }),
    }
  )
);
