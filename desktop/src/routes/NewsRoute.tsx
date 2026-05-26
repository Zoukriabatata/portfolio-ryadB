import { useEffect, useState } from "react";
import { EconomicCalendar } from "../components/news/EconomicCalendar";
import { NewsFeed } from "../components/news/NewsFeed";
import { hasApiKey } from "../lib/news/api";
import { useFinnhubPolling } from "../lib/news/useFinnhubPolling";
import "../components/news/news.css";

export function NewsRoute() {
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void hasApiKey()
      .then((b) => setKeyConfigured(b))
      .catch(() => setKeyConfigured(false));
  }, []);

  // Polling only starts once the key is known to be configured. Avoids
  // hammering the backend with errors when the user hasn't set it yet.
  return keyConfigured ? <NewsWithPolling /> : <NewsRouteShell keyConfigured={keyConfigured} />;
}

function NewsWithPolling() {
  useFinnhubPolling();
  return <NewsRouteShell keyConfigured={true} />;
}

function NewsRouteShell({ keyConfigured }: { keyConfigured: boolean | null }) {
  return (
    <div className="news-route" style={{ position: "relative" }}>
      {keyConfigured === false && (
        <div className="news-api-key-banner">
          Configure ta clé Finnhub dans Settings broker pour activer la News.
        </div>
      )}
      <NewsFeed />
      <EconomicCalendar />
    </div>
  );
}
