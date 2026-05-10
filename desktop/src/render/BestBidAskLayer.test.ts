import { describe, it, expect } from "vitest";
import { lerpStep } from "./BestBidAskLayer";

describe("lerpStep (BestBidAskLayer)", () => {
  it("snap au target quand displayed est NaN (premier frame)", () => {
    expect(lerpStep(NaN, 100, 0.2)).toBe(100);
  });

  it("garde displayed inchangé si target est NaN (carnet vide)", () => {
    expect(lerpStep(50, NaN, 0.2)).toBe(50);
  });

  it("convergence vers le target avec factor 0.2", () => {
    // displayed = 100, target = 110, factor 0.2
    // result = 100 + (110 - 100) * 0.2 = 102
    expect(lerpStep(100, 110, 0.2)).toBeCloseTo(102, 5);
  });

  it("factor 0 = pas de mouvement", () => {
    expect(lerpStep(100, 200, 0)).toBe(100);
  });

  it("factor 1 = jump direct au target", () => {
    expect(lerpStep(100, 200, 1)).toBe(200);
  });

  it("convergence sur 5 frames consécutives (test de stabilité)", () => {
    let v = 100;
    const target = 110;
    for (let i = 0; i < 10; i++) {
      v = lerpStep(v, target, 0.2);
    }
    // Après 10 frames factor 0.2 : reste 0.8^10 ≈ 10.7% du delta
    // → v ≈ 110 - 10 × 0.107 ≈ 108.9
    expect(v).toBeGreaterThan(108);
    expect(v).toBeLessThan(110);
  });

  it("target descendant (bid baisse) : displayed diminue progressivement", () => {
    expect(lerpStep(100, 90, 0.2)).toBeCloseTo(98, 5);
  });

  it("target identique à displayed : pas de drift numérique", () => {
    expect(lerpStep(100, 100, 0.2)).toBe(100);
  });

  it("les deux NaN : retourne NaN (carnet vide depuis le start)", () => {
    expect(Number.isNaN(lerpStep(NaN, NaN, 0.2))).toBe(true);
  });
});
