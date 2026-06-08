import { describe, it, expect } from "vitest";
import { getEffectiveAggregation } from "./smartScaling";

// With minRowPx = 8, the sequence is [1, 2, 5, 10, 25, 50].
// Returns the smallest N such that rowHeight * N >= minRowPx.
// Falls back to 50 if none qualify.

describe("getEffectiveAggregation", () => {
  it("returns 1 when rowHeight already meets the minimum", () => {
    expect(getEffectiveAggregation(8, 8)).toBe(1);
    expect(getEffectiveAggregation(20, 8)).toBe(1);
  });

  it("returns 2 when rowHeight * 2 first meets minimum", () => {
    expect(getEffectiveAggregation(4, 8)).toBe(2);
    expect(getEffectiveAggregation(5, 8)).toBe(2);
  });

  it("returns 5 when rowHeight * 5 first meets minimum", () => {
    expect(getEffectiveAggregation(2, 8)).toBe(5);
    expect(getEffectiveAggregation(1.6, 8)).toBe(5);
  });

  it("returns 10 when rowHeight * 10 first meets minimum", () => {
    expect(getEffectiveAggregation(1, 8)).toBe(10);
    expect(getEffectiveAggregation(0.8, 8)).toBe(10);
  });

  it("returns 25 when rowHeight * 25 first meets minimum", () => {
    expect(getEffectiveAggregation(0.4, 8)).toBe(25);
  });

  it("falls back to 50 at extreme zoom-out", () => {
    expect(getEffectiveAggregation(0.1, 8)).toBe(50);
  });

  it("respects a custom minRowPx", () => {
    // With minRowPx=4: rowHeight=3 → 3*1=3 < 4, 3*2=6 >= 4 → returns 2
    expect(getEffectiveAggregation(3, 4)).toBe(2);
  });
});
