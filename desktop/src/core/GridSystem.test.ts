import { describe, it, expect } from "vitest";
import { createGridSystem, type GridSystemSpec } from "./GridSystem";

const NOW = 1_700_000_000_000;
const baseSpec: GridSystemSpec = {
  bucketDurationMs: 100,
  historyDurationMs: 5 * 60_000,
  nowExchangeMs: NOW,
  tickSize: 0.10,
  priceMin: 100,
  priceMax: 120,
};

describe("createGridSystem — nominal", () => {
  it("computes historyLength and priceLevels", () => {
    const g = createGridSystem(baseSpec);
    expect(g.historyLength).toBe(3000);
    expect(g.priceLevels).toBe(200);
    expect(g.oldestExchangeMs).toBe(NOW - 300_000);
  });

  it("bucketIndex(now) === historyLength - 1", () => {
    const g = createGridSystem(baseSpec);
    expect(g.bucketIndex(NOW)).toBe(g.historyLength - 1);
  });

  it("bucketIndex(oldest) === 0", () => {
    const g = createGridSystem(baseSpec);
    expect(g.bucketIndex(g.oldestExchangeMs)).toBe(0);
  });

  it("bucketIndex out of window returns -1", () => {
    const g = createGridSystem(baseSpec);
    expect(g.bucketIndex(g.oldestExchangeMs - 1)).toBe(-1);
    expect(g.bucketIndex(NOW + 1)).toBe(-1);
  });

  it("bucketIndex aligns to bucketDurationMs", () => {
    const g = createGridSystem(baseSpec);
    // Le bucket courant [now - bucket, now] est inclusif à droite via clamp,
    // donc now - bucket appartient au dernier bucket (historyLength - 1).
    expect(g.bucketIndex(NOW - 100)).toBe(g.historyLength - 1);
    // 1 ms avant la frontière du dernier bucket → bucket précédent.
    expect(g.bucketIndex(NOW - 101)).toBe(g.historyLength - 2);
    expect(g.bucketIndex(NOW - 200)).toBe(g.historyLength - 2);
    expect(g.bucketIndex(NOW - 201)).toBe(g.historyLength - 3);
    expect(g.bucketIndex(g.oldestExchangeMs + 100)).toBe(1);
  });

  it("priceIndex boundaries", () => {
    const g = createGridSystem(baseSpec);
    expect(g.priceIndex(100)).toBe(0);
    expect(g.priceIndex(120 - 0.10)).toBe(199);
    expect(g.priceIndex(120)).toBe(-1);
    expect(g.priceIndex(99.99)).toBe(-1);
  });

  it("priceIndex aligns to tickSize mid-range", () => {
    const g = createGridSystem(baseSpec);
    expect(g.priceIndex(110)).toBe(100);
    expect(g.priceIndex(110.05)).toBe(100); // floor à l'intérieur du même tick
  });

  it("cellKey returns 't:p'", () => {
    const g = createGridSystem(baseSpec);
    expect(g.cellKey(5, 12)).toBe("5:12");
    expect(g.cellKey(0, 0)).toBe("0:0");
  });

  it("returned grid is frozen", () => {
    const g = createGridSystem(baseSpec);
    expect(Object.isFrozen(g)).toBe(true);
  });
});

describe("createGridSystem — validation", () => {
  it("throws on bucketDurationMs <= 0", () => {
    expect(() =>
      createGridSystem({ ...baseSpec, bucketDurationMs: 0 as never }),
    ).toThrow(/bucketDurationMs/);
    expect(() =>
      createGridSystem({ ...baseSpec, bucketDurationMs: -100 as never }),
    ).toThrow(/bucketDurationMs/);
  });

  it("throws on historyDurationMs <= bucketDurationMs", () => {
    expect(() =>
      createGridSystem({ ...baseSpec, historyDurationMs: 100 }),
    ).toThrow(/historyDurationMs/);
    expect(() =>
      createGridSystem({ ...baseSpec, historyDurationMs: 50 }),
    ).toThrow(/historyDurationMs/);
  });

  it("throws on tickSize <= 0", () => {
    expect(() => createGridSystem({ ...baseSpec, tickSize: 0 })).toThrow(
      /tickSize/,
    );
    expect(() => createGridSystem({ ...baseSpec, tickSize: -0.1 })).toThrow(
      /tickSize/,
    );
  });

  it("throws on priceMin >= priceMax", () => {
    expect(() =>
      createGridSystem({ ...baseSpec, priceMin: 120, priceMax: 120 }),
    ).toThrow(/priceMin/);
    expect(() =>
      createGridSystem({ ...baseSpec, priceMin: 130, priceMax: 120 }),
    ).toThrow(/priceMin/);
  });

  it("throws on negative nowExchangeMs", () => {
    expect(() =>
      createGridSystem({ ...baseSpec, nowExchangeMs: -1 }),
    ).toThrow(/nowExchangeMs/);
  });
});

describe("createGridSystem — clock not yet ticked", () => {
  it("nowExchangeMs = 0 does not throw", () => {
    expect(() =>
      createGridSystem({ ...baseSpec, nowExchangeMs: 0 }),
    ).not.toThrow();
  });

  it("with nowExchangeMs = 0, every t > 0 maps to -1", () => {
    const g = createGridSystem({ ...baseSpec, nowExchangeMs: 0 });
    expect(g.bucketIndex(1)).toBe(-1);
    expect(g.bucketIndex(1000)).toBe(-1);
    expect(g.bucketIndex(1_700_000_000_000)).toBe(-1);
  });
});
