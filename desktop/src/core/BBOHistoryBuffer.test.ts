import { describe, it, expect } from "vitest";
import { BBOHistoryBuffer } from "./BBOHistoryBuffer";

describe("BBOHistoryBuffer", () => {
  it("vide → count 0, latest null", () => {
    const buf = new BBOHistoryBuffer(100);
    expect(buf.count()).toBe(0);
    expect(buf.latest()).toBeNull();
  });

  it("ingest puis latest retourne le dernier", () => {
    const buf = new BBOHistoryBuffer(100);
    buf.ingest(1000, 100, 101);
    buf.ingest(2000, 110, 111);
    expect(buf.count()).toBe(2);
    expect(buf.latest()).toEqual({
      exchangeMs: 2000,
      bestBid: 110,
      bestAsk: 111,
    });
  });

  it("ring buffer wrap-around : capacité 3, 5 ingests → seulement les 3 derniers", () => {
    const buf = new BBOHistoryBuffer(3);
    for (let i = 1; i <= 5; i++) {
      buf.ingest(i * 1000, i * 100, i * 100 + 1);
    }
    expect(buf.count()).toBe(3);
    expect(buf.latest()).toEqual({ exchangeMs: 5000, bestBid: 500, bestAsk: 501 });
    // Vérifie que les 3 plus anciens (1000, 2000) ont été évincés.
    const out = new Float32Array(3 * 3);
    const n = buf.visibleEntries(0, 999_999, out);
    expect(n).toBe(3);
    expect(out[0]).toBe(3000);
    expect(out[3]).toBe(4000);
    expect(out[6]).toBe(5000);
  });

  it("visibleEntries filtre selon [tMin, tMax]", () => {
    const buf = new BBOHistoryBuffer(10);
    for (let i = 1; i <= 10; i++) {
      buf.ingest(i * 1000, i * 10, i * 10 + 1);
    }
    const out = new Float32Array(10 * 3);
    const n = buf.visibleEntries(3000, 7000, out);
    expect(n).toBe(5);
    expect(out[0]).toBe(3000);
    expect(out[12]).toBe(7000);
  });

  it("visibleEntries vide si fenêtre hors data", () => {
    const buf = new BBOHistoryBuffer(10);
    buf.ingest(5000, 100, 101);
    const out = new Float32Array(3);
    expect(buf.visibleEntries(10_000, 20_000, out)).toBe(0);
  });

  it("ingest rejette les valeurs non-finies", () => {
    const buf = new BBOHistoryBuffer(10);
    buf.ingest(NaN, 100, 101);
    buf.ingest(1000, Infinity, 101);
    buf.ingest(1000, 100, NaN);
    expect(buf.count()).toBe(0);
  });

  it("ingest valeurs finies → count incrémente", () => {
    const buf = new BBOHistoryBuffer(10);
    buf.ingest(1000, 100, 101);
    expect(buf.count()).toBe(1);
  });

  it("clear remet à zéro", () => {
    const buf = new BBOHistoryBuffer(10);
    buf.ingest(1000, 100, 101);
    buf.ingest(2000, 110, 111);
    buf.clear();
    expect(buf.count()).toBe(0);
    expect(buf.latest()).toBeNull();
  });

  it("visibleEntries throw si out trop petit", () => {
    const buf = new BBOHistoryBuffer(10);
    for (let i = 1; i <= 5; i++) {
      buf.ingest(i * 1000, i * 10, i * 10 + 1);
    }
    const out = new Float32Array(2 * 3); // trop petit pour 5 entries
    expect(() => buf.visibleEntries(0, 999_999, out)).toThrow();
  });

  it("constructor capacity invalide throw", () => {
    expect(() => new BBOHistoryBuffer(0)).toThrow();
    expect(() => new BBOHistoryBuffer(-1)).toThrow();
    expect(() => new BBOHistoryBuffer(NaN)).toThrow();
  });

  it("latest après wrap-around retourne le tout dernier ingest", () => {
    const buf = new BBOHistoryBuffer(3);
    buf.ingest(1000, 1, 2);
    buf.ingest(2000, 10, 20);
    buf.ingest(3000, 100, 200);
    buf.ingest(4000, 1000, 2000); // wrap : écrase l'index 0
    expect(buf.latest()).toEqual({
      exchangeMs: 4000,
      bestBid: 1000,
      bestAsk: 2000,
    });
  });
});
