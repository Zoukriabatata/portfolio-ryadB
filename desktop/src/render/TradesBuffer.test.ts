import { describe, it, expect } from "vitest";
import { TradesBuffer } from "./TradesBuffer";
import { createGridSystem, type GridSystemSpec } from "../core";

const SPEC: GridSystemSpec = {
  bucketDurationMs: 100,
  historyDurationMs: 1000,
  nowExchangeMs: 10_000,
  tickSize: 0.1,
  priceMin: 100,
  priceMax: 110,
};

describe("TradesBuffer", () => {
  it("constructor refuse capacity ≤ 0", () => {
    expect(() => new TradesBuffer(0)).toThrow();
    expect(() => new TradesBuffer(-1)).toThrow();
  });

  it("buffer vide : visibleTrades=0, currentPrice=null, median=0", () => {
    const grid = createGridSystem(SPEC);
    const buf = new TradesBuffer(100);
    expect(buf.size()).toBe(0);
    expect(buf.currentPrice()).toBeNull();
    expect(buf.medianRecentVolume(50)).toBe(0);
    expect(buf.visibleTrades(grid, new Float32Array(40))).toBe(0);
  });

  it("ingest 5 trades dans la fenêtre → visible=5", () => {
    const grid = createGridSystem(SPEC);
    const buf = new TradesBuffer(100);
    for (let i = 0; i < 5; i++) {
      buf.ingest({
        exchangeMs: 9_000 + i * 100,
        price: 105 + i,
        size: 1 + i,
        side: i % 2 === 0 ? "bid" : "ask",
      });
    }
    const out = new Float32Array(5 * 4);
    expect(buf.visibleTrades(grid, out)).toBe(5);
  });

  it("filtre les trades hors fenêtre (avant oldest)", () => {
    const grid = createGridSystem(SPEC); // window [9000, 10000]
    const buf = new TradesBuffer(100);
    buf.ingest({ exchangeMs: 5_000, price: 100, size: 1, side: "bid" }); // trop vieux
    buf.ingest({ exchangeMs: 9_500, price: 105, size: 2, side: "bid" }); // dans
    buf.ingest({ exchangeMs: 9_800, price: 106, size: 3, side: "ask" }); // dans
    const out = new Float32Array(40);
    expect(buf.visibleTrades(grid, out)).toBe(2);
  });

  it("filtre les trades futurs (après now)", () => {
    const grid = createGridSystem(SPEC);
    const buf = new TradesBuffer(100);
    buf.ingest({ exchangeMs: 9_500, price: 105, size: 2, side: "bid" });
    buf.ingest({ exchangeMs: 15_000, price: 106, size: 3, side: "ask" }); // futur
    const out = new Float32Array(40);
    expect(buf.visibleTrades(grid, out)).toBe(1);
  });

  it("écrit [tDelta, price, size, side01] correctement", () => {
    const grid = createGridSystem(SPEC); // oldest=9000
    const buf = new TradesBuffer(100);
    buf.ingest({ exchangeMs: 9_500, price: 105.5, size: 2.5, side: "ask" });
    const out = new Float32Array(4);
    buf.visibleTrades(grid, out);
    expect(out[0]).toBeCloseTo(500, 5); // tDelta = 9500 - 9000
    expect(out[1]).toBeCloseTo(105.5, 5);
    expect(out[2]).toBeCloseTo(2.5, 5);
    expect(out[3]).toBe(1); // ask → 1
  });

  it("side bid → 0, side ask → 1", () => {
    const grid = createGridSystem(SPEC);
    const buf = new TradesBuffer(100);
    buf.ingest({ exchangeMs: 9_500, price: 105, size: 1, side: "bid" });
    buf.ingest({ exchangeMs: 9_600, price: 106, size: 1, side: "ask" });
    const out = new Float32Array(8);
    buf.visibleTrades(grid, out);
    // walk backwards : ask first, bid second
    expect(out[3]).toBe(1);
    expect(out[7]).toBe(0);
  });

  it("wrap-around : capacity dépassée, oldest évincés", () => {
    const buf = new TradesBuffer(3); // tiny capacity
    buf.ingest({ exchangeMs: 1000, price: 100, size: 1, side: "bid" });
    buf.ingest({ exchangeMs: 2000, price: 200, size: 2, side: "bid" });
    buf.ingest({ exchangeMs: 3000, price: 300, size: 3, side: "bid" });
    buf.ingest({ exchangeMs: 4000, price: 400, size: 4, side: "bid" });
    // capacity 3 → trade 1000 évincé. Reste 2000, 3000, 4000.
    expect(buf.size()).toBe(3);
    expect(buf.currentPrice()).toBe(400);
  });

  it("throw si out trop petit", () => {
    const grid = createGridSystem(SPEC);
    const buf = new TradesBuffer(100);
    for (let i = 0; i < 5; i++) {
      buf.ingest({
        exchangeMs: 9_500 + i * 50,
        price: 105,
        size: 1,
        side: "bid",
      });
    }
    const tooSmall = new Float32Array(8); // 2 trades max
    expect(() => buf.visibleTrades(grid, tooSmall)).toThrow(/too small/);
  });

  it("medianRecentVolume sur 5 trades = médiane attendue", () => {
    const buf = new TradesBuffer(100);
    [1, 5, 3, 4, 2].forEach((s) =>
      buf.ingest({ exchangeMs: 9_000, price: 100, size: s, side: "bid" }),
    );
    expect(buf.medianRecentVolume(5)).toBe(3);
  });

  it("medianRecentVolume sur N pair → moyenne des 2 milieux", () => {
    const buf = new TradesBuffer(100);
    [1, 2, 3, 4].forEach((s) =>
      buf.ingest({ exchangeMs: 9_000, price: 100, size: s, side: "bid" }),
    );
    expect(buf.medianRecentVolume(4)).toBe(2.5);
  });

  it("medianRecentVolume avec n > count → utilise count", () => {
    const buf = new TradesBuffer(100);
    [1, 2, 3].forEach((s) =>
      buf.ingest({ exchangeMs: 9_000, price: 100, size: s, side: "bid" }),
    );
    expect(buf.medianRecentVolume(50)).toBe(2);
  });

  it("currentPrice = price du dernier ingest", () => {
    const buf = new TradesBuffer(100);
    buf.ingest({ exchangeMs: 9_000, price: 100, size: 1, side: "bid" });
    buf.ingest({ exchangeMs: 9_500, price: 105.5, size: 1, side: "ask" });
    expect(buf.currentPrice()).toBe(105.5);
  });
});
