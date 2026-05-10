import { describe, it, expect, vi } from "vitest";

// gradient.ts touche le DOM (getComputedStyle) → mock pour tester en Node.
vi.mock("./gradient", () => ({
  buildGradientTexture256: () => new Uint8Array(256 * 4),
}));

import { LiquidityHeatmapLayer } from "./LiquidityHeatmapLayer";
import { createGridSystem } from "../core";

function makeMockRegl() {
  const tex = {
    subimage: vi.fn(),
    destroy: vi.fn(),
  };
  const buf = { destroy: vi.fn() };
  const drawCmd = vi.fn();
  // regl est lui-même appelable (fabrique de DrawCommand)
  const regl = vi.fn(() => drawCmd) as unknown as {
    texture: ReturnType<typeof vi.fn>;
    buffer: ReturnType<typeof vi.fn>;
  } & ((spec: unknown) => unknown);
  regl.texture = vi.fn(() => tex);
  regl.buffer = vi.fn(() => buf);
  return { regl, tex, buf, drawCmd };
}

const SMALL_GRID = createGridSystem({
  bucketDurationMs: 100,
  historyDurationMs: 1000,
  nowExchangeMs: 1_700_000_000_000,
  tickSize: 0.1,
  priceMin: 100,
  priceMax: 110,
});
// historyLength = 10, priceLevels = 100 → 1000 cells

describe("LiquidityHeatmapLayer (smoke, mock regl)", () => {
  it("dirty flag exists and starts at false", () => {
    const layer = new LiquidityHeatmapLayer();
    expect(layer.dirty).toBe(false);
  });

  it("init creates 2 textures + 1 buffer + 1 draw command", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    expect(() => layer.init(m.regl as never, SMALL_GRID)).not.toThrow();
    expect(m.regl.texture).toHaveBeenCalledTimes(2);
    expect(m.regl.buffer).toHaveBeenCalledTimes(1);
    expect(m.regl).toHaveBeenCalledTimes(1);
  });

  it("update calls intensityTex.subimage exactly once", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    layer.init(m.regl as never, SMALL_GRID);
    const cells = new Float32Array(
      SMALL_GRID.historyLength * SMALL_GRID.priceLevels,
    );
    layer.update(SMALL_GRID, { grid: SMALL_GRID, cells });
    expect(m.tex.subimage).toHaveBeenCalledTimes(1);
  });

  it("update throws if cells size diverges", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    layer.init(m.regl as never, SMALL_GRID);
    expect(() =>
      layer.update(SMALL_GRID, {
        grid: SMALL_GRID,
        cells: new Float32Array(42),
      }),
    ).toThrow(/cells\.length/);
  });

  it("update before init throws", () => {
    const layer = new LiquidityHeatmapLayer();
    expect(() =>
      layer.update(SMALL_GRID, {
        grid: SMALL_GRID,
        cells: new Float32Array(0),
      }),
    ).toThrow(/before init/);
  });

  it("draw invokes the regl draw command", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    layer.init(m.regl as never, SMALL_GRID);
    layer.draw();
    expect(m.drawCmd).toHaveBeenCalledTimes(1);
  });

  it("draw before init is a silent no-op", () => {
    const layer = new LiquidityHeatmapLayer();
    expect(() => layer.draw()).not.toThrow();
  });

  it("onViewportChange idempotent : pas de realloc si dims identiques", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    layer.init(m.regl as never, SMALL_GRID);
    const texCallsBefore = m.regl.texture.mock.calls.length;
    // Même grid → no-op attendu
    layer.onViewportChange(SMALL_GRID);
    expect(m.regl.texture.mock.calls.length).toBe(texCallsBefore);
  });

  it("onViewportChange recrée la texture si dims changent", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    layer.init(m.regl as never, SMALL_GRID);
    const texCallsBefore = m.regl.texture.mock.calls.length;
    const otherGrid = createGridSystem({
      bucketDurationMs: 100,
      historyDurationMs: 1000,
      nowExchangeMs: 1_700_000_000_000,
      tickSize: 0.1,
      priceMin: 100,
      priceMax: 120, // 200 levels au lieu de 100
    });
    layer.onViewportChange(otherGrid);
    expect(m.regl.texture.mock.calls.length).toBe(texCallsBefore + 1);
  });

  it("destroy releases textures + buffer; idempotent", () => {
    const m = makeMockRegl();
    const layer = new LiquidityHeatmapLayer();
    layer.init(m.regl as never, SMALL_GRID);
    layer.destroy();
    // 2 textures partagent le mock → tex.destroy appelé au moins 1 fois
    expect(m.tex.destroy).toHaveBeenCalled();
    expect(m.buf.destroy).toHaveBeenCalledTimes(1);
    expect(() => layer.destroy()).not.toThrow();
  });
});
