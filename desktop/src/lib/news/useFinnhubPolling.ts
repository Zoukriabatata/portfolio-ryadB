import { useEffect } from "react";
import { useNewsStore } from "./useNewsStore";

const ARTICLES_INTERVAL_MS = 60_000;
const EVENTS_INTERVAL_MS = 5 * 60_000;

/** One-instance hook : mount in NewsRoute only. Kicks off an
 *  immediate fetch, then polls articles every 60s and events every
 *  5min. Pauses both intervals while the document is hidden, resumes
 *  on focus with a fresh immediate fetch (so the user sees fresh
 *  data on tab return). */
export function useFinnhubPolling() {
  const refreshArticles = useNewsStore((s) => s.refreshArticles);
  const refreshEvents = useNewsStore((s) => s.refreshEvents);

  useEffect(() => {
    let articlesTimer: ReturnType<typeof setInterval> | null = null;
    let eventsTimer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      void refreshArticles();
      void refreshEvents();
      articlesTimer = setInterval(() => void refreshArticles(), ARTICLES_INTERVAL_MS);
      eventsTimer = setInterval(() => void refreshEvents(), EVENTS_INTERVAL_MS);
    };
    const stop = () => {
      if (articlesTimer) clearInterval(articlesTimer);
      if (eventsTimer) clearInterval(eventsTimer);
      articlesTimer = null;
      eventsTimer = null;
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, [refreshArticles, refreshEvents]);
}
