import { describe, it, expect } from "vitest";
import { parseOrderbookPayload } from "./OrderbookAdapter";

const VALID_PAYLOAD = {
  symbol: "BTCUSDT.BYBIT",
  timestampNs: 1_778_360_880_412_642_800,
  bids: [
    { price: 100_000.0, quantity: 0.5 },
    { price: 99_999.9, quantity: 1.2 },
  ],
  asks: [
    { price: 100_000.1, quantity: 0.3 },
    { price: 100_000.2, quantity: 2.4 },
  ],
  sequence: 572_278_935_555,
  depth: 200,
};

describe("parseOrderbookPayload", () => {
  it("accepte le payload Tauri camelCase (timestampNs, pas timestamp_ns)", () => {
    const snap = parseOrderbookPayload(VALID_PAYLOAD);
    expect(snap).not.toBeNull();
    expect(snap!.exchangeMs).toBeGreaterThan(0);
  });

  it("rejette un payload snake_case (ancien format)", () => {
    const wrong = {
      ...VALID_PAYLOAD,
      timestamp_ns: VALID_PAYLOAD.timestampNs,
      timestampNs: undefined,
    };
    expect(parseOrderbookPayload(wrong)).toBeNull();
  });

  it("convertit timestampNs → exchangeMs (floor /1e6)", () => {
    // 1778360880412642800 ns / 1e6 = 1778360880412.6428 → floor = 1778360880412
    const snap = parseOrderbookPayload(VALID_PAYLOAD);
    expect(snap!.exchangeMs).toBe(1_778_360_880_412);
  });

  it("précision sur grand timestampNs : pas de NaN/Infinity, ms stable", () => {
    // Même au-delà de Number.MAX_SAFE_INTEGER (2^53 ≈ 9e15), la conversion
    // en ms reste sub-µs précise après floor.
    const big = {
      ...VALID_PAYLOAD,
      timestampNs: 1_900_000_000_000_000_000, // ~1.9e18
    };
    const snap = parseOrderbookPayload(big);
    expect(snap).not.toBeNull();
    expect(Number.isFinite(snap!.exchangeMs)).toBe(true);
    expect(snap!.exchangeMs).toBeGreaterThan(1.8e12);
    expect(snap!.exchangeMs).toBeLessThan(2.0e12);
  });

  it("renomme quantity → size sur bids/asks", () => {
    const snap = parseOrderbookPayload(VALID_PAYLOAD)!;
    expect(snap.bids[0]).toEqual({ price: 100_000.0, size: 0.5 });
    expect(snap.asks[1]).toEqual({ price: 100_000.2, size: 2.4 });
  });

  it("préserve l'ordre bids/asks", () => {
    const snap = parseOrderbookPayload(VALID_PAYLOAD)!;
    expect(snap.bids.map((b) => b.price)).toEqual([100_000.0, 99_999.9]);
    expect(snap.asks.map((a) => a.price)).toEqual([100_000.1, 100_000.2]);
  });

  it("rejette null / undefined / primitives", () => {
    expect(parseOrderbookPayload(null)).toBeNull();
    expect(parseOrderbookPayload(undefined)).toBeNull();
    expect(parseOrderbookPayload(42)).toBeNull();
    expect(parseOrderbookPayload("foo")).toBeNull();
  });

  it("rejette si bids/asks ne sont pas des arrays", () => {
    expect(
      parseOrderbookPayload({ ...VALID_PAYLOAD, bids: "not array" }),
    ).toBeNull();
    expect(
      parseOrderbookPayload({ ...VALID_PAYLOAD, asks: null }),
    ).toBeNull();
  });

  it("rejette si timestampNs n'est pas un number fini", () => {
    expect(
      parseOrderbookPayload({ ...VALID_PAYLOAD, timestampNs: NaN }),
    ).toBeNull();
    expect(
      parseOrderbookPayload({ ...VALID_PAYLOAD, timestampNs: Infinity }),
    ).toBeNull();
    expect(
      parseOrderbookPayload({ ...VALID_PAYLOAD, timestampNs: "123" }),
    ).toBeNull();
  });

  it("accepte bids/asks vides (pas d'erreur)", () => {
    const empty = { ...VALID_PAYLOAD, bids: [], asks: [] };
    const snap = parseOrderbookPayload(empty);
    expect(snap).not.toBeNull();
    expect(snap!.bids).toEqual([]);
    expect(snap!.asks).toEqual([]);
  });
});
