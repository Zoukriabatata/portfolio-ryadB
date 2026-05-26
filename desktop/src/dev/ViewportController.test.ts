import { describe, it, expect } from "vitest";
import {
  zoomRangeAroundCursor,
  pixelYToPrice,
} from "./ViewportController";

describe("zoomRangeAroundCursor (cursor-anchored zoom)", () => {
  it("zoom in puis zoom out au même point ramène aux coords initiales", () => {
    const cursor = 100.5;
    const initial = { min: 100, max: 101 };
    // Zoom in (factor < 1)
    const zoomedIn = zoomRangeAroundCursor(
      initial.min,
      initial.max,
      cursor,
      0.5,
    );
    // Zoom out same factor inverse
    const zoomedOut = zoomRangeAroundCursor(
      zoomedIn.min,
      zoomedIn.max,
      cursor,
      2.0,
    );
    expect(zoomedOut.min).toBeCloseTo(initial.min, 6);
    expect(zoomedOut.max).toBeCloseTo(initial.max, 6);
  });

  it("idempotence sur 100 zoom alternés (in/out × 50)", () => {
    const cursor = 50;
    let { min, max } = { min: 0, max: 100 };
    for (let i = 0; i < 50; i++) {
      ({ min, max } = zoomRangeAroundCursor(min, max, cursor, 0.5));
      ({ min, max } = zoomRangeAroundCursor(min, max, cursor, 2.0));
    }
    expect(min).toBeCloseTo(0, 5);
    expect(max).toBeCloseTo(100, 5);
  });

  it("le cursor reste pile à la même position relative après zoom in", () => {
    // cursor à 25% du range initial
    const initial = { min: 0, max: 100 };
    const cursor = 25;
    const cursorRatioBefore = (cursor - initial.min) / (initial.max - initial.min);
    const z = zoomRangeAroundCursor(initial.min, initial.max, cursor, 0.5);
    const cursorRatioAfter = (cursor - z.min) / (z.max - z.min);
    expect(cursorRatioAfter).toBeCloseTo(cursorRatioBefore, 5);
  });

  it("le cursor reste pile à la même position relative après zoom out", () => {
    const initial = { min: 0, max: 100 };
    const cursor = 75;
    const cursorRatioBefore = (cursor - initial.min) / (initial.max - initial.min);
    const z = zoomRangeAroundCursor(initial.min, initial.max, cursor, 2.0);
    const cursorRatioAfter = (cursor - z.min) / (z.max - z.min);
    expect(cursorRatioAfter).toBeCloseTo(cursorRatioBefore, 5);
  });

  it("factor = 1 = no-op", () => {
    const z = zoomRangeAroundCursor(10, 20, 15, 1.0);
    expect(z.min).toBe(10);
    expect(z.max).toBe(20);
  });
});

describe("pixelYToPrice (round-trip avec viewport + pan)", () => {
  it("y=0 → priceMax (top of canvas)", () => {
    expect(pixelYToPrice(0, 0, 1000, 100, 200)).toBeCloseTo(200, 5);
  });

  it("y=canvasH → priceMin (bottom of canvas)", () => {
    expect(pixelYToPrice(1000, 0, 1000, 100, 200)).toBeCloseTo(100, 5);
  });

  it("y=canvasH/2 → mid price", () => {
    expect(pixelYToPrice(500, 0, 1000, 100, 200)).toBeCloseTo(150, 5);
  });

  it("pan modifie la projection : panY=100 → décalage prix correspondant", () => {
    // Sans pan, y=500 → 150. Avec panY=100, y=500 lit ce qui est à y=400 → +10 (10% du range vers priceMax).
    const noPan = pixelYToPrice(500, 0, 1000, 100, 200);
    const withPan = pixelYToPrice(500, 100, 1000, 100, 200);
    expect(withPan).toBeCloseTo(noPan + 10, 5);
  });

  it("round-trip via formule inverse priceToY", () => {
    const panY = 42;
    const canvasH = 1000;
    const priceMin = 100;
    const priceMax = 200;
    const range = priceMax - priceMin;
    // priceToY inverse de pixelYToPrice :
    // p = priceMax - ((y - panY) / canvasH) * range
    // ⇔ y = panY + ((priceMax - p) / range) * canvasH
    const targetPrice = 137.42;
    const y = panY + ((priceMax - targetPrice) / range) * canvasH;
    const recoveredPrice = pixelYToPrice(
      y,
      panY,
      canvasH,
      priceMin,
      priceMax,
    );
    expect(recoveredPrice).toBeCloseTo(targetPrice, 4);
  });

  it("canvasH = 0 → fallback priceMax", () => {
    expect(pixelYToPrice(500, 0, 0, 100, 200)).toBe(200);
  });
});
