import { describe, it, expect } from "vitest";
import { parseTradePayload } from "./TradesAdapter";

const VALID = {
  symbol: "BTCUSDT.BYBIT",
  price: 100_000.5,
  quantity: 0.123,
  side: "buy" as const,
  timestampNs: 1_778_360_880_412_642_800,
};

describe("parseTradePayload", () => {
  it("accepte un payload camelCase valide (timestampNs, side)", () => {
    const t = parseTradePayload(VALID);
    expect(t).not.toBeNull();
    expect(t!.price).toBe(100_000.5);
    expect(t!.size).toBe(0.123);
  });

  it("convertit timestampNs → exchangeMs (floor /1e6)", () => {
    const t = parseTradePayload(VALID);
    expect(t!.exchangeMs).toBe(1_778_360_880_412);
  });

  it('side "buy" → Trade.side "bid"', () => {
    const t = parseTradePayload({ ...VALID, side: "buy" });
    expect(t!.side).toBe("bid");
  });

  it('side "sell" → Trade.side "ask"', () => {
    const t = parseTradePayload({ ...VALID, side: "sell" });
    expect(t!.side).toBe("ask");
  });

  it("rejette payload snake_case (anti-régression bug REFONTE-3.5)", () => {
    const wrong = {
      ...VALID,
      timestamp_ns: VALID.timestampNs,
      timestampNs: undefined,
    };
    expect(parseTradePayload(wrong)).toBeNull();
  });

  it("rejette si side n'est pas buy/sell", () => {
    expect(parseTradePayload({ ...VALID, side: "neutral" })).toBeNull();
    expect(parseTradePayload({ ...VALID, side: "BID" })).toBeNull();
    expect(parseTradePayload({ ...VALID, side: undefined })).toBeNull();
  });

  it("rejette si timestampNs n'est pas un number fini", () => {
    expect(parseTradePayload({ ...VALID, timestampNs: NaN })).toBeNull();
    expect(parseTradePayload({ ...VALID, timestampNs: Infinity })).toBeNull();
    expect(parseTradePayload({ ...VALID, timestampNs: "123" })).toBeNull();
  });

  it("rejette si price ou quantity ne sont pas des numbers", () => {
    expect(parseTradePayload({ ...VALID, price: "100" })).toBeNull();
    expect(parseTradePayload({ ...VALID, quantity: null })).toBeNull();
  });

  it("rejette null / undefined / primitives", () => {
    expect(parseTradePayload(null)).toBeNull();
    expect(parseTradePayload(undefined)).toBeNull();
    expect(parseTradePayload(42)).toBeNull();
    expect(parseTradePayload("foo")).toBeNull();
  });

  it("précision sur grand timestampNs : pas de NaN/Infinity", () => {
    const big = { ...VALID, timestampNs: 1_900_000_000_000_000_000 };
    const t = parseTradePayload(big);
    expect(t).not.toBeNull();
    expect(Number.isFinite(t!.exchangeMs)).toBe(true);
    expect(t!.exchangeMs).toBeGreaterThan(1.8e12);
  });
});
