import { describe, it, expect } from "vitest";
import { pickAndConvertDepthBatch } from "./BridgeDepthHeatmapAdapter";

const batch = [
  {
    symbol: "ES 06-26",
    lastUpdateNs: 1_700_000_000_000_000_000,
    bids: [{ price: 5000.25, volume: 12 }, { price: 5000.0, volume: 30 }],
    asks: [{ price: 5000.5, volume: 8 }, { price: 5000.75, volume: 20 }],
  },
  {
    symbol: "NQ 06-26",
    lastUpdateNs: 1_700_000_000_000_000_000,
    bids: [{ price: 18000.0, volume: 5 }],
    asks: [{ price: 18000.25, volume: 7 }],
  },
];

describe("pickAndConvertDepthBatch", () => {
  it("converts the matching symbol: volume->size, lastUpdateNs->exchangeMs(ms)", () => {
    const snap = pickAndConvertDepthBatch(batch, "ES 06-26");
    expect(snap).not.toBeNull();
    expect(snap!.exchangeMs).toBe(1_700_000_000_000); // floor(ns / 1e6)
    expect(snap!.bids).toEqual([
      { price: 5000.25, size: 12 },
      { price: 5000.0, size: 30 },
    ]);
    expect(snap!.asks[0]).toEqual({ price: 5000.5, size: 8 });
  });

  it("falls back to the first entry when symbol is null", () => {
    const snap = pickAndConvertDepthBatch(batch, null);
    expect(snap!.bids[0].price).toBe(5000.25); // ES, the first entry
  });

  it("returns null when the symbol is absent and not falling back", () => {
    expect(pickAndConvertDepthBatch(batch, "CL 06-26")).toBeNull();
  });

  it("returns null for an empty or malformed batch", () => {
    expect(pickAndConvertDepthBatch([], null)).toBeNull();
    expect(pickAndConvertDepthBatch(null as unknown as [], null)).toBeNull();
  });
});
