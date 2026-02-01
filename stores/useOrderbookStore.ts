import { create } from 'zustand';
import type { OrderbookSnapshot, LiquidityWall } from '@/types/orderbook';
import type { LiquidityDelta, WhaleOrder } from '@/types/heatmap';
import { calculateLiquidityDelta, detectWhaleOrders } from '@/lib/calculations/heatmapAnalysis';

interface OrderbookState {
  // Raw orderbook data
  bids: Map<number, number>; // price -> quantity
  asks: Map<number, number>; // price -> quantity
  lastUpdateId: number;

  // Aggregated data for heatmap
  heatmapHistory: OrderbookSnapshot[];
  maxHistoryLength: number;

  // Advanced analysis data
  liquidityDeltas: LiquidityDelta[];
  whaleOrders: WhaleOrder[];
  previousBids: Map<number, number>;
  previousAsks: Map<number, number>;

  // Derived data
  bidWalls: LiquidityWall[];
  askWalls: LiquidityWall[];
  bidAskImbalance: number; // -1 to 1
  spread: number;
  midPrice: number;

  // Actions
  updateOrderbook: (
    bids: [string, string][],
    asks: [string, string][],
    updateId: number
  ) => void;
  setInitialOrderbook: (
    bids: [string, string][],
    asks: [string, string][],
    lastUpdateId: number
  ) => void;
  calculateWalls: (threshold: number) => void;
  detectWhales: (thresholdStdDev: number) => void;
  reset: () => void;
}

const MAX_HEATMAP_HISTORY = 300; // ~30 seconds at 100ms updates
const WALL_THRESHOLD_MULTIPLIER = 3; // 3x average size

const MAX_LIQUIDITY_DELTAS = 100;
const MAX_WHALE_ORDERS = 50;

