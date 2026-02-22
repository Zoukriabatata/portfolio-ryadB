import { describe, it, expect } from 'vitest';
import {
  calculateOptionGEX,
  calculateGEXByStrike,
  calculateGEXSummary,
  findZeroGammaLevel,
  getGEXChartData,
  formatGEX,
} from '@/lib/calculations/gex';
import type { OptionData, GEXData } from '@/types/options';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeOption(override: Partial<OptionData> = {}): OptionData {
  return {
    instrumentName: 'BTC-100000-C',
    strike: 100000,
    expiration: '2025-06-27',
    expirationTimestamp: Date.now() + 30 * 86400 * 1000,
    optionType: 'call',
    markPrice: 0.05,
    markIV: 0.60,
    bidIV: 0.58,
    askIV: 0.62,
    underlyingPrice: 100000,
    openInterest: 500,
    volume: 100,
    greeks: { delta: 0.5, gamma: 0.00002, vega: 100, theta: -50, rho: 10 },
    ...override,
  };
}

function makeGEXData(override: Partial<GEXData> = {}): GEXData {
  return {
    strike: 100,
    callGEX: 0,
    putGEX: 0,
    netGEX: 0,
    callOI: 0,
    putOI: 0,
    callGamma: 0,
    putGamma: 0,
    ...override,
  };
}

