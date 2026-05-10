// Phase B / M4.5 — multi-bar volume aggregation for session POC.
//
// "Session" here just means "all bars currently visible". The chart
// already filters bars by symbol+timeframe upstream, so summing
// every visible bar's price levels yields the correct session
// distribution without additional context.

import type { RendererBar } from "./types";

export interface SessionLevel {
  buyVolume: number;
  sellVolume: number;
}

export type SessionLevelMap = Map<number, SessionLevel>;

export function aggregateSessionLevels(bars: RendererBar[]): SessionLevelMap {
  const agg: SessionLevelMap = new Map();
  for (const bar of bars) {
    for (const lvl of bar.levels) {
      const cur = agg.get(lvl.price);
      if (cur) {
        cur.buyVolume += lvl.buyVolume;
        cur.sellVolume += lvl.sellVolume;
      } else {
        agg.set(lvl.price, {
          buyVolume: lvl.buyVolume,
          sellVolume: lvl.sellVolume,
        });
      }
    }
  }
  return agg;
}

/** Price level with the highest cumulative volume across all bars,
 *  or null when the input has no levels. We aggregate across bars
 *  first because two bars can hit the same price — naive max over
 *  single-bar volume would underweight high-traffic levels. */
export function sessionPOC(bars: RendererBar[]): number | null {
  const agg = aggregateSessionLevels(bars);
  let pocPrice = 0;
  let pocVol = -1;
  for (const [price, v] of agg) {
    const total = v.buyVolume + v.sellVolume;
    if (total > pocVol) {
      pocVol = total;
      pocPrice = price;
    }
  }
  return pocVol < 0 ? null : pocPrice;
}
