import { useMemo } from "react";
import { ALL_TAGS, classifyArticle } from "../../lib/news/articleTags";
import { useNewsStore } from "../../lib/news/useNewsStore";
import { NewsArticleCard } from "./NewsArticleCard";
import { SymbolPresetPicker } from "./SymbolPresetPicker";
import "./news.css";

export function NewsFeed() {
  const articles = useNewsStore((s) => s.articles);
  const loading = useNewsStore((s) => s.articlesLoading);
  const error = useNewsStore((s) => s.articlesError);
  const refresh = useNewsStore((s) => s.refreshArticles);
  const tagFilters = useNewsStore((s) => s.filters.articleTags);
  const toggleTag = useNewsStore((s) => s.toggleArticleTag);
  const clearTags = useNewsStore((s) => s.clearTagFilters);

  // Tag each article once per articles-array change.
  const tagged = useMemo(
    () => articles.map((a) => ({ a, tags: classifyArticle(a.headline, a.summary) })),
    [articles],
  );

  const activeTags = useMemo(
    () => (Object.keys(tagFilters) as Array<keyof typeof tagFilters>).filter((t) => tagFilters[t]),
    [tagFilters],
  );

  const visible = useMemo(() => {
    if (activeTags.length === 0) return tagged.map((x) => x.a);
    return tagged
      .filter(({ tags }) => tags.some((t) => activeTags.includes(t)))
      .map((x) => x.a);
  }, [tagged, activeTags]);

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

      <div className="news-feed-presets">
        <SymbolPresetPicker />
        {activeTags.length > 0 && (
          <button
            type="button"
            className="news-feed-preset news-feed-preset-clear"
            onClick={() => clearTags()}
          >
            Clear tags
          </button>
        )}
      </div>

      <div className="news-feed-tags">
        {ALL_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`news-feed-tag ${tagFilters[tag] ? "news-feed-tag-active" : ""}`}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="news-feed-count">
        {visible.length} {visible.length === 1 ? "article" : "articles"}
        {activeTags.length > 0 && (
          <span className="news-feed-count-filtered">
            {" "}· filtered by {activeTags.join(", ")}
          </span>
        )}
      </div>

      {error && <div className="news-feed-error">{error}</div>}
      {!error && visible.length === 0 && !loading && (
        <div className="news-feed-empty">
          {activeTags.length > 0
            ? "No articles match the active tag filters."
            : "No articles yet."}
        </div>
      )}
      {visible.map((a) => (
        <NewsArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}
