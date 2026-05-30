import { useEffect } from "react";
import { useOptionFlowStore } from "./useOptionFlowStore";

const POLL_INTERVAL_MS = 4_000;

/** Polls the backend every 4s while the document is visible. Pauses
 *  when the tab loses focus to avoid wasted Alpaca calls. */
export function useOptionFlowPolling() {
  const autoRefresh = useOptionFlowStore((s) => s.autoRefresh);
  const symbol = useOptionFlowStore((s) => s.symbol);
  const poll = useOptionFlowStore((s) => s.poll);

  useEffect(() => {
    // Fire one immediately when symbol/auto changes.
    void poll();
    if (!autoRefresh) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        await poll();
      }
      if (cancelled) return;
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [autoRefresh, symbol, poll]);
}
