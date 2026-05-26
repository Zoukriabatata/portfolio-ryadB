import { describe, it, expect } from "vitest";
import { parseHexRGB } from "./BestBidAskLayer";

describe("parseHexRGB", () => {
  it("parse #00e676 (brand-green)", () => {
    expect(parseHexRGB("#00e676")).toEqual({ r: 0, g: 230, b: 118 });
  });

  it("parse #ff3d71 (accent-red)", () => {
    expect(parseHexRGB("#ff3d71")).toEqual({ r: 255, g: 61, b: 113 });
  });

  it("parse sans #", () => {
    expect(parseHexRGB("00e676")).toEqual({ r: 0, g: 230, b: 118 });
  });

  it("trim whitespace", () => {
    expect(parseHexRGB("  #00e676  ")).toEqual({ r: 0, g: 230, b: 118 });
  });

  it("hex invalide → fallback brand-green", () => {
    expect(parseHexRGB("xyz")).toEqual({ r: 0, g: 230, b: 118 });
    expect(parseHexRGB("#abc")).toEqual({ r: 0, g: 230, b: 118 });
    expect(parseHexRGB("")).toEqual({ r: 0, g: 230, b: 118 });
  });

  it("hex avec lettres non-hex → fallback", () => {
    expect(parseHexRGB("#GGHHII")).toEqual({ r: 0, g: 230, b: 118 });
  });
});
