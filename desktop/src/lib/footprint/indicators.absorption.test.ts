import { describe, it, expect } from "vitest";
import { calculateAbsorption } from "./indicators";
import type { FootprintBar } from "../../components/FootprintBarView";

// Minimal bar builder — only the fields calculateAbsorption reads.
function bar(
  levels: Array<{ price: number; buyVolume: number; sellVolume: number }>,
  high: number,
  low: number,
): FootprintBar {
  return {
    symbol: "MNQ",
    timeframe: "1m",
    bucketTsNs: 1_000_000_000_000,
    open: low,
    high,
    low,
    close: high,
    totalVolume: levels.reduce((s, l) => s + l.buyVolume + l.sellVolume, 0),
    totalDelta: levels.reduce((s, l) => s + l.buyVolume - l.sellVolume, 0),
    tradeCount: 0,
    levels: levels.map((l) => ({
      price: l.price,
      buyVolume: l.buyVolume,
      sellVolume: l.sellVolume,
      buyTrades: 0,
      sellTrades: 0,
    })),
  } as unknown as FootprintBar;
}

describe("calculateAbsorption", () => {
  it("flags buy absorption at the bar high (price stalled into heavy buying)", () => {
    // 100.25 holds 80 buy of 90 total buy (≈89%), and it IS the high.
    const b = bar(
      [
        { price: 100.0, buyVolume: 10, sellVolume: 5 },
        { price: 100.25, buyVolume: 80, sellVolume: 5 },
      ],
      100.25, // high == absorbing level
      100.0,
    );
    const out = calculateAbsorption(b, 0.6, 0, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ price: 100.25, side: "ask", volume: 80 });
  });

  it("flags sell absorption at the bar low (price held into heavy selling)", () => {
    const b = bar(
      [
        { price: 100.0, buyVolume: 5, sellVolume: 90 },
        { price: 100.25, buyVolume: 5, sellVolume: 10 },
      ],
      100.25,
      100.0, // low == absorbing level
    );
    const out = calculateAbsorption(b, 0.6, 0, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ price: 100.0, side: "bid", volume: 90 });
  });

  it("does NOT flag when price pushed well past the heavy level (no absorption)", () => {
    // Heavy buy at 100.00 but high ran to 100.75 (3 ticks above) → bought through.
    const b = bar(
      [
        { price: 100.0, buyVolume: 80, sellVolume: 5 },
        { price: 100.25, buyVolume: 5, sellVolume: 5 },
        { price: 100.5, buyVolume: 3, sellVolume: 3 },
        { price: 100.75, buyVolume: 2, sellVolume: 2 },
      ],
      100.75,
      100.0,
    );
    expect(calculateAbsorption(b, 0.6, 0, 1)).toHaveLength(0);
  });

  it("guards against single-level bars (high == low → trivially true)", () => {
    const b = bar([{ price: 100.0, buyVolume: 500, sellVolume: 1 }], 100.0, 100.0);
    expect(calculateAbsorption(b, 0.6, 0, 1)).toHaveLength(0);
  });

  it("flags within 1-tick tolerance but rejects 2 ticks beyond (boundary)", () => {
    // step inferred = 0.25 → tol = 0.25*1 + 0.025 = 0.275.
    const within = bar(
      [
        { price: 100.0, buyVolume: 5, sellVolume: 0 },
        { price: 100.25, buyVolume: 80, sellVolume: 0 },
        { price: 100.5, buyVolume: 5, sellVolume: 0 },
      ],
      100.5, // P(100.25) + 1 tick → inside tolerance
      100.0,
    );
    expect(calculateAbsorption(within, 0.6, 0, 1)).toHaveLength(1);

    const beyond = bar(
      [
        { price: 100.0, buyVolume: 5, sellVolume: 0 },
        { price: 100.25, buyVolume: 80, sellVolume: 0 },
        { price: 100.5, buyVolume: 3, sellVolume: 0 },
        { price: 100.75, buyVolume: 2, sellVolume: 0 },
      ],
      100.75, // P(100.25) + 2 ticks → beyond tolerance
      100.0,
    );
    expect(calculateAbsorption(beyond, 0.6, 0, 1)).toHaveLength(0);
  });

  it("toleranceTicks=0 requires the extreme essentially on the level", () => {
    const exact = bar(
      [
        { price: 100.0, buyVolume: 5, sellVolume: 0 },
        { price: 100.25, buyVolume: 80, sellVolume: 0 },
      ],
      100.25, // high == absorbing level
      100.0,
    );
    expect(calculateAbsorption(exact, 0.6, 0, 0)).toHaveLength(1);

    const oneTick = bar(
      [
        { price: 100.0, buyVolume: 5, sellVolume: 0 },
        { price: 100.25, buyVolume: 80, sellVolume: 0 },
        { price: 100.5, buyVolume: 5, sellVolume: 0 },
      ],
      100.5, // 1 tick above → rejected when tolerance is 0
      100.0,
    );
    expect(calculateAbsorption(oneTick, 0.6, 0, 0)).toHaveLength(0);
  });

  it("respects the absolute minVolume floor", () => {
    // Concentrated ratio but tiny absolute volume → filtered by minVolume.
    const b = bar(
      [
        { price: 100.0, buyVolume: 1, sellVolume: 0 },
        { price: 100.25, buyVolume: 8, sellVolume: 0 },
      ],
      100.25,
      100.0,
    );
    expect(calculateAbsorption(b, 0.6, 50, 1)).toHaveLength(0);
    expect(calculateAbsorption(b, 0.6, 0, 1)).toHaveLength(1);
  });
});