export const useOrderbookStore = create<OrderbookState>((set, get) => ({
  bids: new Map(),
  asks: new Map(),
  lastUpdateId: 0,
  heatmapHistory: [],
  maxHistoryLength: MAX_HEATMAP_HISTORY,
  liquidityDeltas: [],
  whaleOrders: [],
  previousBids: new Map(),
  previousAsks: new Map(),
  bidWalls: [],
  askWalls: [],
  bidAskImbalance: 0,
  spread: 0,
  midPrice: 0,

  setInitialOrderbook: (bids, asks, lastUpdateId) => {
    const bidMap = new Map<number, number>();
    const askMap = new Map<number, number>();

    bids.forEach(([price, qty]) => {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      if (q > 0) bidMap.set(p, q);
    });

    asks.forEach(([price, qty]) => {
      const p = parseFloat(price);
      const q = parseFloat(qty);
      if (q > 0) askMap.set(p, q);
    });

    // Calculate mid price and spread
    const bestBid = Math.max(...bidMap.keys());
    const bestAsk = Math.min(...askMap.keys());
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    set({
      bids: bidMap,
      asks: askMap,
      lastUpdateId,
      midPrice,
      spread,
    });
  },

  updateOrderbook: (bids, asks, updateId) =>
    set((state) => {
      if (updateId <= state.lastUpdateId) return state;

      const newBids = new Map(state.bids);
      const newAsks = new Map(state.asks);

      // Apply bid updates
      bids.forEach(([price, qty]) => {
        const p = parseFloat(price);
        const q = parseFloat(qty);
        if (q === 0) {
          newBids.delete(p);
        } else {
          newBids.set(p, q);
        }
      });

      // Apply ask updates
      asks.forEach(([price, qty]) => {
        const p = parseFloat(price);
        const q = parseFloat(qty);
        if (q === 0) {
          newAsks.delete(p);
        } else {
          newAsks.set(p, q);
        }
      });

      // Calculate liquidity deltas
      let newDeltas = state.liquidityDeltas;
      if (state.previousBids.size > 0 || state.previousAsks.size > 0) {
        const deltas = calculateLiquidityDelta(
          { bids: state.previousBids, asks: state.previousAsks },
          { bids: newBids, asks: newAsks }
        );
        if (deltas.length > 0) {
          newDeltas = [...state.liquidityDeltas, ...deltas].slice(-MAX_LIQUIDITY_DELTAS);
        }
      }

      // Detect whale orders
      const whales = detectWhaleOrders(newBids, newAsks, 3.0);

      // Calculate metrics
      const bestBid = newBids.size > 0 ? Math.max(...newBids.keys()) : 0;
      const bestAsk = newAsks.size > 0 ? Math.min(...newAsks.keys()) : 0;
      const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : state.midPrice;
      const spread = bestBid && bestAsk ? bestAsk - bestBid : state.spread;

      // Calculate bid/ask imbalance (top 10 levels)
      const bidPrices = Array.from(newBids.keys()).sort((a, b) => b - a).slice(0, 10);
      const askPrices = Array.from(newAsks.keys()).sort((a, b) => a - b).slice(0, 10);

      const totalBidQty = bidPrices.reduce((sum, p) => sum + (newBids.get(p) || 0), 0);
      const totalAskQty = askPrices.reduce((sum, p) => sum + (newAsks.get(p) || 0), 0);

      const imbalance = totalBidQty + totalAskQty > 0
        ? (totalBidQty - totalAskQty) / (totalBidQty + totalAskQty)
        : 0;

      // Add to heatmap history
      const snapshot: OrderbookSnapshot = {
        timestamp: Date.now(),
        bids: bidPrices.map((p) => [p, newBids.get(p)!]),
        asks: askPrices.map((p) => [p, newAsks.get(p)!]),
      };

      const newHistory = [...state.heatmapHistory, snapshot];
      if (newHistory.length > state.maxHistoryLength) {
        newHistory.shift();
      }

      return {
        bids: newBids,
        asks: newAsks,
        previousBids: new Map(state.bids),
        previousAsks: new Map(state.asks),
        lastUpdateId: updateId,
        midPrice,
        spread,
        bidAskImbalance: imbalance,
        heatmapHistory: newHistory,
        liquidityDeltas: newDeltas,
        whaleOrders: whales.slice(0, MAX_WHALE_ORDERS),
      };
    }),

  calculateWalls: (threshold) =>
    set((state) => {
      const { bids, asks } = state;

      // Calculate average quantity
      const allQtys = [...bids.values(), ...asks.values()];
      const avgQty = allQtys.length > 0
        ? allQtys.reduce((a, b) => a + b, 0) / allQtys.length
        : 0;

      const wallThreshold = avgQty * (threshold || WALL_THRESHOLD_MULTIPLIER);

      const bidWalls: LiquidityWall[] = [];
      const askWalls: LiquidityWall[] = [];

      bids.forEach((qty, price) => {
        if (qty >= wallThreshold) {
          bidWalls.push({ price, quantity: qty, side: 'bid' });
        }
      });

      asks.forEach((qty, price) => {
        if (qty >= wallThreshold) {
          askWalls.push({ price, quantity: qty, side: 'ask' });
        }
      });

      // Sort by quantity descending
      bidWalls.sort((a, b) => b.quantity - a.quantity);
      askWalls.sort((a, b) => b.quantity - a.quantity);

      return { bidWalls, askWalls };
    }),

  detectWhales: (thresholdStdDev) =>
    set((state) => {
      const whales = detectWhaleOrders(state.bids, state.asks, thresholdStdDev);
      return { whaleOrders: whales.slice(0, MAX_WHALE_ORDERS) };
    }),

  reset: () =>
    set({
      bids: new Map(),
      asks: new Map(),
      lastUpdateId: 0,
      heatmapHistory: [],
      liquidityDeltas: [],
      whaleOrders: [],
      previousBids: new Map(),
      previousAsks: new Map(),
      bidWalls: [],
      askWalls: [],
      bidAskImbalance: 0,
      spread: 0,
      midPrice: 0,
    }),
}));
