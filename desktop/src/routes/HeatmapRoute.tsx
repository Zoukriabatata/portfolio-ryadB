import { HeatmapLive } from "../dev/HeatmapLive";

// REFONTE-3..5 : route /heatmap = harness live (Bybit BTCUSDT linear).
// Mock harness initial (REFONTE-2) supprimé en REFONTE-5.
export function HeatmapRoute() {
  return <HeatmapLive />;
}
