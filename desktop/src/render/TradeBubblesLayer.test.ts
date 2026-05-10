import { describe, it, expect, vi, beforeAll } from "vitest";

// Stub DOM globals (Node env Vitest n'a ni document ni getComputedStyle).
beforeAll(() => {
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: string) => {
      if (name === "--bid") return "#26a69a";
      if (name === "--ask") return "#ef5350";
      return "";
    },
  }));
});

import { TradeBubblesLayer, volumeToRadiusPx } from "./TradeBubblesLayer";
import { TradesBuffer } from "./TradesBuffer";
import { createGridSystem, type GridSystemSpec } from "../core";

function makeMockRegl() {
  const buf = { destroy: vi.fn(), subdata: vi.fn() };
  const drawCmd = vi.fn();
  const regl = vi.fn(() => drawCmd) as unknown as {
    buffer: ReturnType<typeof vi.fn>;
    hasExtension: ReturnType<typeof vi.fn>;
    prop: <T, K extends keyof T>(name: K) => T[K];
  } & ((spec: unknown) => unknown);
  regl.buffer = vi.fn(() => buf);
  regl.hasExtension = vi.fn(() => true);
  regl.prop = vi.fn(<T, K extends keyof T>(name: K) => name) as never;
  return { regl, buf, drawCmd };
}

const SPEC: GridSystemSpec = {
  bucketDurationMs: 100,
  historyDurationMs: 1000,
  nowExchangeMs: 10_000,
  tickSize: 0.1,
  priceMin: 100,
  priceMax: 110,
};

describe("volumeToRadiusPx", () => {
  it("size = median → radius = base", () => {
    expect(volumeToRadiusPx(10, 10, 4, 2, 30)).toBeCloseTo(4, 5);
  });

  it("size = 4× median → radius = 2× base (sqrt)", () => {
    expect(volumeToRadiusPx(40, 10, 4, 2, 30)).toBeCloseTo(8, 5);
  });

  it("size = 0.25× median → radius = 0.5× base", () => {
    expect(volumeToRadiusPx(2.5, 10, 4, 2, 30)).toBeCloseTo(2, 5);
  });

  it("size très grand → clamp max", () => {
    expect(volumeToRadiusPx(10_000, 1, 4, 2, 30)).toBe(30);
  });

  it("size très petit → clamp min", () => {
    expect(volumeToRadiusPx(0.0001, 100, 4, 2, 30)).toBe(2);
  });

  it("median = 0 → fallback baseRadiusPx (pas NaN)", () => {
    expect(volumeToRadiusPx(10, 0, 4, 2, 30)).toBe(4);
  });

  it("median = NaN → fallback baseRadiusPx", () => {
    expect(volumeToRadiusPx(10, NaN, 4, 2, 30)).toBe(4);
  });

  it("size <= 0 → minPx", () => {
    expect(volumeToRadiusPx(0, 10, 4, 2, 30)).toBe(2);
    expect(volumeToRadiusPx(-5, 10, 4, 2, 30)).toBe(2);
  });
});

describe("TradeBubblesLayer (smoke, mock regl)", () => {
  it("dirty starts false", () => {
    const layer = new TradeBubblesLayer();
    expect(layer.dirty).toBe(false);
  });

  it("init crée 2 buffers + 1 draw command, exige hasExtension", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    const grid = createGridSystem(SPEC);
    layer.init(m.regl as never, grid);
    expect(m.regl.hasExtension).toHaveBeenCalledWith("ANGLE_instanced_arrays");
    expect(m.regl.buffer).toHaveBeenCalledTimes(2);
    expect(m.regl).toHaveBeenCalledTimes(1);
  });

  it("init throw si extension absente", () => {
    const m = makeMockRegl();
    m.regl.hasExtension = vi.fn(() => false);
    const layer = new TradeBubblesLayer();
    expect(() => layer.init(m.regl as never, createGridSystem(SPEC))).toThrow(
      /ANGLE_instanced_arrays/,
    );
  });

  it("update remplit instanceCount avec le nb de trades visibles", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    const grid = createGridSystem(SPEC);
    layer.init(m.regl as never, grid);
    layer.setCanvasSize(800, 600);

    const buf = new TradesBuffer(100);
    for (let i = 0; i < 5; i++) {
      buf.ingest({
        exchangeMs: 9_500 + i * 50,
        price: 105,
        size: 1 + i,
        side: i % 2 === 0 ? "bid" : "ask",
      });
    }
    layer.update(grid, buf);
    expect(m.buf.subdata).toHaveBeenCalledTimes(1);
  });

  it("update ne subdata pas si 0 trades visibles", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    const grid = createGridSystem(SPEC);
    layer.init(m.regl as never, grid);
    const buf = new TradesBuffer(100);
    layer.update(grid, buf);
    expect(m.buf.subdata).not.toHaveBeenCalled();
  });

  it("draw appelle drawCmd avec instances param", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    const grid = createGridSystem(SPEC);
    layer.init(m.regl as never, grid);
    const buf = new TradesBuffer(100);
    buf.ingest({ exchangeMs: 9_500, price: 105, size: 1, side: "bid" });
    layer.update(grid, buf);
    layer.draw();
    expect(m.drawCmd).toHaveBeenCalledWith({ instances: 1 });
  });

  it("draw ne fait rien si instanceCount = 0", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    const grid = createGridSystem(SPEC);
    layer.init(m.regl as never, grid);
    layer.draw();
    expect(m.drawCmd).not.toHaveBeenCalled();
  });

  it("destroy idempotent", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    layer.init(m.regl as never, createGridSystem(SPEC));
    layer.destroy();
    expect(m.buf.destroy).toHaveBeenCalled();
    expect(() => layer.destroy()).not.toThrow();
  });

  it("onViewportChange est no-op (pas de realloc)", () => {
    const m = makeMockRegl();
    const layer = new TradeBubblesLayer();
    const grid = createGridSystem(SPEC);
    layer.init(m.regl as never, grid);
    const bufCallsBefore = m.regl.buffer.mock.calls.length;
    layer.onViewportChange(grid);
    expect(m.regl.buffer.mock.calls.length).toBe(bufCallsBefore);
  });
});
