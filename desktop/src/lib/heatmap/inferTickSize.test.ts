import { describe, it, expect } from "vitest";
import { inferTickSize } from "./inferTickSize";

describe("inferTickSize", () => {
  it("infers 0.25 from an ES-style ladder", () => {
    const prices = [5000.0, 5000.25, 5000.5, 5000.75, 5001.0];
    expect(inferTickSize(prices)).toBeCloseTo(0.25, 10);
  });

  it("infers 0.1 from a BTC-style ladder with gaps (missing levels)", () => {
    // 0.1 grid but with a hole between 100.1 and 100.4
    const prices = [100.0, 100.1, 100.4, 100.5];
    expect(inferTickSize(prices)).toBeCloseTo(0.1, 10);
  });

  it("ignores duplicate / unsorted prices", () => {
    const prices = [101.0, 100.0, 100.0, 100.5, 100.5];
    expect(inferTickSize(prices)).toBeCloseTo(0.5, 10);
  });

  it("returns null when fewer than 2 distinct prices", () => {
    expect(inferTickSize([100.0])).toBeNull();
    expect(inferTickSize([100.0, 100.0])).toBeNull();
    expect(inferTickSize([])).toBeNull();
  });
});
