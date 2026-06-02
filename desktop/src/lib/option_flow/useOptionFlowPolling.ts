import { useEffect } from "react";
import { useOptionFlowStore } from "./useOptionFlowStore";

const POLL_INTERVAL_MS = 4_000;

/** Polls the backend every 4s while auto-refresh is enabled. Runs
 *  unconditionally — including when the app window is hidden — so
 *  the feed stays current while the user is alt-tabbed away.
 *  The Alpaca free tier is generous enough on rate limits for this
 *  ~15 RPM steady cadence to be safe. */
export function useOptionFlowPolling() {
  const autoRefresh = useOptionFlowStore((s) => s.autoRefresh);
  const symbol = useOptionFlowStore((s) => s.symbol);
  const poll = useOptionFlowStore((s) => s.poll);

  useEffect(() => {
    void poll();
    if (!autoRefresh) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      await poll();
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
