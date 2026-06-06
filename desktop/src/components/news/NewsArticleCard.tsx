import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NewsArticle } from "../../lib/news/api";

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

export function NewsArticleCard({ article }: { article: NewsArticle }) {
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = !!article.imageUrl && !imgFailed;

  return (
    <div
      className="news-card"
      role="link"
      tabIndex={0}
      onClick={() => {
        const url = article.url;
        if (!url.startsWith('https://') && !url.startsWith('http://')) return;
        void openUrl(url);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const url = article.url;
          if (!url.startsWith('https://') && !url.startsWith('http://')) return;
          void openUrl(url);
        }
      }}
    >
      <div className="news-card-thumb-wrap">
        {hasImage ? (
          <img
            className="news-card-thumb"
            src={article.imageUrl}
            alt=""
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="news-card-thumb-placeholder">News</div>
        )}
      </div>
      <div className="news-card-body">
        <div className="news-card-headline">{article.headline}</div>
        <div className="news-card-meta">
          <span className="news-card-source">{article.source || "—"}</span>
          <span className="news-card-sep" aria-hidden />
          <span className="news-card-time">{timeAgo(article.publishedAt)} ago</span>
        </div>
      </div>
    </div>
  );
}
