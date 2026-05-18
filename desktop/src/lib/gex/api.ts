import { invoke } from "@tauri-apps/api/core";

export type IvSide = "put" | "call";

export type IvPoint = {
  strike: number;
  iv: number;
  side: IvSide;
};

export type IvSmile = {
  expiration: string; // ISO date
  daysToExpiry: number;
  points: IvPoint[]; // sorted by strike asc
};

export type GexStrike = {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
};

export type GexSnapshot = {
  symbol: string;
  spot: number;
  computedAt: string; // ISO 8601 UTC
  expirationCount: number;
  strikes: GexStrike[]; // sorted ascending
  zeroGamma: number | null;
  callWall: number | null;
  putWall: number | null;
  totalGex: number;
  stale: boolean;
  ivSmiles: IvSmile[];
};

export type GexSymbol = "SPY" | "QQQ";

export async function fetchGexSnapshot(symbol: GexSymbol): Promise<GexSnapshot> {
  return invoke<GexSnapshot>("gex_fetch_snapshot", { args: { symbol } });
}

export async function saveApiKey(key: string): Promise<void> {
  return invoke<void>("gex_save_api_key", { key });
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("gex_has_api_key");
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("gex_delete_api_key");
}
