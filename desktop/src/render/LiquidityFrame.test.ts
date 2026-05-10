import { describe, it, expect } from "vitest";
import { aggregateOrderbookHistoryToFrame } from "./LiquidityFrame";
import { createGridSystem, type GridSystemSpec } from "../core";

const NOW = 1_700_000_000_000;
const SPEC: GridSystemSpec = {
  bucketDurationMs: 100,
  historyDurationMs: 1000, // 10 buckets
  nowExchangeMs: NOW,
  tickSize: 0.1,
  priceMin: 100,
  priceMax: 110, // 100 levels
};

describe("aggregateOrderbookHistoryToFrame", () => {
  it("empty input → all zeros, correct size", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame([], grid);
    expect(frame.cells.length).toBe(grid.historyLength * grid.priceLevels);
    for (const v of frame.cells) expect(v).toBe(0);
  });

  it("single snapshot at oldest fills its row uniformly to 1.0", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame(
      [
        {
          exchangeMs: grid.oldestExchangeMs,
          bids: [{ price: 105, size: 10 }],
          asks: [],
        },
      ],
      grid,
    );
    const pIdx = grid.priceIndex(105);
    for (let t = 0; t < grid.historyLength; t++) {
      expect(frame.cells[t * grid.priceLevels + pIdx]).toBeCloseTo(1.0, 5);
    }
  });

  it("constant level over full window via 2 snapshots", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame(
      [
        {
          exchangeMs: grid.oldestExchangeMs,
          bids: [{ price: 105, size: 10 }],
          asks: [],
        },
        { exchangeMs: NOW, bids: [{ price: 105, size: 10 }], asks: [] },
      ],
      grid,
    );
    const pIdx = grid.priceIndex(105);
    for (let t = 0; t < grid.historyLength; t++) {
      expect(frame.cells[t * grid.priceLevels + pIdx]).toBeCloseTo(1.0, 5);
    }
    // Other rows: 0
    const otherIdx = grid.priceIndex(102);
    for (let t = 0; t < grid.historyLength; t++) {
      expect(frame.cells[t * grid.priceLevels + otherIdx]).toBe(0);
    }
  });

  it("level disappearing mid-window: tail buckets = 0", () => {
    const grid = createGridSystem(SPEC);
    const mid = grid.oldestExchangeMs + 500;
    const frame = aggregateOrderbookHistoryToFrame(
      [
        {
          exchangeMs: grid.oldestExchangeMs,
          bids: [
            { price: 105, size: 10 },
            { price: 106, size: 10 },
          ],
          asks: [],
        },
        { exchangeMs: mid, bids: [{ price: 105, size: 10 }], asks: [] },
      ],
      grid,
    );
    const p105 = grid.priceIndex(105);
    const p106 = grid.priceIndex(106);
    // 105 row: persistent → 1.0 partout
    for (let t = 0; t < grid.historyLength; t++) {
      expect(frame.cells[t * grid.priceLevels + p105]).toBeCloseTo(1.0, 5);
    }
    // 106 row: présent buckets 0..4, absent 5..9
    for (let t = 0; t < 5; t++) {
      expect(frame.cells[t * grid.priceLevels + p106]).toBeCloseTo(1.0, 5);
    }
    for (let t = 5; t < 10; t++) {
      expect(frame.cells[t * grid.priceLevels + p106]).toBe(0);
    }
  });

  it("snapshot before window: no NaN/Infinity, contribution clamped", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame(
      [
        {
          exchangeMs: grid.oldestExchangeMs - 5000,
          bids: [{ price: 105, size: 10 }],
          asks: [],
        },
      ],
      grid,
    );
    for (const v of frame.cells) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("price out of viewport → ignored", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame(
      [
        {
          exchangeMs: grid.oldestExchangeMs,
          bids: [{ price: 999, size: 1000 }],
          asks: [{ price: 50, size: 500 }],
        },
      ],
      grid,
    );
    for (const v of frame.cells) expect(v).toBe(0);
  });

  it("returned frame is frozen", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame([], grid);
    expect(Object.isFrozen(frame)).toBe(true);
  });

  it("deterministic: same input → same cells", () => {
    const grid = createGridSystem(SPEC);
    const snaps = [
      {
        exchangeMs: grid.oldestExchangeMs + 200,
        bids: [{ price: 104, size: 5 }],
        asks: [{ price: 106, size: 8 }],
      },
      {
        exchangeMs: grid.oldestExchangeMs + 700,
        bids: [{ price: 103, size: 3 }],
        asks: [{ price: 107, size: 12 }],
      },
    ];
    const f1 = aggregateOrderbookHistoryToFrame(snaps, grid);
    const f2 = aggregateOrderbookHistoryToFrame(snaps, grid);
    expect(Array.from(f1.cells)).toEqual(Array.from(f2.cells));
  });

  it("does not mutate input snapshots array order", () => {
    const grid = createGridSystem(SPEC);
    const snaps = [
      {
        exchangeMs: grid.oldestExchangeMs + 700,
        bids: [{ price: 105, size: 5 }],
        asks: [],
      },
      {
        exchangeMs: grid.oldestExchangeMs + 200,
        bids: [{ price: 105, size: 5 }],
        asks: [],
      },
    ];
    const before = snaps.map((s) => s.exchangeMs);
    aggregateOrderbookHistoryToFrame(snaps, grid);
    expect(snaps.map((s) => s.exchangeMs)).toEqual(before);
  });

  it("ask side aggregated symmetrically", () => {
    const grid = createGridSystem(SPEC);
    const frame = aggregateOrderbookHistoryToFrame(
      [
        {
          exchangeMs: grid.oldestExchangeMs,
          bids: [],
          asks: [{ price: 107, size: 10 }],
        },
        { exchangeMs: NOW, bids: [], asks: [{ price: 107, size: 10 }] },
      ],
      grid,
    );
    const p107 = grid.priceIndex(107);
    for (let t = 0; t < grid.historyLength; t++) {
      expect(frame.cells[t * grid.priceLevels + p107]).toBeCloseTo(1.0, 5);
    }
  });
});
