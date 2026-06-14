import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useGexStore } from "./useGexStore";
import {
  isOpra, startOpraRefresh, stopOpraRefresh,
  type GexSnapshot,
} from "./api";

/** Full-chain refresh interval — 15 min, matches backend cache TTL (free tier). */
const FULL_REFRESH_MS = 15 * 60_000;

/** Live spot tick interval — 5 s (free tier). */
const TICK_INTERVAL_MS = 5_000;

/** Mount once in GexRoute. Two modes:
 *
 *  **Free tier**: two JS timers — full snapshot every 15 min, spot tick every 5 s.
 *
 *  **OPRA tier**: the Rust backend owns the 90 s refresh loop and emits
 *  `"gex-snapshot-update"` Tauri events. This hook starts the loop on mount,
 *  listens for events, and stops the loop on unmount. No JS timers needed.
 */
export function useGexPolling() {
  const fetchSnapshot = useGexStore((s) => s.fetchSnapshot);
  const tickSpot = useGexStore((s) => s.tickSpot);
  const setSnapshotFromEvent = useGexStore((s) => s.setSnapshotFromEvent);
  const autoRefresh = useGexStore((s) => s.autoRefresh);
  const symbol = useGexStore((s) => s.symbol);

  useEffect(() => {
    let fullTimer: ReturnType<typeof setInterval> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;
    let unlisten: (() => void) | null = null;
    let opraStarted = false;

    void (async () => {
      // Initial fetch on mount — always, regardless of mode.
      await fetchSnapshot();

      const opra = await isOpra().catch(() => false);

      if (opra) {
        // Start the Rust 90 s refresh loop for this symbol.
        await startOpraRefresh(symbol).catch((e) =>
          console.warn("gex opra start failed:", e)
        );
        opraStarted = true;

        // Listen for snapshot events emitted by the backend loop.
        const unlistenFn = await listen<GexSnapshot>(
          "gex-snapshot-update",
          (ev) => setSnapshotFromEvent(ev.payload),
        );
        unlisten = unlistenFn;
      } else if (autoRefresh) {
        fullTimer = setInterval(() => void fetchSnapshot(), FULL_REFRESH_MS);
        tickTimer = setInterval(() => void tickSpot(), TICK_INTERVAL_MS);
      }
    })();

    return () => {
      if (fullTimer) clearInterval(fullTimer);
      if (tickTimer) clearInterval(tickTimer);
      if (unlisten) unlisten();
      if (opraStarted) {
        void stopOpraRefresh().catch((e) =>
          console.warn("gex opra stop failed:", e)
        );
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);
  // Depends only on `symbol` so that switching symbols re-mounts the loop.
  // fetchSnapshot / tickSpot / setSnapshotFromEvent are stable store references.
}
