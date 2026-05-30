import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSimAccountStore } from "./useSimAccountStore";

/** Lightweight payload shape — matches what RithmicFootprint listens to.
 *  We only need symbol + close + bucketTsNs here. */
type FootprintBarLike = {
  symbol: string;
  close: number;
  bucketTsNs: number;
};

/** Hook : subscribes to the live `footprint-update` Tauri event and
 *  feeds the current close price into the sim account store. Triggers
 *  SL/TP fills via the store's tickPrice action.
 *
 *  Per-symbol latest-bucket gate (added 2026-05-26): an event whose
 *  bucketTsNs is older than the latest one we've already seen for
 *  that symbol is IGNORED. Without this gate, a stale historical
 *  replay or an out-of-order broadcast can roll back livePrices to
 *  an earlier minute's close — surfacing as a panel/widget showing
 *  a price that's wildly different from the visible candles
 *  (seen in the wild: chart at 29819, panel at 29931).
 *
 *  Mounting strategy : mount once at the route level so the panel can
 *  be unmounted (collapsed) without losing the price feed. */
export function useSimTicker() {
  const tickPrice = useSimAccountStore((s) => s.tickPrice);

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    // Per-symbol latest bucketTsNs observed. We only push events
    // that move time forward — older buckets are stale and must
    // not overwrite the live price.
    const latestBucket: Record<string, number> = {};

    void (async () => {
      const fn = await listen<FootprintBarLike>("footprint-update", (e) => {
        const { symbol, close, bucketTsNs } = e.payload;
        if (!symbol || !Number.isFinite(close)) return;
        if (!Number.isFinite(bucketTsNs)) return;
        // Strip exchange suffix so the sim store keys by trading symbol
        // (e.g. "MNQM6") not the routing key ("MNQM6.CME"). The bridge
        // uses "MNQ 06-26" which has no dot — split() leaves it alone.
        const tradingSymbol = symbol.split(".")[0] || symbol;

        const seen = latestBucket[tradingSymbol] ?? 0;
        // `>=` (not `>`) so the live bar's own intra-bucket updates
        // — same bucketTsNs, fresh close — still propagate.
        if (bucketTsNs < seen) return;
        latestBucket[tradingSymbol] = bucketTsNs;

        tickPrice(tradingSymbol, close);
      });
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [tickPrice]);
}
