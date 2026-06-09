import { invoke } from "@tauri-apps/api/core";

export type DepthLevel = {
  price: number;
  volume: number;
};

export type DepthSnapshot = {
  symbol: string;
  /** Bids sorted best-first (highest price → lowest price). */
  bids: DepthLevel[];
  /** Asks sorted best-first (lowest price → highest price). */
  asks: DepthLevel[];
  lastUpdateNs: number;
};

/** One-shot snapshot fetch for `symbol`. Returns `null` when the
 *  Quantower bridge has never seen a depth update for that instrument. */
export async function fetchQuantowerDepth(
  symbol: string,
): Promise<DepthSnapshot | null> {
  return invoke<DepthSnapshot | null>("quantower_get_depth", {
    args: { symbol },
  });
}
