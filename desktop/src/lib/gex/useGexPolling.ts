import { useEffect } from "react";
import { useGexStore } from "./useGexStore";

const REFRESH_INTERVAL_MS = 15 * 60_000; // 15 min — matches backend cache TTL

/** Mount once in GexRoute. Triggers an initial fetch then polls every
 *  15 min while the tab is visible and auto-refresh is on. Pauses on
 *  visibility hidden, resumes (with an immediate fetch) on return. */
export function useGexPolling() {
  const fetchSnapshot = useGexStore((s) => s.fetchSnapshot);
  const autoRefresh = useGexStore((s) => s.autoRefresh);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      void fetchSnapshot();
      if (autoRefresh) {
        timer = setInterval(() => void fetchSnapshot(), REFRESH_INTERVAL_MS);
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
  }, [fetchSnapshot, autoRefresh]);
}
