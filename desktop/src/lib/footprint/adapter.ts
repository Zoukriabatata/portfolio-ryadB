// Phase B / M4 — translate the Tauri FootprintBar payload into the
// renderer's internal shape. Keeps the renderer agnostic of the
// upstream wire format and folds in computed aggregates (POC, max
// level volume) in one pass.

import type { FootprintBar } from "../../components/FootprintBarView";
import type { RendererBar, RendererPriceLevel } from "./types";

export function tauriBarToRendererBar(bar: FootprintBar): RendererBar {
  let pocPrice = bar.close;
  let pocVolume = 0;
  let maxLevelVolume = 0;

  const levels: RendererPriceLevel[] = bar.levels.map((l) => {
    const total = l.buyVolume + l.sellVolume;
    if (total > pocVolume) {
      pocVolume = total;
      pocPrice = l.price;
    }
    if (total > maxLevelVolume) maxLevelVolume = total;
    return {
      price: l.price,
      buyVolume: l.buyVolume,
      sellVolume: l.sellVolume,
      buyTrades: l.buyTrades,
      sellTrades: l.sellTrades,
    };
  });

  return {
    timeMs: bar.bucketTsNs / 1_000_000,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    totalVolume: bar.totalVolume,
    totalDelta: bar.totalDelta,
    tradeCount: bar.tradeCount,
    levels,
    poc: pocPrice,
    pocVolume,
    maxLevelVolume,
  };
}
