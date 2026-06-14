import { invoke } from "@tauri-apps/api/core";
import type { GexSnapshot, GexSymbol } from "../gex/api";
import type { OptionTrade } from "../option_flow/api";

export async function saveDatabentoKey(key: string): Promise<void> {
  return invoke<void>("databento_save_api_key", { key });
}

export async function hasDatabentoKey(): Promise<boolean> {
  return invoke<boolean>("databento_has_api_key");
}

export async function deleteDatabentoKey(): Promise<void> {
  return invoke<void>("databento_delete_api_key");
}

export async function fetchDatabentoGex(symbol: GexSymbol): Promise<GexSnapshot> {
  return invoke<GexSnapshot>("databento_gex_fetch_snapshot", {
    args: { symbol, spotSymbol: symbol },
  });
}

export async function pollDatabentoFlow(
  symbol: string,
  sinceMs: number | null,
): Promise<OptionTrade[]> {
  return invoke<OptionTrade[]>("databento_flow_poll", {
    args: { symbol, sinceMs },
  });
}
