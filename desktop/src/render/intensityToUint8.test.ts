import { describe, it, expect } from "vitest";
import { intensityToUint8 } from "./intensityToUint8";

describe("intensityToUint8", () => {
  it("0 → 0, 1 → 255, 0.5 → 127", () => {
    const cells = new Float32Array([0, 1, 0.5]);
    const out = new Uint8Array(3);
    intensityToUint8(cells, out);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(255);
    expect(out[2]).toBe(127);
  });

  it("0.999 → 254 (truncation, not rounding)", () => {
    const cells = new Float32Array([0.999]);
    const out = new Uint8Array(1);
    intensityToUint8(cells, out);
    expect(out[0]).toBe(254);
  });

  it("clamps below 0 → 0", () => {
    const cells = new Float32Array([-0.1, -1, -100]);
    const out = new Uint8Array(3);
    intensityToUint8(cells, out);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });

  it("clamps above 1 → 255", () => {
    const cells = new Float32Array([1.5, 100, 1.0001]);
    const out = new Uint8Array(3);
    intensityToUint8(cells, out);
    expect(Array.from(out)).toEqual([255, 255, 255]);
  });

  it("throws on size mismatch", () => {
    const cells = new Float32Array(10);
    const out = new Uint8Array(5);
    expect(() => intensityToUint8(cells, out)).toThrow(/length/);
  });

  it("reuses out buffer in place across calls", () => {
    const out = new Uint8Array(2);
    intensityToUint8(new Float32Array([1, 0]), out);
    expect(Array.from(out)).toEqual([255, 0]);
    intensityToUint8(new Float32Array([0, 1]), out);
    expect(Array.from(out)).toEqual([0, 255]);
  });
});
