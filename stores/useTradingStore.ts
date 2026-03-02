import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSoundManager } from '@/lib/audio/SoundManager';
import { useAccountPrefsStore } from '@/stores/useAccountPrefsStore';
import { useMarketStore } from '@/stores/useMarketStore';

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

  // Shared symbol — synced across /live and /footprint
  tradingSymbol: string;

  // UI State
  showBrokerSelector: boolean;
  showTradeBar: boolean;

  // Actions
  setTradingSymbol: (symbol: string) => void;
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

      tradingSymbol: 'btcusdt',

      contractQuantity: 1,
      leverage: 10,
      quickOrderEnabled: true,
      confirmOrders: true,

      orders: [],
      positions: [],
      closedTrades: [],

      showBrokerSelector: false,
      showTradeBar: false,

      setTradingSymbol: (symbol) => set({ tradingSymbol: symbol.toLowerCase() }),
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
          await new Promise((resolve) => setTimeout(resolve, 100));

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
          // Only auto-fill market orders immediately.
          // Limit/stop orders stay pending until price reaches them.
          if (orderData.type !== 'market') {
            return order;
          }

          // Capture price at click time
          const clickTimePrice = orderData.marketPrice || useMarketStore.getState().currentPrice || orderData.price || 0;
          const fillPrice = clickTimePrice;

          // Play sound asynchronously (don't block state update)
          queueMicrotask(() => {
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
          });

          // Fill immediately — no delay
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

          // AUTO-CANCEL: Cancel all pending orders for this symbol
          const updatedOrders = state.orders.map((o) =>
            o.status === 'pending' && o.symbol === symbol
              ? { ...o, status: 'cancelled' as OrderStatus, updatedAt: Date.now() }
              : o
          );

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
              orders: updatedOrders,
              positions: remainingPositions,
              closedTrades: [...state.closedTrades, ...newClosedTrades],
              connections: {
                ...state.connections,
                demo: { ...state.connections.demo, balance: currentBalance + balanceAdjustment, lastUpdate: Date.now() },
              },
            };
          }

          return { orders: updatedOrders, positions: remainingPositions, closedTrades: [...state.closedTrades, ...newClosedTrades] };
        });

        // Play close position sound
        try {
          const { soundEnabled, alertSound } = useAccountPrefsStore.getState();
          if (soundEnabled && alertSound !== 'none') {
            getSoundManager().playClosePosition();
          }
        } catch {}

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

        // Demo mode: check pending limit/stop orders against current price
        const state = get();
        if (state.activeBroker !== 'demo') return;
        const pendingOrders = state.orders.filter(
          (o) => o.status === 'pending' && o.symbol === symbol
        );
        for (const order of pendingOrders) {
          let shouldFill = false;
          let fillPrice = 0;

          if (order.type === 'limit' && order.price) {
            // Limit buy fills when price drops to or below limit price
            // Limit sell fills when price rises to or above limit price
            if (order.side === 'buy' && currentPrice <= order.price) {
              shouldFill = true;
              fillPrice = order.price;
            } else if (order.side === 'sell' && currentPrice >= order.price) {
              shouldFill = true;
              fillPrice = order.price;
            }
          } else if ((order.type === 'stop' || order.type === 'stop_limit') && (order.stopPrice || order.price)) {
            const triggerPrice = order.stopPrice || order.price || 0;
            // Stop buy fills when price rises to or above stop price
            // Stop sell fills when price drops to or below stop price
            if (order.side === 'buy' && currentPrice >= triggerPrice) {
              shouldFill = true;
              fillPrice = triggerPrice;
            } else if (order.side === 'sell' && currentPrice <= triggerPrice) {
              shouldFill = true;
              fillPrice = triggerPrice;
            }
          }

          if (shouldFill) {
            // Play sound
            try {
              const { soundEnabled, alertSound } = useAccountPrefsStore.getState();
              if (soundEnabled && alertSound !== 'none') {
                const sm = getSoundManager();
                if (alertSound === 'voice_male') sm.playVoiceAlert(order.side, 'male');
                else if (alertSound === 'voice_female') sm.playVoiceAlert(order.side, 'female');
                else if (alertSound === 'voice_senzoukria') sm.playVoiceAlert(order.side, 'senzoukria');
                else {
                  if (order.side === 'buy') sm.playBuyFilled();
                  else sm.playSellFilled();
                }
              }
            } catch {}

            // Fill the order using net position logic
            set((st) => {
              let resultOrders = st.orders.map((o) =>
                o.id === order.id
                  ? { ...o, status: 'filled' as OrderStatus, filledQuantity: o.quantity, avgFillPrice: fillPrice, updatedAt: Date.now() }
                  : o
              );
              const now = Date.now();
              const currentBalance = st.connections.demo?.balance || 100000;
              const newClosedTrades = [...st.closedTrades];
              const existing = st.positions.find((p) => p.symbol === order.symbol);
              let positions: Position[];
              let balanceChange = 0;

              if (!existing) {
                positions = [...st.positions, {
                  symbol: order.symbol, side: order.side, quantity: order.quantity,
                  entryPrice: fillPrice, currentPrice: fillPrice, pnl: 0, pnlPercent: 0, openedAt: now,
                }];
              } else if (existing.side === order.side) {
                const totalQty = existing.quantity + order.quantity;
                const avgEntry = (existing.entryPrice * existing.quantity + fillPrice * order.quantity) / totalQty;
                positions = st.positions.map((p) => p === existing ? { ...p, quantity: totalQty, entryPrice: avgEntry } : p);
              } else {
                if (order.quantity === existing.quantity) {
                  const pnl = existing.side === 'buy'
                    ? (fillPrice - existing.entryPrice) * existing.quantity
                    : (existing.entryPrice - fillPrice) * existing.quantity;
                  balanceChange = pnl;
                  positions = st.positions.filter((p) => p !== existing);
                  newClosedTrades.push({
                    id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    symbol: existing.symbol, side: existing.side, quantity: existing.quantity,
                    entryPrice: existing.entryPrice, exitPrice: fillPrice, pnl,
                    entryTime: existing.openedAt || now, exitTime: now, broker: st.activeBroker || 'demo', synced: false,
                  });
                  // Auto-cancel remaining pending orders for this symbol (TP hit → cancel SL, vice versa)
                  resultOrders = resultOrders.map((o) =>
                    o.status === 'pending' && o.symbol === order.symbol && o.id !== order.id
                      ? { ...o, status: 'cancelled' as OrderStatus, updatedAt: Date.now() }
                      : o
                  );
                  // Play close/SL/TP sound
                  try {
                    const { soundEnabled, alertSound } = useAccountPrefsStore.getState();
                    if (soundEnabled && alertSound !== 'none') {
                      const sm = getSoundManager();
                      if (order.type === 'stop' || order.type === 'stop_limit') sm.playStopHit();
                      else sm.playTakeProfitHit();
                    }
                  } catch {}
                } else if (order.quantity < existing.quantity) {
                  const pnl = existing.side === 'buy'
                    ? (fillPrice - existing.entryPrice) * order.quantity
                    : (existing.entryPrice - fillPrice) * order.quantity;
                  balanceChange = pnl;
                  positions = st.positions.map((p) => p === existing ? { ...p, quantity: p.quantity - order.quantity } : p);
                  newClosedTrades.push({
                    id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    symbol: existing.symbol, side: existing.side, quantity: order.quantity,
                    entryPrice: existing.entryPrice, exitPrice: fillPrice, pnl,
                    entryTime: existing.openedAt || now, exitTime: now, broker: st.activeBroker || 'demo', synced: false,
                  });
                } else {
                  const pnl = existing.side === 'buy'
                    ? (fillPrice - existing.entryPrice) * existing.quantity
                    : (existing.entryPrice - fillPrice) * existing.quantity;
                  balanceChange = pnl;
                  const remainder = order.quantity - existing.quantity;
                  positions = st.positions.filter((p) => p !== existing);
                  newClosedTrades.push({
                    id: `ct_${now}_${Math.random().toString(36).substr(2, 9)}`,
                    symbol: existing.symbol, side: existing.side, quantity: existing.quantity,
                    entryPrice: existing.entryPrice, exitPrice: fillPrice, pnl,
                    entryTime: existing.openedAt || now, exitTime: now, broker: st.activeBroker || 'demo', synced: false,
                  });
                  // Flip also cancels remaining orders
                  resultOrders = resultOrders.map((o) =>
                    o.status === 'pending' && o.symbol === order.symbol && o.id !== order.id
                      ? { ...o, status: 'cancelled' as OrderStatus, updatedAt: Date.now() }
                      : o
                  );
                  if (remainder > 0) {
                    positions.push({
                      symbol: order.symbol, side: order.side, quantity: remainder,
                      entryPrice: fillPrice, currentPrice: fillPrice, pnl: 0, pnlPercent: 0, openedAt: now,
                    });
                  }
                }
              }

              return {
                orders: resultOrders, positions, closedTrades: newClosedTrades,
                connections: { ...st.connections, demo: { ...st.connections.demo, balance: currentBalance + balanceChange, lastUpdate: now } },
              };
            });
          }
        }
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
        tradingSymbol: state.tradingSymbol,
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
