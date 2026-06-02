import { useEffect } from "react";
import { useNewsStore } from "./useNewsStore";

const ARTICLES_INTERVAL_MS = 60_000;
const EVENTS_INTERVAL_MS = 5 * 60_000;

/** One-instance hook : mount in NewsRoute only. Kicks off an
 *  immediate fetch, then polls articles every 60s and events every
 *  5min. Runs continuously — including when the document is hidden
 *  or the app is alt-tabbed away — so the news feed stays current
 *  in the background. Finnhub's rate limits comfortably accommodate
 *  this steady cadence. */
export function useFinnhubPolling() {
  const refreshArticles = useNewsStore((s) => s.refreshArticles);
  const refreshEvents = useNewsStore((s) => s.refreshEvents);

  useEffect(() => {
    void refreshArticles();
    void refreshEvents();
    const articlesTimer = setInterval(
      () => void refreshArticles(),
      ARTICLES_INTERVAL_MS,
    );
    const eventsTimer = setInterval(
      () => void refreshEvents(),
      EVENTS_INTERVAL_MS,
    );
    return () => {
      clearInterval(articlesTimer);
      clearInterval(eventsTimer);
    };
  }, [refreshArticles, refreshEvents]);
}
