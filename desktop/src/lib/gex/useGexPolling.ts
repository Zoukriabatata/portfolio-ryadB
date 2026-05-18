import { useEffect } from "react";
import { useGexStore } from "./useGexStore";

/** Full-chain refresh interval — 15 min, matches backend cache TTL.
 *  This refetches the option chains (heavy, ~5s). */
const FULL_REFRESH_MS = 15 * 60_000;

/** Live spot tick interval — 5s. Lightweight server-side recompute
 *  from cached chains (~100ms). Visually animates Net GEX bars,
 *  Zero Gamma line, and IV ATM as the underlying moves. */
const TICK_INTERVAL_MS = 5_000;

/** Mount once in GexRoute. Drives two timers in parallel:
 *  - Full snapshot refresh every 15 min (chains + greeks + OI).
 *  - Spot tick every 5 s (recompute from cached chains so the
 *    chart breathes with the underlying). */
export function useGexPolling() {
  const fetchSnapshot = useGexStore((s) => s.fetchSnapshot);
  const tickSpot = useGexStore((s) => s.tickSpot);
  const autoRefresh = useGexStore((s) => s.autoRefresh);

  useEffect(() => {
    let fullTimer: ReturnType<typeof setInterval> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (fullTimer) clearInterval(fullTimer);
      if (tickTimer) clearInterval(tickTimer);
      fullTimer = null;
      tickTimer = null;
    };
    const start = () => {
      stop();
      void fetchSnapshot();
      if (autoRefresh) {
        fullTimer = setInterval(() => void fetchSnapshot(), FULL_REFRESH_MS);
        tickTimer = setInterval(() => void tickSpot(), TICK_INTERVAL_MS);
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [fetchSnapshot, tickSpot, autoRefresh]);
}
