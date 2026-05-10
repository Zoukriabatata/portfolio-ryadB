import { describe, it, expect } from "vitest";
import { ClockSource } from "./ClockSource";

describe("ClockSource", () => {
  it("starts at 0 and reports not received", () => {
    const c = new ClockSource();
    expect(c.now()).toBe(0);
    expect(c.hasReceived()).toBe(false);
  });

  it("first tick sets now and flips hasReceived", () => {
    const c = new ClockSource();
    c.tick(1_000_000);
    expect(c.now()).toBe(1_000_000);
    expect(c.hasReceived()).toBe(true);
  });

  it("strictly increasing ticks update now", () => {
    const c = new ClockSource();
    c.tick(100);
    c.tick(200);
    c.tick(300);
    expect(c.now()).toBe(300);
  });

  it("equal tick is a no-op (no error, no change)", () => {
    const c = new ClockSource();
    c.tick(500);
    expect(() => c.tick(500)).not.toThrow();
    expect(c.now()).toBe(500);
  });

  it("out-of-order tick is ignored", () => {
    const c = new ClockSource();
    c.tick(1000);
    c.tick(900);
    c.tick(500);
    expect(c.now()).toBe(1000);
  });

  it("noisy stream: now() equals max received", () => {
    const c = new ClockSource();
    let max = 0;
    for (let i = 0; i < 1000; i++) {
      const base = i * 10;
      // 10 % out-of-order via deterministic jitter (modulo, no PRNG)
      const t = i % 10 === 0 ? Math.max(0, base - 50) : base;
      if (t > max) max = t;
      c.tick(t);
    }
    expect(c.now()).toBe(max);
  });
});
