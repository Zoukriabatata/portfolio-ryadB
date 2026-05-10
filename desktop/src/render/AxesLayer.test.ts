import { describe, it, expect } from "vitest";
import { computePriceTickStep, computeTimeTickStep } from "./AxesLayer";

describe("computePriceTickStep (Y axis adaptive ticks)", () => {
  it("range 100, target 8 → step 10 (=> 11 graduations)", () => {
    expect(computePriceTickStep(100, 8)).toBe(10);
  });

  it("range 1000, target 8 → step 100", () => {
    expect(computePriceTickStep(1000, 8)).toBe(100);
  });

  it("range 5, target 8 → step 0.5 ou 1 (mantissa ∈ {1,2,5})", () => {
    const step = computePriceTickStep(5, 8);
    expect([0.5, 1]).toContain(step);
  });

  it("range 0.1, target 8 → step 0.01 (subdivision décimale)", () => {
    expect(computePriceTickStep(0.1, 8)).toBeCloseTo(0.01, 5);
  });

  it("range très large, target 8 → step en mantissa {1,2,5}", () => {
    const step = computePriceTickStep(1_000_000, 8);
    const log = Math.log10(step);
    const exponent = Math.floor(log);
    const mantissa = step / Math.pow(10, exponent);
    expect([1, 2, 5, 10]).toContain(Math.round(mantissa));
  });

  it("range = 0 → fallback 1 (pas de division par 0)", () => {
    expect(computePriceTickStep(0, 8)).toBe(1);
  });
});

describe("computeTimeTickStep (X axis adaptive ticks)", () => {
  it("range 5 min (300s), target 6 → step 60s", () => {
    expect(computeTimeTickStep(300_000, 6)).toBe(60_000);
  });

  it("range 1 min (60s), target 6 → step 15s", () => {
    expect(computeTimeTickStep(60_000, 6)).toBe(15_000);
  });

  it("range 30s, target 6 → step 5s", () => {
    expect(computeTimeTickStep(30_000, 6)).toBe(5_000);
  });

  it("range 1h (3600s), target 6 → step 15min ou plus", () => {
    expect(computeTimeTickStep(3_600_000, 6)).toBeGreaterThanOrEqual(15 * 60_000);
  });

  it("range énorme dépasse les steps disponibles → max step", () => {
    expect(computeTimeTickStep(24 * 60 * 60_000, 6)).toBe(60 * 60_000);
  });

  it("range = 0 → fallback 1s", () => {
    expect(computeTimeTickStep(0, 6)).toBe(1_000);
  });
});
