import { describe, it, expect } from 'vitest';
import {
  detectImbalance,
  detectCandleImbalances,
  detectStackedImbalances,
  getImbalanceColor,
} from '@/lib/calculations/imbalance';
import type { FootprintLevel } from '@/stores/useFootprintStore';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeLevel(price: number, bidVolume: number, askVolume: number): FootprintLevel {
  return {
    price,
    bidVolume,
    askVolume,
    delta: askVolume - bidVolume,
  };
}

function makeLevels(entries: [number, number, number][]): Map<number, FootprintLevel> {
  const map = new Map<number, FootprintLevel>();
  for (const [price, bid, ask] of entries) {
    map.set(price, makeLevel(price, bid, ask));
  }
  return map;
}

describe('imbalance', () => {
  // ─────────────────────────────────────────────────────────────────────
  // detectImbalance
  // ─────────────────────────────────────────────────────────────────────

  describe('detectImbalance', () => {
    it('should detect bullish imbalance when ask >> bid', () => {
      const result = detectImbalance(10, 50, 3.0);
      expect(result.direction).toBe('bullish');
      expect(result.ratio).toBe(5);
      expect(result.isStrong).toBe(true);
    });

    it('should detect bearish imbalance when bid >> ask', () => {
      const result = detectImbalance(60, 15, 3.0);
      expect(result.direction).toBe('bearish');
      expect(result.ratio).toBe(4);
      expect(result.isStrong).toBe(true);
    });

    it('should return neutral when volumes are equal', () => {
      const result = detectImbalance(100, 100, 3.0);
      expect(result.direction).toBe('neutral');
      expect(result.ratio).toBe(1);
      expect(result.isStrong).toBe(false);
    });

    it('should return neutral when both volumes are zero', () => {
      const result = detectImbalance(0, 0, 3.0);
      expect(result.direction).toBe('neutral');
      expect(result.ratio).toBe(0);
      expect(result.isStrong).toBe(false);
    });

    it('should not be strong when ratio is below threshold', () => {
      const result = detectImbalance(10, 20, 3.0);
      expect(result.direction).toBe('bullish');
      expect(result.ratio).toBe(2);
      expect(result.isStrong).toBe(false);
    });

    it('should be strong when ratio equals threshold', () => {
      const result = detectImbalance(10, 30, 3.0);
      expect(result.direction).toBe('bullish');
      expect(result.ratio).toBe(3);
      expect(result.isStrong).toBe(true);
    });

    it('should use askVolume as ratio when bidVolume is zero (bullish)', () => {
      const result = detectImbalance(0, 50, 3.0);
      expect(result.direction).toBe('bullish');
      expect(result.ratio).toBe(50);
      expect(result.isStrong).toBe(true);
    });

    it('should use bidVolume as ratio when askVolume is zero (bearish)', () => {
      const result = detectImbalance(50, 0, 3.0);
      expect(result.direction).toBe('bearish');
      expect(result.ratio).toBe(50);
      expect(result.isStrong).toBe(true);
    });

    it('should respect custom threshold', () => {
      const result = detectImbalance(10, 40, 5.0);
      expect(result.ratio).toBe(4);
      expect(result.isStrong).toBe(false); // 4 < 5
    });

    it('should use default threshold of 3.0', () => {
      const result = detectImbalance(10, 40);
      expect(result.isStrong).toBe(true); // 4 >= 3
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // detectCandleImbalances
  // ─────────────────────────────────────────────────────────────────────

  describe('detectCandleImbalances', () => {
    it('should detect strong imbalances in candle levels', () => {
      const levels = makeLevels([
        [100, 10, 50],   // bullish, ratio 5 (strong)
        [99, 100, 100],  // neutral (not strong)
        [98, 60, 10],    // bearish, ratio 6 (strong)
      ]);
      const result = detectCandleImbalances(levels, 3.0);
      expect(result.length).toBe(2);
      expect(result.find(r => r.price === 100)?.direction).toBe('bullish');
      expect(result.find(r => r.price === 98)?.direction).toBe('bearish');
    });

    it('should return empty array when no strong imbalances', () => {
      const levels = makeLevels([
        [100, 50, 50],
        [99, 45, 55],
      ]);
      const result = detectCandleImbalances(levels, 3.0);
      expect(result.length).toBe(0);
    });

    it('should return empty array for empty levels', () => {
      const result = detectCandleImbalances(new Map(), 3.0);
      expect(result.length).toBe(0);
    });

    it('should only include levels above threshold', () => {
      const levels = makeLevels([
        [100, 10, 25],  // ratio 2.5, not strong at threshold 3
        [99, 10, 35],   // ratio 3.5, strong
      ]);
      const result = detectCandleImbalances(levels, 3.0);
      expect(result.length).toBe(1);
      expect(result[0].price).toBe(99);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // detectStackedImbalances
  // ─────────────────────────────────────────────────────────────────────

  describe('detectStackedImbalances', () => {
    const tickSize = 1;

    it('should detect 3+ consecutive bullish imbalances', () => {
      // Prices descending: 103, 102, 101, 100
      const levels = makeLevels([
        [103, 5, 50],   // bullish strong
        [102, 5, 40],   // bullish strong
        [101, 5, 45],   // bullish strong
        [100, 50, 50],  // neutral
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks.length).toBe(1);
      expect(stacks[0].direction).toBe('bullish');
      expect(stacks[0].count).toBe(3);
      expect(stacks[0].startPrice).toBe(103);
      expect(stacks[0].endPrice).toBe(101);
    });

    it('should detect 3+ consecutive bearish imbalances', () => {
      const levels = makeLevels([
        [103, 50, 5],   // bearish strong
        [102, 40, 5],   // bearish strong
        [101, 45, 5],   // bearish strong
        [100, 50, 50],  // neutral
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks.length).toBe(1);
      expect(stacks[0].direction).toBe('bearish');
      expect(stacks[0].count).toBe(3);
    });

    it('should not detect stack with fewer than minStack levels', () => {
      const levels = makeLevels([
        [102, 5, 50],   // bullish
        [101, 5, 40],   // bullish
        [100, 50, 50],  // neutral
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks.length).toBe(0);
    });

    it('should finalize stack when direction changes', () => {
      const levels = makeLevels([
        [106, 5, 50],   // bullish
        [105, 5, 40],   // bullish
        [104, 5, 45],   // bullish
        [103, 50, 5],   // bearish → direction change
        [102, 40, 5],   // bearish
        [101, 45, 5],   // bearish
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks.length).toBe(2);
    });

    it('should return empty array for no imbalances', () => {
      const levels = makeLevels([
        [103, 50, 50],
        [102, 50, 50],
        [101, 50, 50],
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks.length).toBe(0);
    });

    it('should return empty array for empty levels', () => {
      const stacks = detectStackedImbalances(new Map(), tickSize, 3.0, 3);
      expect(stacks.length).toBe(0);
    });

    it('should handle last stack (no trailing neutral)', () => {
      const levels = makeLevels([
        [103, 5, 50],   // bullish
        [102, 5, 40],   // bullish
        [101, 5, 45],   // bullish
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks.length).toBe(1);
      expect(stacks[0].count).toBe(3);
    });

    it('should set candleTime to 0 (caller responsibility)', () => {
      const levels = makeLevels([
        [103, 5, 50],
        [102, 5, 40],
        [101, 5, 45],
      ]);
      const stacks = detectStackedImbalances(levels, tickSize, 3.0, 3);
      expect(stacks[0].candleTime).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getImbalanceColor
  // ─────────────────────────────────────────────────────────────────────

  describe('getImbalanceColor', () => {
    it('should return green for bullish', () => {
      const { fill } = getImbalanceColor('bullish', 5);
      expect(fill).toBe('#22c55e');
    });

    it('should return red for bearish', () => {
      const { fill } = getImbalanceColor('bearish', 5);
      expect(fill).toBe('#ef4444');
    });

    it('should return transparent for neutral', () => {
      const { fill, opacity } = getImbalanceColor('neutral', 0);
      expect(fill).toBe('transparent');
      expect(opacity).toBe(0);
    });

    it('should have opacity between 0.3 and 0.8', () => {
      const { opacity } = getImbalanceColor('bullish', 5);
      expect(opacity).toBeGreaterThanOrEqual(0.3);
      expect(opacity).toBeLessThanOrEqual(0.8);
    });

    it('should cap opacity at max when ratio exceeds maxRatio', () => {
      const { opacity: opHigh } = getImbalanceColor('bullish', 20, 10);
      const { opacity: opMax } = getImbalanceColor('bullish', 10, 10);
      expect(opHigh).toBe(opMax); // Both capped at 0.3 + 1 * 0.5 = 0.8
    });

    it('should have higher opacity for higher ratio', () => {
      const { opacity: opLow } = getImbalanceColor('bullish', 2, 10);
      const { opacity: opHigh } = getImbalanceColor('bullish', 8, 10);
      expect(opHigh).toBeGreaterThan(opLow);
    });

    it('should respect custom maxRatio', () => {
      const { opacity: op5of10 } = getImbalanceColor('bullish', 5, 10);
      const { opacity: op5of20 } = getImbalanceColor('bullish', 5, 20);
      // 5/10 = 0.5 normalized vs 5/20 = 0.25 normalized
      expect(op5of10).toBeGreaterThan(op5of20);
    });
  });
});
