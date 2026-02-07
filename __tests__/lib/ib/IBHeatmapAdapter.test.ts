import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IBHeatmapAdapter } from '@/lib/ib/IBHeatmapAdapter';
import type { IBTrade, IBDepthUpdate } from '@/types/ib-protocol';

// Helper to build a depth update
function makeDepthUpdate(overrides: Partial<IBDepthUpdate> = {}): IBDepthUpdate {
  return {
    symbol: 'ES',
    timestamp: Date.now(),
    bids: [
      { price: 5000.00, size: 50, numOrders: 10 },
      { price: 4999.75, size: 30, numOrders: 8 },
      { price: 4999.50, size: 20, numOrders: 5 },
    ],
    asks: [
      { price: 5000.25, size: 40, numOrders: 9 },
      { price: 5000.50, size: 25, numOrders: 6 },
      { price: 5000.75, size: 15, numOrders: 4 },
    ],
    ...overrides,
  };
}

// Helper to build a trade
function makeTrade(overrides: Partial<IBTrade> = {}): IBTrade {
  return {
    symbol: 'ES',
    price: 5000.00,
    size: 5,
    side: 'ASK',
    timestamp: Date.now(),
    exchange: 'CME',
    ...overrides,
  };
}

describe('IBHeatmapAdapter', () => {
  let adapter: IBHeatmapAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new IBHeatmapAdapter({
      maxSnapshots: 100,
      snapshotIntervalMs: 200,
      maxTrades: 50,
      tradeMaxAgeMs: 60_000,
      depthRows: 20,
      contract: {
        symbol: 'ES',
        exchange: 'CME',
        secType: 'FUT',
        tickSize: 0.25,
        tickValue: 12.50,
        pointValue: 50,
        description: 'E-mini S&P 500',
        tradingHours: 'CME Globex',
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Depth snapshot sampling at interval
  // ─────────────────────────────────────────────────────────────────────────

  describe('depth snapshot sampling at interval', () => {
    it('should record first depth update immediately', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate());
      expect(adapter.getSnapshotCount()).toBe(1);
    });

    it('should skip depth updates within the snapshot interval', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate());
      expect(adapter.getSnapshotCount()).toBe(1);

      // Only 100ms later -- should be skipped (interval is 200ms)
      vi.setSystemTime(1100);
      adapter.feedDepth(makeDepthUpdate());
      expect(adapter.getSnapshotCount()).toBe(1);
    });

    it('should record depth updates after the snapshot interval elapses', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate());
      expect(adapter.getSnapshotCount()).toBe(1);

      // 200ms later -- should be recorded
      vi.setSystemTime(1200);
      adapter.feedDepth(makeDepthUpdate());
      expect(adapter.getSnapshotCount()).toBe(2);

      // 400ms later -- another snapshot
      vi.setSystemTime(1400);
      adapter.feedDepth(makeDepthUpdate());
      expect(adapter.getSnapshotCount()).toBe(3);
    });

    it('should update best bid/ask from depth data', () => {
      adapter.feedDepth(makeDepthUpdate({
        bids: [{ price: 5010.00, size: 50, numOrders: 10 }],
        asks: [{ price: 5010.25, size: 40, numOrders: 9 }],
      }));

      expect(adapter.getBestBid()).toBe(5010.00);
      expect(adapter.getBestAsk()).toBe(5010.25);
    });

    it('should prune old snapshots when maxSnapshots is exceeded', () => {
      const smallAdapter = new IBHeatmapAdapter({
        maxSnapshots: 5,
        snapshotIntervalMs: 100,
      });

      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(1000 + i * 100);
        smallAdapter.feedDepth(makeDepthUpdate());
      }

      expect(smallAdapter.getSnapshotCount()).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Trade accumulation
  // ─────────────────────────────────────────────────────────────────────────

  describe('trade accumulation', () => {
    it('should accumulate trades via feedTrade', () => {
      vi.setSystemTime(10_000);
      adapter.feedTrade(makeTrade({ timestamp: 10_000, price: 5000.25, size: 3 }));
      adapter.feedTrade(makeTrade({ timestamp: 10_100, price: 5000.50, size: 5 }));

      expect(adapter.getTradeCount()).toBe(2);
    });

    it('should update currentPrice on each trade', () => {
      vi.setSystemTime(10_000);
      adapter.feedTrade(makeTrade({ timestamp: 10_000, price: 5000.25 }));
      expect(adapter.getCurrentPrice()).toBe(5000.25);

      adapter.feedTrade(makeTrade({ timestamp: 10_100, price: 5001.00 }));
      expect(adapter.getCurrentPrice()).toBe(5001.00);
    });

    it('should prune trades older than tradeMaxAgeMs', () => {
      // tradeMaxAgeMs = 60_000
      vi.setSystemTime(100_000);
      adapter.feedTrade(makeTrade({ timestamp: 30_000 }));  // Old trade (70s ago)
      adapter.feedTrade(makeTrade({ timestamp: 50_000 }));  // Old trade (50s ago)
      adapter.feedTrade(makeTrade({ timestamp: 90_000 }));  // Recent trade (10s ago)

      // When feedTrade is called, it prunes old trades.
      // cutoff = Date.now() - 60_000 = 100_000 - 60_000 = 40_000
      // Trades at 30_000 are older than cutoff, so pruned
      // Trade at 50_000 is >= 40_000, so kept... wait, the code checks < cutoff:
      // while (trades[0].timestamp < cutoff) shift()
      // 30_000 < 40_000 => shift; 50_000 < 40_000 => false
      // Result: 2 trades remain (50_000 and 90_000)
      vi.setSystemTime(100_000);
      adapter.feedTrade(makeTrade({ timestamp: 100_000 })); // This triggers pruning

      // 30_000 < 40_000: pruned
      // 50_000 >= 40_000: kept
      // So we have 50_000, 90_000, 100_000 = 3 trades
      expect(adapter.getTradeCount()).toBe(3);
    });

    it('should cap trades at maxTrades', () => {
      const smallAdapter = new IBHeatmapAdapter({
        maxTrades: 5,
        tradeMaxAgeMs: 600_000, // Long max age so pruning by age doesn't interfere
      });

      vi.setSystemTime(1000);
      for (let i = 0; i < 10; i++) {
        vi.setSystemTime(1000 + i);
        smallAdapter.feedTrade(makeTrade({ timestamp: 1000 + i, size: 1 }));
      }

      expect(smallAdapter.getTradeCount()).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // toRenderData produces valid output
  // ─────────────────────────────────────────────────────────────────────────

  describe('toRenderData produces valid output', () => {
    it('should return valid RenderData with no data', () => {
      const data = adapter.toRenderData(800, 600);

      expect(data).toBeDefined();
      expect(data.passiveOrders).toEqual([]);
      expect(data.trades).toEqual([]);
      expect(data.tickSize).toBe(0.25);
      expect(data.contrast).toBe(1.0);
      expect(data.upperCutoff).toBe(0.95);
    });

    it('should include passive orders from depth history', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate());

      // Set a current price so range calculation works
      adapter.feedTrade(makeTrade({ timestamp: 1000, price: 5000.00 }));

      const data = adapter.toRenderData(800, 600);
      expect(data.passiveOrders.length).toBeGreaterThan(0);

      // Each order should have required fields
      for (const order of data.passiveOrders) {
        expect(order).toHaveProperty('price');
        expect(order).toHaveProperty('size');
        expect(order).toHaveProperty('side');
        expect(order).toHaveProperty('intensity');
        expect(order).toHaveProperty('x');
        expect(order.intensity).toBeGreaterThanOrEqual(0);
        expect(order.intensity).toBeLessThanOrEqual(1);
      }
    });

    it('should include trade data from accumulated trades', () => {
      const now = 10_000;
      vi.setSystemTime(now);
      adapter.feedTrade(makeTrade({ timestamp: now - 5000, price: 5000.25, size: 3, side: 'ASK' }));
      adapter.feedTrade(makeTrade({ timestamp: now - 2000, price: 5000.00, size: 2, side: 'BID' }));
      // Need another trade to give us a "now" reference
      adapter.feedTrade(makeTrade({ timestamp: now, price: 5000.50, size: 1, side: 'ASK' }));

      const data = adapter.toRenderData(800, 600);
      expect(data.trades.length).toBe(3);

      for (const trade of data.trades) {
        expect(trade).toHaveProperty('price');
        expect(trade).toHaveProperty('size');
        expect(trade).toHaveProperty('side');
        expect(trade).toHaveProperty('x');
        expect(trade).toHaveProperty('buyRatio');
        expect(trade).toHaveProperty('age');
        expect(['buy', 'sell']).toContain(trade.side);
      }
    });

    it('should provide currentPrice in render data', () => {
      vi.setSystemTime(1000);
      adapter.feedTrade(makeTrade({ timestamp: 1000, price: 5050.00 }));

      const data = adapter.toRenderData(800, 600);
      expect(data.currentPrice).toBe(5050.00);
    });

    it('should generate bestBidPoints and bestAskPoints from depth history', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate({
        bids: [{ price: 5000.00, size: 50, numOrders: 10 }],
        asks: [{ price: 5000.25, size: 40, numOrders: 9 }],
      }));

      vi.setSystemTime(1200);
      adapter.feedDepth(makeDepthUpdate({
        bids: [{ price: 5000.25, size: 55, numOrders: 12 }],
        asks: [{ price: 5000.50, size: 42, numOrders: 10 }],
      }));

      // Set current price
      adapter.feedTrade(makeTrade({ timestamp: 1200, price: 5000.25 }));

      const data = adapter.toRenderData(800, 600);
      expect(data.bestBidPoints).toBeDefined();
      expect(data.bestBidPoints!.length).toBe(2);
      expect(data.bestAskPoints).toBeDefined();
      expect(data.bestAskPoints!.length).toBe(2);

      // First snapshot bid = 5000.00, second = 5000.25
      expect(data.bestBidPoints![0].price).toBe(5000.00);
      expect(data.bestBidPoints![1].price).toBe(5000.25);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Price range calculation
  // ─────────────────────────────────────────────────────────────────────────

  describe('price range calculation', () => {
    it('should center price range around current price', () => {
      vi.setSystemTime(1000);
      adapter.feedTrade(makeTrade({ timestamp: 1000, price: 5000.00 }));

      const data = adapter.toRenderData(800, 600);
      const expectedRange = 0.25 * 40; // tickSize * 40 = 10
      expect(data.priceMin).toBe(5000.00 - expectedRange);
      expect(data.priceMax).toBe(5000.00 + expectedRange);
    });

    it('should default to 0-100 range when no price data exists', () => {
      const data = adapter.toRenderData(800, 600);
      expect(data.priceMin).toBe(0);
      expect(data.priceMax).toBe(100);
    });

    it('should use bestBid as fallback when no currentPrice', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate({
        bids: [{ price: 5010.00, size: 50, numOrders: 10 }],
        asks: [],
      }));

      // feedDepth sets bestBid but not currentPrice (only feedTrade does)
      // However, the calculatePriceRange checks: this.currentPrice || this.bestBid || this.bestAsk
      const data = adapter.toRenderData(800, 600);
      const expectedRange = 0.25 * 40;
      expect(data.priceMin).toBe(5010.00 - expectedRange);
      expect(data.priceMax).toBe(5010.00 + expectedRange);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Reset clears state
  // ─────────────────────────────────────────────────────────────────────────

  describe('reset clears state', () => {
    it('should clear all accumulated data on reset', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate());
      adapter.feedTrade(makeTrade({ timestamp: 1000 }));

      expect(adapter.getSnapshotCount()).toBeGreaterThan(0);
      expect(adapter.getTradeCount()).toBeGreaterThan(0);

      adapter.reset();

      expect(adapter.getSnapshotCount()).toBe(0);
      expect(adapter.getTradeCount()).toBe(0);
    });

    it('should produce empty render data after reset', () => {
      vi.setSystemTime(1000);
      adapter.feedDepth(makeDepthUpdate());
      adapter.feedTrade(makeTrade({ timestamp: 1000 }));
      adapter.reset();

      const data = adapter.toRenderData(800, 600);
      expect(data.passiveOrders).toEqual([]);
      expect(data.trades).toEqual([]);
      expect(data.bestBidPoints).toEqual([]);
      expect(data.bestAskPoints).toEqual([]);
    });

    it('should reset when setContract is called', () => {
      vi.setSystemTime(1000);
      adapter.feedTrade(makeTrade({ timestamp: 1000 }));

      adapter.setContract({
        symbol: 'NQ',
        exchange: 'CME',
        secType: 'FUT',
        tickSize: 0.25,
        tickValue: 5.00,
        pointValue: 20,
        description: 'E-mini NASDAQ 100',
        tradingHours: 'CME Globex',
      });

      expect(adapter.getTradeCount()).toBe(0);
      expect(adapter.getSnapshotCount()).toBe(0);
    });

    it('should allow new data after reset', () => {
      vi.setSystemTime(1000);
      adapter.feedTrade(makeTrade({ timestamp: 1000, price: 5000.00 }));
      adapter.reset();

      vi.setSystemTime(2000);
      adapter.feedTrade(makeTrade({ timestamp: 2000, price: 6000.00 }));
      expect(adapter.getTradeCount()).toBe(1);
      expect(adapter.getCurrentPrice()).toBe(6000.00);
    });
  });
});
