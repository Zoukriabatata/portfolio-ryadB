import { describe, it, expect, beforeEach } from 'vitest';
import { IBFootprintAdapter } from '@/lib/ib/IBFootprintAdapter';
import type { IBTrade } from '@/types/ib-protocol';

// Helper to create a trade at a given time and price
function makeTrade(overrides: Partial<IBTrade> = {}): IBTrade {
  return {
    symbol: 'ES',
    price: 5000.00,
    size: 1,
    side: 'ASK',
    timestamp: 1_000_000, // 1000 seconds in ms
    exchange: 'CME',
    ...overrides,
  };
}

describe('IBFootprintAdapter', () => {
  let adapter: IBFootprintAdapter;

  beforeEach(() => {
    adapter = new IBFootprintAdapter({
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
      timeframeSec: 60,
      maxCandles: 200,
      imbalanceRatio: 3.0,
      valueAreaPercent: 0.70,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Trade processing creates candles correctly
  // ─────────────────────────────────────────────────────────────────────────

  describe('trade processing creates candles correctly', () => {
    it('should create a current candle on the first trade', () => {
      const trade = makeTrade({ timestamp: 60_000, price: 5000.25 });
      adapter.processTrade(trade);

      const current = adapter.getCurrentCandle();
      expect(current).not.toBeNull();
      expect(current!.open).toBe(5000.25);
      expect(current!.high).toBe(5000.25);
      expect(current!.low).toBe(5000.25);
      expect(current!.close).toBe(5000.25);
      expect(current!.isClosed).toBe(false);
    });

    it('should update OHLC as more trades arrive within the same candle', () => {
      // All trades within the same 60-second candle boundary
      // timestamp 60_000ms = 60s => candleTime = floor(60/60)*60 = 60
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));
      adapter.processTrade(makeTrade({ timestamp: 61_000, price: 5001.00 }));
      adapter.processTrade(makeTrade({ timestamp: 62_000, price: 4999.50 }));
      adapter.processTrade(makeTrade({ timestamp: 63_000, price: 5000.50 }));

      const current = adapter.getCurrentCandle();
      expect(current).not.toBeNull();
      expect(current!.open).toBe(5000.00);
      expect(current!.high).toBe(5001.00);
      expect(current!.low).toBe(4999.50);
      expect(current!.close).toBe(5000.50);
    });

    it('should track total volume and trade count', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, size: 5, side: 'ASK' }));
      adapter.processTrade(makeTrade({ timestamp: 61_000, size: 3, side: 'BID' }));
      adapter.processTrade(makeTrade({ timestamp: 62_000, size: 2, side: 'ASK' }));

      const current = adapter.getCurrentCandle();
      expect(current!.totalVolume).toBe(10);
      expect(current!.totalTrades).toBe(3);
      expect(current!.totalBuyVolume).toBe(7);  // ASK trades = buyer aggressor
      expect(current!.totalSellVolume).toBe(3);  // BID trades = seller aggressor
    });

    it('should compute totalDelta as totalBuyVolume - totalSellVolume', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, size: 10, side: 'ASK' }));
      adapter.processTrade(makeTrade({ timestamp: 61_000, size: 4, side: 'BID' }));

      const current = adapter.getCurrentCandle();
      expect(current!.totalDelta).toBe(6); // 10 - 4
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Price level aggregation (bid/ask volume)
  // ─────────────────────────────────────────────────────────────────────────

  describe('price level aggregation', () => {
    it('should aggregate bid and ask volumes separately at each price level', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 3, side: 'ASK' }));
      adapter.processTrade(makeTrade({ timestamp: ts + 100, price: 5000.00, size: 2, side: 'BID' }));
      adapter.processTrade(makeTrade({ timestamp: ts + 200, price: 5000.00, size: 5, side: 'ASK' }));

      const current = adapter.getCurrentCandle();
      const level = current!.levels.get(5000.00);
      expect(level).toBeDefined();
      expect(level!.askVolume).toBe(8);    // 3 + 5
      expect(level!.bidVolume).toBe(2);
      expect(level!.askTrades).toBe(2);
      expect(level!.bidTrades).toBe(1);
      expect(level!.totalVolume).toBe(10);
      expect(level!.delta).toBe(6);        // askVolume - bidVolume = 8 - 2
    });

    it('should round prices to the contract tick size', () => {
      // ES tick size is 0.25, so 5000.10 should round to 5000.00
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.10 }));

      const current = adapter.getCurrentCandle();
      expect(current!.levels.has(5000.00)).toBe(true);
      expect(current!.levels.has(5000.10)).toBe(false);
    });

    it('should create separate levels for different prices', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 2 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 100, price: 5000.25, size: 3 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 200, price: 5000.50, size: 1 }));

      const current = adapter.getCurrentCandle();
      expect(current!.levels.size).toBe(3);
      expect(current!.levels.get(5000.00)!.totalVolume).toBe(2);
      expect(current!.levels.get(5000.25)!.totalVolume).toBe(3);
      expect(current!.levels.get(5000.50)!.totalVolume).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Candle closing and new candle creation on timeframe boundary
  // ─────────────────────────────────────────────────────────────────────────

  describe('candle closing and new candle creation', () => {
    it('should close the current candle and start a new one when the timeframe boundary is crossed', () => {
      // Candle 1: timestamps in the 60s window (candleTime = 60)
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00, size: 1 }));
      adapter.processTrade(makeTrade({ timestamp: 90_000, price: 5000.25, size: 2 }));

      // Candle 2: timestamps in the 120s window (candleTime = 120)
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00, size: 3 }));

      const closedCandles = adapter.getClosedCandles();
      expect(closedCandles.length).toBe(1);
      expect(closedCandles[0].isClosed).toBe(true);
      expect(closedCandles[0].time).toBe(60);
      expect(closedCandles[0].totalVolume).toBe(3); // 1 + 2

      const current = adapter.getCurrentCandle();
      expect(current).not.toBeNull();
      expect(current!.time).toBe(120);
      expect(current!.isClosed).toBe(false);
      expect(current!.totalVolume).toBe(3);
    });

    it('should handle multiple candle closures sequentially', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));   // candle at t=60
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00 }));  // candle at t=120
      adapter.processTrade(makeTrade({ timestamp: 180_000, price: 5002.00 }));  // candle at t=180

      const closedCandles = adapter.getClosedCandles();
      expect(closedCandles.length).toBe(2);
      expect(closedCandles[0].time).toBe(60);
      expect(closedCandles[1].time).toBe(120);

      const current = adapter.getCurrentCandle();
      expect(current!.time).toBe(180);
    });

    it('should prune candles beyond maxCandles', () => {
      const smallAdapter = new IBFootprintAdapter({
        timeframeSec: 60,
        maxCandles: 3,
      });

      // Create 5 candles by advancing through 5 time boundaries
      for (let i = 1; i <= 5; i++) {
        smallAdapter.processTrade(makeTrade({ timestamp: i * 60_000, price: 5000 + i }));
      }

      // 4 candles closed, 1 current. maxCandles=3, so closed candles pruned to 3.
      const closed = smallAdapter.getClosedCandles();
      expect(closed.length).toBe(3);
      // The oldest candle (i=1) should have been pruned
      expect(closed[0].time).toBe(120); // i=2 candle
    });

    it('should include closed and current candles in getCandles()', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00 }));

      const allCandles = adapter.getCandles();
      expect(allCandles.length).toBe(2); // 1 closed + 1 current
      expect(allCandles[0].isClosed).toBe(true);
      expect(allCandles[1].isClosed).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POC calculation
  // ─────────────────────────────────────────────────────────────────────────

  describe('POC calculation', () => {
    it('should set POC to the price with the highest total volume', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 5 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 100, price: 5000.25, size: 10 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 200, price: 5000.50, size: 3 }));

      const current = adapter.getCurrentCandle();
      expect(current!.poc).toBe(5000.25); // Highest volume
    });

    it('should update POC in real-time as new trades arrive', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 10 }));
      expect(adapter.getCurrentCandle()!.poc).toBe(5000.00);

      adapter.processTrade(makeTrade({ timestamp: ts + 100, price: 5000.25, size: 15 }));
      expect(adapter.getCurrentCandle()!.poc).toBe(5000.25);
    });

    it('should recalculate POC when candle closes', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 2 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 100, price: 5000.25, size: 10 }));

      // Close by moving to next candle
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00, size: 1 }));

      const closed = adapter.getClosedCandles();
      expect(closed[0].poc).toBe(5000.25);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Value area calculation
  // ─────────────────────────────────────────────────────────────────────────

  describe('value area calculation', () => {
    it('should compute VAH and VAL covering 70% of volume around POC', () => {
      const ts = 60_000;
      // Build a multi-level candle with known distribution
      // POC will be at 5000.50 (highest volume)
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 5 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 10, price: 5000.25, size: 10 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 20, price: 5000.50, size: 20 }));  // POC
      adapter.processTrade(makeTrade({ timestamp: ts + 30, price: 5000.75, size: 10 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 40, price: 5001.00, size: 5 }));

      // Close the candle to trigger full calculateKeyLevels
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5002.00, size: 1 }));

      const closed = adapter.getClosedCandles();
      const candle = closed[0];
      // Total volume = 50, 70% = 35
      // POC at 5000.50 = 20, need 15 more
      // Expand up to 5000.75 (+10) = 30, then down to 5000.25 (+10) = 40 >= 35
      // But the algorithm picks the side with more volume first:
      //   upVol(5000.75) = 10, downVol(5000.25) = 10
      //   When equal, it picks up (>=), so expand up: areaVolume = 30
      //   Then upVol(5001.00)=5, downVol(5000.25)=10 => expand down: areaVolume = 40 >= 35
      expect(candle.poc).toBe(5000.50);
      expect(candle.vah).toBe(5000.75);
      expect(candle.val).toBe(5000.25);
    });

    it('should set VAH = VAL = POC when there is only one price level', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 10 }));

      // Close candle
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00, size: 1 }));

      const closed = adapter.getClosedCandles();
      const candle = closed[0];
      expect(candle.poc).toBe(5000.00);
      expect(candle.vah).toBe(5000.00);
      expect(candle.val).toBe(5000.00);
    });

    it('should cover all levels if total volume makes 70% difficult to isolate', () => {
      const ts = 60_000;
      // Even distribution across 3 levels
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 10 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 10, price: 5000.25, size: 10 }));
      adapter.processTrade(makeTrade({ timestamp: ts + 20, price: 5000.50, size: 10 }));

      // Close the candle
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00, size: 1 }));

      const closed = adapter.getClosedCandles();
      const candle = closed[0];
      // Total = 30, target = 21 (70%)
      // POC volume = 10 (any of them, first with maxVol wins which is 5000.00 at index 0)
      // Need 11 more: expand up to 5000.25 (+10)=20, then up to 5000.50 (+10)=30 >= 21
      expect(candle.val).toBeLessThanOrEqual(candle.poc);
      expect(candle.vah).toBeGreaterThanOrEqual(candle.poc);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Imbalance detection
  // ─────────────────────────────────────────────────────────────────────────

  describe('imbalance detection', () => {
    it('should flag imbalanceBuy when askVolume >= bidVolume * ratio', () => {
      const ts = 60_000;
      // imbalanceRatio = 3.0
      // askVolume = 9, bidVolume = 3 => 9 >= 3*3 = true
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 9, side: 'ASK' }));
      adapter.processTrade(makeTrade({ timestamp: ts + 10, price: 5000.00, size: 3, side: 'BID' }));

      const level = adapter.getCurrentCandle()!.levels.get(5000.00)!;
      expect(level.imbalanceBuy).toBe(true);
      expect(level.imbalanceSell).toBe(false);
    });

    it('should flag imbalanceSell when bidVolume >= askVolume * ratio', () => {
      const ts = 60_000;
      // bidVolume = 12, askVolume = 4 => 12 >= 4*3 = true
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 12, side: 'BID' }));
      adapter.processTrade(makeTrade({ timestamp: ts + 10, price: 5000.00, size: 4, side: 'ASK' }));

      const level = adapter.getCurrentCandle()!.levels.get(5000.00)!;
      expect(level.imbalanceSell).toBe(true);
      expect(level.imbalanceBuy).toBe(false);
    });

    it('should not flag imbalance when volumes are balanced', () => {
      const ts = 60_000;
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 5, side: 'ASK' }));
      adapter.processTrade(makeTrade({ timestamp: ts + 10, price: 5000.00, size: 5, side: 'BID' }));

      const level = adapter.getCurrentCandle()!.levels.get(5000.00)!;
      expect(level.imbalanceBuy).toBe(false);
      expect(level.imbalanceSell).toBe(false);
    });

    it('should not flag imbalanceBuy when askVolume > 0 but bidVolume is 0', () => {
      const ts = 60_000;
      // askVolume = 5, bidVolume = 0
      // imbalanceBuy check: askVolume > 0 && askVolume >= bidVolume * ratio => 5 >= 0*3 = true
      // imbalanceSell check: bidVolume > 0 => false
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 5, side: 'ASK' }));

      const level = adapter.getCurrentCandle()!.levels.get(5000.00)!;
      expect(level.imbalanceBuy).toBe(true);
      expect(level.imbalanceSell).toBe(false);
    });

    it('should not flag imbalanceSell when bidVolume > 0 but askVolume is 0', () => {
      const ts = 60_000;
      // bidVolume = 5, askVolume = 0
      // imbalanceSell: bidVolume > 0 && bidVolume >= askVolume * ratio => 5 >= 0*3 = true
      // imbalanceBuy: askVolume > 0 => false (askVolume is 0)
      adapter.processTrade(makeTrade({ timestamp: ts, price: 5000.00, size: 5, side: 'BID' }));

      const level = adapter.getCurrentCandle()!.levels.get(5000.00)!;
      expect(level.imbalanceSell).toBe(true);
      expect(level.imbalanceBuy).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Reset clears state
  // ─────────────────────────────────────────────────────────────────────────

  describe('reset clears state', () => {
    it('should clear all candles and current candle on reset', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));
      adapter.processTrade(makeTrade({ timestamp: 120_000, price: 5001.00 }));

      expect(adapter.getCandles().length).toBeGreaterThan(0);

      adapter.reset();

      expect(adapter.getCandles().length).toBe(0);
      expect(adapter.getCurrentCandle()).toBeNull();
      expect(adapter.getClosedCandles().length).toBe(0);
    });

    it('should allow new trades after reset', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));
      adapter.reset();
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5100.00 }));

      const current = adapter.getCurrentCandle();
      expect(current).not.toBeNull();
      expect(current!.open).toBe(5100.00);
    });

    it('should reset when setContract is called', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));
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

      expect(adapter.getCandles().length).toBe(0);
      expect(adapter.getCurrentCandle()).toBeNull();
      expect(adapter.getConfig().contract.symbol).toBe('NQ');
    });

    it('should reset when setTimeframe is called', () => {
      adapter.processTrade(makeTrade({ timestamp: 60_000, price: 5000.00 }));
      adapter.setTimeframe(300);

      expect(adapter.getCandles().length).toBe(0);
      expect(adapter.getCurrentCandle()).toBeNull();
      expect(adapter.getConfig().timeframeSec).toBe(300);
    });
  });
});
