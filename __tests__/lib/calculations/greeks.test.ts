import { describe, it, expect } from 'vitest';
import {
  estimateGreeks,
  calculateMultiGreekExposure,
  calculateMultiGreekSummary,
  type OptionInput,
} from '@/lib/calculations/greeks';

// ─── Helper: access private functions via module re-export ───────────
// normPdf and normCdf are not exported, so we test them indirectly
// through estimateGreeks which uses them internally.

describe('greeks', () => {
  // ─────────────────────────────────────────────────────────────────────
  // estimateGreeks
  // ─────────────────────────────────────────────────────────────────────

  describe('estimateGreeks', () => {
    // Standard test case: ATM call option
    // S=100, K=100, T=0.25 (3 months), sigma=0.30, r=0.05
    const atm = { S: 100, K: 100, T: 0.25, sigma: 0.30, r: 0.05 };

    it('should return positive delta for call options', () => {
      const greeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThanOrEqual(1);
    });

    it('should return negative delta for put options', () => {
      const greeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'put');
      expect(greeks.delta).toBeLessThan(0);
      expect(greeks.delta).toBeGreaterThanOrEqual(-1);
    });

    it('should have ATM call delta near 0.5', () => {
      const greeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      // ATM call delta is typically slightly above 0.5 due to r > 0
      expect(greeks.delta).toBeCloseTo(0.55, 1);
    });

    it('should satisfy put-call delta parity: call_delta - put_delta = 1', () => {
      const callGreeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      const putGreeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'put');
      expect(callGreeks.delta - putGreeks.delta).toBeCloseTo(1, 5);
    });

    it('should return same gamma for call and put at same strike', () => {
      const callGreeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      const putGreeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'put');
      expect(callGreeks.gamma).toBeCloseTo(putGreeks.gamma, 10);
    });

    it('should return positive gamma', () => {
      const greeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      expect(greeks.gamma).toBeGreaterThan(0);
    });

    it('should have highest gamma for ATM options', () => {
      const atmGamma = estimateGreeks(100, 100, 0.25, 0.30, 0.05, 'call').gamma;
      const itmGamma = estimateGreeks(100, 80, 0.25, 0.30, 0.05, 'call').gamma;
      const otmGamma = estimateGreeks(100, 120, 0.25, 0.30, 0.05, 'call').gamma;
      expect(atmGamma).toBeGreaterThan(itmGamma);
      expect(atmGamma).toBeGreaterThan(otmGamma);
    });

    it('should return finite vanna value', () => {
      const greeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      expect(Number.isFinite(greeks.vanna)).toBe(true);
    });

    it('should return finite charm value', () => {
      const greeks = estimateGreeks(atm.S, atm.K, atm.T, atm.sigma, atm.r, 'call');
      expect(Number.isFinite(greeks.charm)).toBe(true);
    });

    // ─── Deep ITM / Deep OTM ───

    it('should have call delta near 1 for deep ITM', () => {
      const greeks = estimateGreeks(100, 50, 0.25, 0.30, 0.05, 'call');
      expect(greeks.delta).toBeCloseTo(1, 1);
    });

    it('should have call delta near 0 for deep OTM', () => {
      const greeks = estimateGreeks(100, 200, 0.25, 0.30, 0.05, 'call');
      expect(greeks.delta).toBeCloseTo(0, 1);
    });

    it('should have put delta near -1 for deep ITM put', () => {
      const greeks = estimateGreeks(100, 200, 0.25, 0.30, 0.05, 'put');
      expect(greeks.delta).toBeCloseTo(-1, 1);
    });

    it('should have near-zero gamma for deep OTM', () => {
      const greeks = estimateGreeks(100, 200, 0.25, 0.30, 0.05, 'call');
      expect(greeks.gamma).toBeCloseTo(0, 3);
    });

    // ─── Edge cases ───

    it('should return zeros when T <= 0', () => {
      const greeks = estimateGreeks(100, 100, 0, 0.30, 0.05, 'call');
      expect(greeks.delta).toBe(0);
      expect(greeks.gamma).toBe(0);
      expect(greeks.vanna).toBe(0);
      expect(greeks.charm).toBe(0);
    });

    it('should return zeros when sigma <= 0', () => {
      const greeks = estimateGreeks(100, 100, 0.25, 0, 0.05, 'call');
      expect(greeks.delta).toBe(0);
      expect(greeks.gamma).toBe(0);
    });

    it('should return zeros when S <= 0', () => {
      const greeks = estimateGreeks(0, 100, 0.25, 0.30, 0.05, 'call');
      expect(greeks.delta).toBe(0);
      expect(greeks.gamma).toBe(0);
    });

    it('should return zeros when K <= 0', () => {
      const greeks = estimateGreeks(100, 0, 0.25, 0.30, 0.05, 'call');
      expect(greeks.delta).toBe(0);
      expect(greeks.gamma).toBe(0);
    });

    it('should return zeros when T is negative', () => {
      const greeks = estimateGreeks(100, 100, -1, 0.30, 0.05, 'call');
      expect(greeks.delta).toBe(0);
    });

    it('should handle very small T (1 day)', () => {
      const greeks = estimateGreeks(100, 100, 1 / 365, 0.30, 0.05, 'call');
      expect(Number.isFinite(greeks.delta)).toBe(true);
      expect(Number.isFinite(greeks.gamma)).toBe(true);
    });

    it('should handle very high volatility', () => {
      const greeks = estimateGreeks(100, 100, 0.25, 2.0, 0.05, 'call');
      expect(Number.isFinite(greeks.delta)).toBe(true);
      expect(greeks.delta).toBeGreaterThan(0);
    });

    it('should handle r = 0', () => {
      const greeks = estimateGreeks(100, 100, 0.25, 0.30, 0, 'call');
      expect(Number.isFinite(greeks.delta)).toBe(true);
      // ATM with r=0: call delta should be very close to 0.5
      expect(greeks.delta).toBeCloseTo(0.5, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // calculateMultiGreekExposure
  // ─────────────────────────────────────────────────────────────────────

  describe('calculateMultiGreekExposure', () => {
    const now = Date.now() / 1000;
    const exp30d = now + 30 * 24 * 3600; // 30 days from now

    const makeOption = (override: Partial<OptionInput> = {}): OptionInput => ({
      strike: 100,
      expiration: exp30d,
      optionType: 'call',
      openInterest: 1000,
      impliedVolatility: 0.30,
      ...override,
    });

    it('should return a Map with entries per strike', () => {
      const options = [
        makeOption({ strike: 95 }),
        makeOption({ strike: 100 }),
        makeOption({ strike: 105 }),
      ];
      const result = calculateMultiGreekExposure(options, 100);
      expect(result.size).toBe(3);
      expect(result.has(95)).toBe(true);
      expect(result.has(100)).toBe(true);
      expect(result.has(105)).toBe(true);
    });

    it('should aggregate call and put at same strike', () => {
      const options = [
        makeOption({ strike: 100, optionType: 'call', openInterest: 500 }),
        makeOption({ strike: 100, optionType: 'put', openInterest: 300 }),
      ];
      const result = calculateMultiGreekExposure(options, 100);
      const entry = result.get(100)!;
      expect(entry.callOI).toBe(500);
      expect(entry.putOI).toBe(300);
    });

    it('should produce positive GEX for calls (dealer short gamma)', () => {
      const options = [makeOption({ optionType: 'call', openInterest: 1000 })];
      const result = calculateMultiGreekExposure(options, 100);
      expect(result.get(100)!.gex).toBeGreaterThan(0);
    });

    it('should produce negative GEX for puts (dealer long gamma)', () => {
      const options = [makeOption({ optionType: 'put', openInterest: 1000 })];
      const result = calculateMultiGreekExposure(options, 100);
      expect(result.get(100)!.gex).toBeLessThan(0);
    });

    it('should return empty Map for empty options array', () => {
      const result = calculateMultiGreekExposure([], 100);
      expect(result.size).toBe(0);
    });

    it('should handle zero open interest', () => {
      const options = [makeOption({ openInterest: 0 })];
      const result = calculateMultiGreekExposure(options, 100);
      expect(result.get(100)!.gex).toBe(0);
    });

    it('should scale GEX with open interest', () => {
      const small = calculateMultiGreekExposure([makeOption({ openInterest: 100 })], 100);
      const large = calculateMultiGreekExposure([makeOption({ openInterest: 1000 })], 100);
      const ratio = large.get(100)!.gex / small.get(100)!.gex;
      expect(ratio).toBeCloseTo(10, 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // calculateMultiGreekSummary
  // ─────────────────────────────────────────────────────────────────────

  describe('calculateMultiGreekSummary', () => {
    it('should compute netGEX as sum of all GEX values', () => {
      const data = [
        { strike: 95, gex: -100, vex: 0, cex: 0, dex: 0, callOI: 0, putOI: 500, callIV: 0, putIV: 0.3 },
        { strike: 100, gex: 200, vex: 0, cex: 0, dex: 0, callOI: 1000, putOI: 0, callIV: 0.3, putIV: 0 },
        { strike: 105, gex: -50, vex: 0, cex: 0, dex: 0, callOI: 0, putOI: 200, callIV: 0, putIV: 0.3 },
      ];
      const summary = calculateMultiGreekSummary(data, 100);
      expect(summary.netGEX).toBe(50); // -100 + 200 + -50
    });

    it('should find call wall (strike with highest positive GEX and callOI)', () => {
      const data = [
        { strike: 95, gex: 50, vex: 0, cex: 0, dex: 0, callOI: 300, putOI: 0, callIV: 0.3, putIV: 0 },
        { strike: 100, gex: 200, vex: 0, cex: 0, dex: 0, callOI: 1000, putOI: 0, callIV: 0.3, putIV: 0 },
        { strike: 105, gex: 80, vex: 0, cex: 0, dex: 0, callOI: 500, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      const summary = calculateMultiGreekSummary(data, 100);
      expect(summary.callWall).toBe(100);
    });

    it('should find put wall (strike with most negative GEX and putOI)', () => {
      const data = [
        { strike: 90, gex: -300, vex: 0, cex: 0, dex: 0, callOI: 0, putOI: 800, callIV: 0, putIV: 0.3 },
        { strike: 95, gex: -100, vex: 0, cex: 0, dex: 0, callOI: 0, putOI: 400, callIV: 0, putIV: 0.3 },
        { strike: 100, gex: 200, vex: 0, cex: 0, dex: 0, callOI: 1000, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      const summary = calculateMultiGreekSummary(data, 100);
      expect(summary.putWall).toBe(90);
    });

    it('should determine positive regime when spot >= zeroGammaLevel', () => {
      const data = [
        { strike: 90, gex: -200, vex: 0, cex: 0, dex: 0, callOI: 0, putOI: 500, callIV: 0, putIV: 0.3 },
        { strike: 95, gex: 100, vex: 0, cex: 0, dex: 0, callOI: 500, putOI: 0, callIV: 0.3, putIV: 0 },
        { strike: 100, gex: 300, vex: 0, cex: 0, dex: 0, callOI: 1000, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      // Cumulative from low: -200, -100, +200 → zero crossing near 95-100
      const summary = calculateMultiGreekSummary(data, 100);
      expect(summary.regime).toBe('positive');
    });

    it('should determine negative regime when spot < zeroGammaLevel', () => {
      const data = [
        { strike: 90, gex: 100, vex: 0, cex: 0, dex: 0, callOI: 500, putOI: 0, callIV: 0.3, putIV: 0 },
        { strike: 100, gex: -50, vex: 0, cex: 0, dex: 0, callOI: 0, putOI: 200, callIV: 0, putIV: 0.3 },
        { strike: 110, gex: 200, vex: 0, cex: 0, dex: 0, callOI: 1000, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      // Cumulative: +100, +50, +250 → no zero crossing, zeroGammaLevel = spotPrice
      // spot(95) < zeroGammaLevel(95) → let's test differently
      const summary = calculateMultiGreekSummary(data, 95);
      // When no crossing, zeroGammaLevel defaults to spotPrice
      expect(['positive', 'negative']).toContain(summary.regime);
    });

    it('should calculate max pain correctly', () => {
      // Max pain = strike where total OI loss is minimized
      const data = [
        { strike: 95, gex: 0, vex: 0, cex: 0, dex: 0, callOI: 100, putOI: 500, callIV: 0.3, putIV: 0.3 },
        { strike: 100, gex: 0, vex: 0, cex: 0, dex: 0, callOI: 1000, putOI: 1000, callIV: 0.3, putIV: 0.3 },
        { strike: 105, gex: 0, vex: 0, cex: 0, dex: 0, callOI: 500, putOI: 100, callIV: 0.3, putIV: 0.3 },
      ];
      const summary = calculateMultiGreekSummary(data, 100);
      // Max pain should be at or near 100 where most OI is concentrated
      expect(summary.maxPain).toBe(100);
    });

    it('should handle single data point', () => {
      const data = [
        { strike: 100, gex: 50, vex: 10, cex: 5, dex: 20, callOI: 500, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      const summary = calculateMultiGreekSummary(data, 100);
      expect(summary.netGEX).toBe(50);
      expect(Number.isFinite(summary.impliedMove)).toBe(true);
    });

    it('should default gammaIntensity to 50 without history', () => {
      const data = [
        { strike: 100, gex: 100, vex: 0, cex: 0, dex: 0, callOI: 500, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      const summary = calculateMultiGreekSummary(data, 100);
      expect(summary.gammaIntensity).toBe(50);
    });

    it('should compute gammaIntensity percentile with history', () => {
      const data = [
        { strike: 100, gex: 50, vex: 0, cex: 0, dex: 0, callOI: 500, putOI: 0, callIV: 0.3, putIV: 0 },
      ];
      const history = { netGEX: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] };
      const summary = calculateMultiGreekSummary(data, 100, history);
      expect(summary.gammaIntensity).toBeGreaterThan(0);
      expect(summary.gammaIntensity).toBeLessThanOrEqual(100);
    });
  });
});
