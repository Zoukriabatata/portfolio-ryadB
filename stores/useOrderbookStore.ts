import { create } from 'zustand';
import type { OrderbookSnapshot } from '@/types/orderbook';
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
  reset: () => void;
}

const MAX_HEATMAP_HISTORY = 300; // ~30 seconds at 100ms updates

const MAX_LIQUIDITY_DELTAS = 100;
const MAX_WHALE_ORDERS = 50;

// Throttle heavy analysis (whale detection, liquidity delta) to every 500ms
// instead of running on every 100ms orderbook update
const ANALYSIS_THROTTLE_MS = 500;
let lastAnalysisTime = 0;

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

    // Calculate mid price and spread (guard empty maps)
    if (bidMap.size === 0 || askMap.size === 0) {
      set({ bids: bidMap, asks: askMap, lastUpdateId });
      return;
    }
    let bestBid = -Infinity;
    for (const k of bidMap.keys()) { if (k > bestBid) bestBid = k; }
    let bestAsk = Infinity;
    for (const k of askMap.keys()) { if (k < bestAsk) bestAsk = k; }
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

      // Calculate metrics (for-loop avoids stack overflow on large maps)
      let bestBid = -Infinity;
      if (newBids.size > 0) { for (const k of newBids.keys()) { if (k > bestBid) bestBid = k; } }
      let bestAsk = Infinity;
      if (newAsks.size > 0) { for (const k of newAsks.keys()) { if (k < bestAsk) bestAsk = k; } }
      const hasBoth = newBids.size > 0 && newAsks.size > 0;
      const midPrice = hasBoth ? (bestBid + bestAsk) / 2 : state.midPrice;
      const spread = hasBoth ? bestAsk - bestBid : state.spread;

      // Throttle heavy analysis: liquidity deltas, whale detection, imbalance, heatmap history
      // Only run every 500ms instead of every 100ms update
      const now = Date.now();
      const shouldRunAnalysis = now - lastAnalysisTime >= ANALYSIS_THROTTLE_MS;

      if (!shouldRunAnalysis) {
        // Fast path: only update orderbook data + metrics, skip heavy analysis
        return {
          bids: newBids,
          asks: newAsks,
          previousBids: state.bids,
          previousAsks: state.asks,
          lastUpdateId: updateId,
          midPrice,
          spread,
        };
      }

      lastAnalysisTime = now;

      // Heavy analysis below - runs every ~500ms

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
        timestamp: now,
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
        previousBids: state.bids,
        previousAsks: state.asks,
        lastUpdateId: updateId,
        midPrice,
        spread,
        bidAskImbalance: imbalance,
        heatmapHistory: newHistory,
        liquidityDeltas: newDeltas,
        whaleOrders: whales.slice(0, MAX_WHALE_ORDERS),
      };
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
      bidAskImbalance: 0,
      spread: 0,
      midPrice: 0,
    }),
}));
