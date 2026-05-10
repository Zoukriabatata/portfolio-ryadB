// Re-exports so imports stay shallow:
//   import { useUIStore, useThemeStore } from "@/stores";
//
// V1 grows this list as M3+ ports the trading stores from the web
// (useMarketStore, useFootprintStore, useHeatmapSettingsStore, …).

export { useUIStore } from "./useUIStore";
export { useThemeStore } from "./useThemeStore";
