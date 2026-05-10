import { describe, it, expect } from "vitest";
import { classifyVolumeBar } from "./VolumeProfileLayer";

describe("classifyVolumeBar", () => {
  it("priceIndex === pocIdx → 'poc'", () => {
    expect(classifyVolumeBar(5, 5, 3, 7)).toBe("poc");
  });

  it("priceIndex dans [valIdx, vahIdx] mais ≠ pocIdx → 'va'", () => {
    expect(classifyVolumeBar(4, 5, 3, 7)).toBe("va");
    expect(classifyVolumeBar(6, 5, 3, 7)).toBe("va");
    expect(classifyVolumeBar(3, 5, 3, 7)).toBe("va");
    expect(classifyVolumeBar(7, 5, 3, 7)).toBe("va");
  });

  it("priceIndex hors [valIdx, vahIdx] → 'neutral'", () => {
    expect(classifyVolumeBar(2, 5, 3, 7)).toBe("neutral");
    expect(classifyVolumeBar(8, 5, 3, 7)).toBe("neutral");
    expect(classifyVolumeBar(0, 5, 3, 7)).toBe("neutral");
  });

  it("pocIdx = -1 (pas de POC) → 'neutral' (priority POC ignorée)", () => {
    expect(classifyVolumeBar(5, -1, 3, 7)).toBe("va");
    expect(classifyVolumeBar(0, -1, 3, 7)).toBe("neutral");
  });

  it("valIdx = -1 OU vahIdx = -1 → 'neutral' (sauf POC)", () => {
    expect(classifyVolumeBar(5, 5, -1, 7)).toBe("poc");
    expect(classifyVolumeBar(4, 5, -1, 7)).toBe("neutral");
    expect(classifyVolumeBar(5, 5, 3, -1)).toBe("poc");
    expect(classifyVolumeBar(4, 5, 3, -1)).toBe("neutral");
  });

  it("single bucket : POC = VAH = VAL = 5 à i=5 → 'poc'", () => {
    expect(classifyVolumeBar(5, 5, 5, 5)).toBe("poc");
    expect(classifyVolumeBar(4, 5, 5, 5)).toBe("neutral");
    expect(classifyVolumeBar(6, 5, 5, 5)).toBe("neutral");
  });

  it("priceIndex = -1 ne crash pas (jamais en pratique)", () => {
    expect(classifyVolumeBar(-1, 5, 3, 7)).toBe("neutral");
    // edge: pocIdx aussi -1 → "neutral" car la garde pocIdx >= 0 protège
    expect(classifyVolumeBar(-1, -1, 3, 7)).toBe("neutral");
  });
});
