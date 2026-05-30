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
  netDex: number;
  callOi: number;
  putOi: number;
};

export type TermStructurePoint = {
  expiration: string;
  daysToExpiry: number;
  atmIv: number;
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
  totalDex: number;
  totalVex: number;
  totalTex: number;
  totalCallOi: number;
  totalPutOi: number;
  putCallRatio: number | null;
  skew25Delta: number | null;
  atmIvFront: number | null;
  termStructure: TermStructurePoint[];
};

/** Open-ended : Alpaca accepts any US equity/ETF symbol with options.
 *  The full curated picker list lives in `src/lib/gex/symbols.ts`. */
export type GexSymbol = string;

export async function fetchGexSnapshot(symbol: GexSymbol): Promise<GexSnapshot> {
  return invoke<GexSnapshot>("gex_fetch_snapshot", { args: { symbol } });
}

/** Lightweight live tick — re-fetches just the spot and recomputes
 *  the snapshot from cached chains server-side. ~100ms vs ~5s for the
 *  full fetch. Backend falls back to a full fetch transparently if
 *  the chains cache has expired. */
export async function tickGexSpot(symbol: GexSymbol): Promise<GexSnapshot> {
  return invoke<GexSnapshot>("gex_tick_spot", { args: { symbol } });
}

export async function saveApiKey(keyId: string, secretKey: string): Promise<void> {
  return invoke<void>("gex_save_api_key", { args: { keyId, secretKey } });
}

export async function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("gex_has_api_key");
}

export async function deleteApiKey(): Promise<void> {
  return invoke<void>("gex_delete_api_key");
}
