import { describe, it, expect } from "vitest";
import {
  shouldRecomputeFrame,
  shouldReallocOnViewportChange,
  pixelsToGrid,
} from "./HeatmapEngine";
import { createGridSystem, type GridSystemSpec } from "../core";

// Tests unitaires sur le helper pur. L'engine complet (avec regl + canvas)
// est validé par la harness live, pas en CI Node.
describe("shouldRecomputeFrame", () => {
  it("false si pas de pending update", () => {
    expect(shouldRecomputeFrame(false, 100, 99)).toBe(false);
    expect(shouldRecomputeFrame(false, 100, -Infinity)).toBe(false);
  });

  it("false si pending mais bucket inchangé", () => {
    expect(shouldRecomputeFrame(true, 100, 100)).toBe(false);
  });

  it("false si pending mais bucket reculé (cas dégénéré)", () => {
    expect(shouldRecomputeFrame(true, 99, 100)).toBe(false);
  });

  it("true si pending et bucket avancé d'un cran", () => {
    expect(shouldRecomputeFrame(true, 101, 100)).toBe(true);
  });

  it("true au premier appel (lastBucket = -Infinity)", () => {
    expect(shouldRecomputeFrame(true, 0, -Infinity)).toBe(true);
    expect(shouldRecomputeFrame(true, 1_000_000, -Infinity)).toBe(true);
  });
});

describe("shouldReallocOnViewportChange", () => {
  it("false si dims identiques (pan-only)", () => {
    expect(shouldReallocOnViewportChange(200, 200)).toBe(false);
    expect(shouldReallocOnViewportChange(0, 0)).toBe(false);
  });

  it("true si dims plus larges (zoom out)", () => {
    expect(shouldReallocOnViewportChange(200, 400)).toBe(true);
  });

  it("true si dims plus étroites (zoom in)", () => {
    expect(shouldReallocOnViewportChange(400, 200)).toBe(true);
  });

  it("true même pour des deltas de 1 niveau", () => {
    expect(shouldReallocOnViewportChange(200, 199)).toBe(true);
    expect(shouldReallocOnViewportChange(200, 201)).toBe(true);
  });
});

describe("pixelsToGrid", () => {
  const SPEC: GridSystemSpec = {
    bucketDurationMs: 100,
    historyDurationMs: 1000,
    nowExchangeMs: 10_000,
    tickSize: 1,
    priceMin: 100,
    priceMax: 110,
  };
  const W = 1000;
  const H = 200;

  it("centre canvas → mid-time, mid-price", () => {
    const grid = createGridSystem(SPEC);
    const r = pixelsToGrid(W / 2, H / 2, W, H, grid)!;
    expect(r.timestampMs).toBeCloseTo(grid.oldestExchangeMs + 500, 5); // 9000 + 500 = 9500
    expect(r.price).toBeCloseTo(105, 5); // mid de 100..110
  });

  it("top-left (0, 0) → priceMax + oldestExchangeMs", () => {
    const grid = createGridSystem(SPEC);
    const r = pixelsToGrid(0, 0, W, H, grid)!;
    expect(r.timestampMs).toBe(grid.oldestExchangeMs);
    expect(r.price).toBe(110);
  });

  it("bottom-right (W-1, H-1) → ~priceMin + ~nowExchangeMs", () => {
    const grid = createGridSystem(SPEC);
    const r = pixelsToGrid(W - 1, H - 1, W, H, grid)!;
    // Approche les bords sans les atteindre (semi-ouvert)
    expect(r.timestampMs).toBeLessThan(grid.nowExchangeMs);
    expect(r.timestampMs).toBeGreaterThan(grid.nowExchangeMs - 5);
    expect(r.price).toBeLessThan(grid.priceMin + 0.1);
    expect(r.price).toBeGreaterThan(grid.priceMin);
  });

  it("hors bornes → null", () => {
    const grid = createGridSystem(SPEC);
    expect(pixelsToGrid(-1, 0, W, H, grid)).toBeNull();
    expect(pixelsToGrid(0, -5, W, H, grid)).toBeNull();
    expect(pixelsToGrid(W, 0, W, H, grid)).toBeNull();
    expect(pixelsToGrid(0, H, W, H, grid)).toBeNull();
    expect(pixelsToGrid(W + 10, H + 10, W, H, grid)).toBeNull();
  });

  it("canvas size 0 → null", () => {
    const grid = createGridSystem(SPEC);
    expect(pixelsToGrid(50, 50, 0, H, grid)).toBeNull();
    expect(pixelsToGrid(50, 50, W, 0, grid)).toBeNull();
    expect(pixelsToGrid(50, 50, 0, 0, grid)).toBeNull();
  });
});
