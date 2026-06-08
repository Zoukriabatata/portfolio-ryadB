import { describe, it, expect } from "vitest";
import {
  goLive,
  resetScale,
  isLiveMode,
  DEFAULT_INTERACTION,
} from "./interactions";

describe("goLive", () => {
  it("resets scrollX to 0 and clears userOverrodeX", () => {
    const state = { ...DEFAULT_INTERACTION, scrollX: 500, userOverrodeX: true };
    const next = goLive(state);
    expect(next.scrollX).toBe(0);
    expect(next.userOverrodeX).toBe(false);
  });

  it("does not touch zoom or vertical state", () => {
    const state = {
      ...DEFAULT_INTERACTION,
      scrollX: 100,
      cellWidth: 300,
      rowHeight: 40,
      userOverrodeY: true,
      verticalMode: "none" as const,
    };
    const next = goLive(state);
    expect(next.cellWidth).toBe(300);
    expect(next.rowHeight).toBe(40);
    expect(next.userOverrodeY).toBe(true);
    expect(next.verticalMode).toBe("none");
  });
});

describe("resetScale", () => {
  it("resets cellWidth and rowHeight to provided defaults", () => {
    const state = { ...DEFAULT_INTERACTION, cellWidth: 300, rowHeight: 40 };
    const next = resetScale(state, 140, 20);
    expect(next.cellWidth).toBe(140);
    expect(next.rowHeight).toBe(20);
  });

  it("clears userOverrodeY and resets verticalMode to last-price", () => {
    const state = {
      ...DEFAULT_INTERACTION,
      userOverrodeY: true,
      verticalMode: "none" as const,
    };
    const next = resetScale(state, 140, 20);
    expect(next.userOverrodeY).toBe(false);
    expect(next.verticalMode).toBe("last-price");
  });

  it("does not touch scrollX or userOverrodeX", () => {
    const state = {
      ...DEFAULT_INTERACTION,
      scrollX: 500,
      userOverrodeX: true,
    };
    const next = resetScale(state, 140, 20);
    expect(next.scrollX).toBe(500);
    expect(next.userOverrodeX).toBe(true);
  });
});

describe("isLiveMode", () => {
  it("returns true when userOverrodeX is false", () => {
    expect(isLiveMode({ ...DEFAULT_INTERACTION, userOverrodeX: false })).toBe(true);
  });

  it("returns false when userOverrodeX is true", () => {
    expect(isLiveMode({ ...DEFAULT_INTERACTION, userOverrodeX: true })).toBe(false);
  });
});