describe('gex', () => {
  // ─────────────────────────────────────────────────────────────────────
  // calculateOptionGEX
  // ─────────────────────────────────────────────────────────────────────

  describe('calculateOptionGEX', () => {
    it('should return positive GEX for calls', () => {
      const gex = calculateOptionGEX(0.00002, 1000, 100000, 'call');
      expect(gex).toBeGreaterThan(0);
    });

    it('should return negative GEX for puts', () => {
      const gex = calculateOptionGEX(0.00002, 1000, 100000, 'put');
      expect(gex).toBeLessThan(0);
    });

    it('should have equal magnitude for call and put with same inputs', () => {
      const callGEX = calculateOptionGEX(0.00002, 1000, 100000, 'call');
      const putGEX = calculateOptionGEX(0.00002, 1000, 100000, 'put');
      expect(callGEX).toBe(-putGEX);
    });

    it('should return 0 when gamma is 0', () => {
      expect(calculateOptionGEX(0, 1000, 100000, 'call')).toBe(0);
    });

    it('should return 0 when OI is 0', () => {
      expect(calculateOptionGEX(0.00002, 0, 100000, 'call')).toBe(0);
    });

    it('should scale linearly with open interest', () => {
      const gex1 = calculateOptionGEX(0.00002, 100, 100000, 'call');
      const gex10 = calculateOptionGEX(0.00002, 1000, 100000, 'call');
      expect(gex10 / gex1).toBeCloseTo(10, 5);
    });

    it('should scale quadratically with spot price', () => {
      const gex1 = calculateOptionGEX(0.00002, 1000, 100, 'call');
      const gex2 = calculateOptionGEX(0.00002, 1000, 200, 'call');
      // 200² / 100² = 4
      expect(gex2 / gex1).toBeCloseTo(4, 5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // calculateGEXByStrike
  // ─────────────────────────────────────────────────────────────────────

  describe('calculateGEXByStrike', () => {
    it('should aggregate options by strike', () => {
      const options = [
        makeOption({ strike: 95000 }),
        makeOption({ strike: 100000 }),
        makeOption({ strike: 105000 }),
      ];
      const result = calculateGEXByStrike(options, 100000);
      expect(result.size).toBe(3);
    });

    it('should combine call and put at same strike', () => {
      const options = [
        makeOption({ strike: 100000, optionType: 'call', openInterest: 500 }),
        makeOption({ strike: 100000, optionType: 'put', openInterest: 300 }),
      ];
      const result = calculateGEXByStrike(options, 100000);
      expect(result.size).toBe(1);
      const data = result.get(100000)!;
      expect(data.callOI).toBe(500);
      expect(data.putOI).toBe(300);
      // netGEX = callGEX + putGEX (positive call + negative put)
      expect(data.callGEX).toBeGreaterThan(0);
      expect(data.putGEX).toBeLessThan(0);
    });

    it('should handle empty options array', () => {
      const result = calculateGEXByStrike([], 100000);
      expect(result.size).toBe(0);
    });

    it('should handle options with zero gamma', () => {
      const options = [
        makeOption({
          strike: 100000,
          greeks: { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 },
        }),
      ];
      const result = calculateGEXByStrike(options, 100000);
      expect(result.get(100000)!.netGEX).toBe(0);
    });

    it('should track gamma per side', () => {
      const options = [
        makeOption({
          strike: 100000,
          optionType: 'call',
          openInterest: 100,
          greeks: { delta: 0.5, gamma: 0.0001, vega: 0, theta: 0, rho: 0 },
        }),
        makeOption({
          strike: 100000,
          optionType: 'put',
          openInterest: 200,
          greeks: { delta: -0.5, gamma: 0.00008, vega: 0, theta: 0, rho: 0 },
        }),
      ];
      const result = calculateGEXByStrike(options, 100000);
      const data = result.get(100000)!;
      expect(data.callGamma).toBe(0.0001 * 100);
      expect(data.putGamma).toBe(0.00008 * 200);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // calculateGEXSummary
  // ─────────────────────────────────────────────────────────────────────

  describe('calculateGEXSummary', () => {
    it('should compute net GEX as sum of call + put GEX', () => {
      const map = new Map<number, GEXData>();
      map.set(95, makeGEXData({ strike: 95, callGEX: 100, putGEX: -200, netGEX: -100 }));
      map.set(100, makeGEXData({ strike: 100, callGEX: 500, putGEX: -100, netGEX: 400 }));
      const summary = calculateGEXSummary(map);
      expect(summary.totalCallGEX).toBe(600);
      expect(summary.totalPutGEX).toBe(-300);
      expect(summary.netGEX).toBe(300);
    });

    it('should find strike with max absolute GEX', () => {
      const map = new Map<number, GEXData>();
      map.set(90, makeGEXData({ strike: 90, netGEX: -50 }));
      map.set(100, makeGEXData({ strike: 100, netGEX: 200 }));
      map.set(110, makeGEXData({ strike: 110, netGEX: -300 }));
      const summary = calculateGEXSummary(map);
      expect(summary.maxGammaStrike).toBe(110); // |-300| > 200
    });

    it('should find positive GEX strike (call wall)', () => {
      const map = new Map<number, GEXData>();
      map.set(100, makeGEXData({ strike: 100, netGEX: 100 }));
      map.set(110, makeGEXData({ strike: 110, netGEX: 500 }));
      const summary = calculateGEXSummary(map);
      expect(summary.posGEXStrike).toBe(110);
    });

    it('should find negative GEX strike (put wall)', () => {
      const map = new Map<number, GEXData>();
      map.set(90, makeGEXData({ strike: 90, netGEX: -400 }));
      map.set(95, makeGEXData({ strike: 95, netGEX: -100 }));
      const summary = calculateGEXSummary(map);
      expect(summary.negGEXStrike).toBe(90);
    });

    it('should compute gexRatio as |callGEX / putGEX|', () => {
      const map = new Map<number, GEXData>();
      map.set(100, makeGEXData({ strike: 100, callGEX: 300, putGEX: -100, netGEX: 200 }));
      const summary = calculateGEXSummary(map);
      expect(summary.gexRatio).toBeCloseTo(3, 5);
    });

    it('should return gexRatio 0 when no put GEX', () => {
      const map = new Map<number, GEXData>();
      map.set(100, makeGEXData({ strike: 100, callGEX: 300, putGEX: 0, netGEX: 300 }));
      const summary = calculateGEXSummary(map);
      expect(summary.gexRatio).toBe(0);
    });

    it('should handle empty map', () => {
      const map = new Map<number, GEXData>();
      const summary = calculateGEXSummary(map);
      expect(summary.netGEX).toBe(0);
      expect(summary.maxGammaStrike).toBeNull();
      expect(summary.zeroGammaLevel).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // findZeroGammaLevel
  // ─────────────────────────────────────────────────────────────────────

  describe('findZeroGammaLevel', () => {
    it('should find zero crossing via linear interpolation', () => {
      const map = new Map<number, GEXData>();
      // Cumulative: -100, then -100+300 = +200 → crossing between 90 and 100
      map.set(90, makeGEXData({ strike: 90, netGEX: -100 }));
      map.set(100, makeGEXData({ strike: 100, netGEX: 300 }));
      const level = findZeroGammaLevel(map);
      expect(level).not.toBeNull();
      // Cumulative at 90: -100, at 100: -100+300=+200
      // ratio = |prev| / (|prev| + |cum|) = 100 / (100 + 200) = 0.333
      // level = 90 + 0.333 * 10 = 93.33
      expect(level!).toBeCloseTo(93.33, 1);
    });

    it('should return null when no crossing exists (all positive)', () => {
      const map = new Map<number, GEXData>();
      map.set(90, makeGEXData({ strike: 90, netGEX: 100 }));
      map.set(100, makeGEXData({ strike: 100, netGEX: 200 }));
      expect(findZeroGammaLevel(map)).toBeNull();
    });

    it('should return null when no crossing exists (all negative)', () => {
      const map = new Map<number, GEXData>();
      map.set(90, makeGEXData({ strike: 90, netGEX: -100 }));
      map.set(100, makeGEXData({ strike: 100, netGEX: -200 }));
      expect(findZeroGammaLevel(map)).toBeNull();
    });

    it('should return null for less than 2 strikes', () => {
      const map = new Map<number, GEXData>();
      map.set(100, makeGEXData({ strike: 100, netGEX: 50 }));
      expect(findZeroGammaLevel(map)).toBeNull();
    });

    it('should return null for empty map', () => {
      expect(findZeroGammaLevel(new Map())).toBeNull();
    });

    it('should find first crossing when multiple exist', () => {
      const map = new Map<number, GEXData>();
      map.set(90, makeGEXData({ strike: 90, netGEX: -100 }));
      map.set(95, makeGEXData({ strike: 95, netGEX: 200 }));  // first crossing
      map.set(100, makeGEXData({ strike: 100, netGEX: -200 })); // second crossing
      map.set(105, makeGEXData({ strike: 105, netGEX: 300 }));  // third crossing
      const level = findZeroGammaLevel(map);
      expect(level).not.toBeNull();
      // First crossing: between 90 and 95
      expect(level!).toBeGreaterThan(90);
      expect(level!).toBeLessThan(95);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // getGEXChartData
  // ─────────────────────────────────────────────────────────────────────

  describe('getGEXChartData', () => {
    it('should return data sorted by strike ascending', () => {
      const map = new Map<number, GEXData>();
      map.set(110, makeGEXData({ strike: 110 }));
      map.set(90, makeGEXData({ strike: 90 }));
      map.set(100, makeGEXData({ strike: 100 }));
      const data = getGEXChartData(map);
      expect(data.map(d => d.strike)).toEqual([90, 100, 110]);
    });

    it('should return empty array for empty map', () => {
      expect(getGEXChartData(new Map())).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // formatGEX
  // ─────────────────────────────────────────────────────────────────────

  describe('formatGEX', () => {
    it('should format billions with B suffix', () => {
      expect(formatGEX(1_500_000_000)).toBe('1.50B');
    });

    it('should format millions with M suffix', () => {
      expect(formatGEX(2_500_000)).toBe('2.50M');
    });

    it('should format thousands with K suffix', () => {
      expect(formatGEX(42_000)).toBe('42.00K');
    });

    it('should format small numbers without suffix', () => {
      expect(formatGEX(123.45)).toBe('123.45');
    });

    it('should handle zero', () => {
      expect(formatGEX(0)).toBe('0.00');
    });

    it('should handle negative values', () => {
      expect(formatGEX(-5_000_000)).toBe('-5.00M');
    });

    it('should handle negative thousands', () => {
      expect(formatGEX(-1_500)).toBe('-1.50K');
    });

    it('should format values just at threshold boundaries', () => {
      expect(formatGEX(1000)).toBe('1.00K');
      expect(formatGEX(999)).toBe('999.00');
      expect(formatGEX(1_000_000)).toBe('1.00M');
    });
  });
});
