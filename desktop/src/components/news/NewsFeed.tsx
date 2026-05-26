import { useNewsStore } from "../../lib/news/useNewsStore";
import { NewsArticleCard } from "./NewsArticleCard";
import "./news.css";

export function NewsFeed() {
  const articles = useNewsStore((s) => s.articles);
  const loading = useNewsStore((s) => s.articlesLoading);
  const error = useNewsStore((s) => s.articlesError);
  const refresh = useNewsStore((s) => s.refreshArticles);

  return (
    <div className="news-feed">
      <div className="news-feed-header">
        <span>Market News</span>
        <button
          type="button"
          className="news-feed-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error && <div className="news-feed-error">{error}</div>}
      {!error && articles.length === 0 && !loading && (
        <div className="news-feed-empty">No articles yet.</div>
      )}
      {articles.map((a) => (
        <NewsArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}
