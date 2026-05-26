import { invoke } from "@tauri-apps/api/core";

export type Impact = "low" | "medium" | "high";

export type EconomicEvent = {
  id: string;
  country: string;
  impact: Impact;
  event: string;
  timeUtc: string;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
  unit: string;
};

export type NewsArticle = {
  id: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  imageUrl: string;
  publishedAt: string;
  category: string;
};

export async function fetchCalendar(
  fromDate: string,
  toDate: string,
): Promise<EconomicEvent[]> {
  return invoke<EconomicEvent[]>("news_fetch_calendar", {
    args: { fromDate, toDate },
  });
}

export async function fetchArticles(category: string): Promise<NewsArticle[]> {
  return invoke<NewsArticle[]>("news_fetch_articles", {
    args: { category },
  });
}

export async function saveApiKey(key: string): Promise<void> {
  return invoke<void>("news_save_api_key", { key });
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("news_has_api_key");
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("news_delete_api_key");
}
