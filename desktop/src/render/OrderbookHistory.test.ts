import { describe, it, expect } from "vitest";
import { OrderbookHistory } from "./OrderbookHistory";
import { createGridSystem, type GridSystemSpec } from "../core";

// Petite grille pour inspection facile : 10 buckets × 10 prix
const SPEC: GridSystemSpec = {
  bucketDurationMs: 100,
  historyDurationMs: 1000,
  nowExchangeMs: 1000, // → absHead = 10, absOldest = 1
  tickSize: 1,
  priceMin: 100,
  priceMax: 110,
};

const ZERO_FRAME = () => ({
  grid: createGridSystem(SPEC),
  cells: new Float32Array(100),
});

describe("OrderbookHistory", () => {
  it("ingest unique → bucket le plus récent (t=historyLength-1) normalisé à 1", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    h.ingest(
      { exchangeMs: 1000, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    // absBucket=10 → t=9 (dernier), priceIndex(105)=5
    expect(frame.cells[9 * 10 + 5]).toBeCloseTo(1.0, 5);
    // Les autres buckets restent à 0
    for (let t = 0; t < 9; t++) {
      for (let p = 0; p < 10; p++) {
        expect(frame.cells[t * 10 + p]).toBe(0);
      }
    }
  });

  it("3 buckets consécutifs → 3 rows à 1.0", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    h.ingest(
      { exchangeMs: 800, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    h.ingest(
      { exchangeMs: 900, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    h.ingest(
      { exchangeMs: 1000, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    // absBucket 8,9,10 → t = 7, 8, 9
    expect(frame.cells[7 * 10 + 5]).toBeCloseTo(1.0, 5);
    expect(frame.cells[8 * 10 + 5]).toBeCloseTo(1.0, 5);
    expect(frame.cells[9 * 10 + 5]).toBeCloseTo(1.0, 5);
  });

  it("replace dans même bucket : seul le dernier ingest retenu", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    h.ingest(
      { exchangeMs: 1000, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    h.ingest(
      { exchangeMs: 1050, bids: [{ price: 107, size: 10 }], asks: [] },
      grid,
    );
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    expect(frame.cells[9 * 10 + 5]).toBe(0); // 105 effacé
    expect(frame.cells[9 * 10 + 7]).toBeCloseTo(1.0, 5); // 107 retenu
  });

  it("gap : buckets intermédiaires zero-out", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    h.ingest(
      { exchangeMs: 600, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    h.ingest(
      { exchangeMs: 1000, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    // absBucket 6 → t=5, absBucket 10 → t=9
    expect(frame.cells[5 * 10 + 5]).toBeCloseTo(1.0, 5);
    // intermediates t=6,7,8 doivent être 0
    for (let t = 6; t < 9; t++) {
      for (let p = 0; p < 10; p++) {
        expect(frame.cells[t * 10 + p]).toBe(0);
      }
    }
    expect(frame.cells[9 * 10 + 5]).toBeCloseTo(1.0, 5);
  });

  it("out-of-order ignoré (absBucket < headBucket)", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    h.ingest(
      { exchangeMs: 1000, bids: [{ price: 105, size: 10 }], asks: [] },
      grid,
    );
    h.ingest(
      { exchangeMs: 700, bids: [{ price: 107, size: 10 }], asks: [] },
      grid,
    );
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    expect(frame.cells[9 * 10 + 5]).toBeCloseTo(1.0, 5);
    // 107 ne doit JAMAIS apparaître (out-of-order)
    for (let t = 0; t < 10; t++) {
      expect(frame.cells[t * 10 + 7]).toBe(0);
    }
  });

  it("wrap-around ring : anciens buckets overwritten", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    // Ingère 15 buckets différents → les 5 premiers sont overwritten
    for (let i = 0; i < 15; i++) {
      h.ingest(
        {
          exchangeMs: 100 + i * 100,
          bids: [{ price: 105, size: 10 }],
          asks: [],
        },
        grid,
      );
    }
    // headBucket = floor(1500/100) = 15
    // ringMin = 15 - 9 = 6
    // grid couvre absHead=10, absOldest=1 → buckets 1..10
    // Avec ringMin=6, les buckets 1..5 sont overwritten → 0
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    for (let t = 0; t < 5; t++) {
      // absT = 1..5 < ringMin=6 → 0
      expect(frame.cells[t * 10 + 5]).toBe(0);
    }
    // t=5..9 → absT=6..10 (in range) → 1.0
    for (let t = 5; t < 10; t++) {
      expect(frame.cells[t * 10 + 5]).toBeCloseTo(1.0, 5);
    }
  });

  it("throws on grid.priceLevels mismatch", () => {
    const h = new OrderbookHistory(10, 10);
    const wrongGrid = createGridSystem({
      ...SPEC,
      priceMax: 105, // priceLevels = 5, pas 10
    });
    expect(() =>
      h.ingest({ exchangeMs: 1000, bids: [], asks: [] }, wrongGrid),
    ).toThrow(/priceLevels/);
  });

  it("toFrame throw si frame mal dimensionné", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    expect(() =>
      h.toFrame(grid, { grid, cells: new Float32Array(42) }),
    ).toThrow(/cells\.length/);
  });

  it("determinisme : mêmes ingests → mêmes cells", () => {
    const grid = createGridSystem(SPEC);
    const h1 = new OrderbookHistory(10, 10);
    const h2 = new OrderbookHistory(10, 10);
    const seq = [
      { exchangeMs: 500, bids: [{ price: 103, size: 5 }], asks: [] },
      { exchangeMs: 700, bids: [{ price: 107, size: 8 }], asks: [] },
      { exchangeMs: 1000, bids: [{ price: 105, size: 10 }], asks: [] },
    ];
    for (const s of seq) {
      h1.ingest(s, grid);
      h2.ingest(s, grid);
    }
    const f1 = ZERO_FRAME();
    const f2 = ZERO_FRAME();
    h1.toFrame(grid, f1);
    h2.toFrame(grid, f2);
    expect(Array.from(f1.cells)).toEqual(Array.from(f2.cells));
  });

  it("price hors viewport → ignoré", () => {
    const grid = createGridSystem(SPEC);
    const h = new OrderbookHistory(10, 10);
    h.ingest(
      { exchangeMs: 1000, bids: [{ price: 999, size: 100 }], asks: [] },
      grid,
    );
    const frame = ZERO_FRAME();
    h.toFrame(grid, frame);
    for (const v of frame.cells) expect(v).toBe(0);
  });

  it("ne throw pas sur historyLength=0 ou priceLevels=0 → mais constructor refuse", () => {
    expect(() => new OrderbookHistory(0, 10)).toThrow();
    expect(() => new OrderbookHistory(10, 0)).toThrow();
    expect(() => new OrderbookHistory(-1, 10)).toThrow();
  });
});
