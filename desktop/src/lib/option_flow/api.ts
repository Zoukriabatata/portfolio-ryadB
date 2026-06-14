import { invoke } from "@tauri-apps/api/core";

export type TradeSide = "buy" | "sell" | "mid" | "unknown";
export type ContractType = "call" | "put";

export type OptionTrade = {
  symbol: string;
  underlying: string;
  expiration: string; // ISO YYYY-MM-DD
  strike: number;
  contractType: ContractType;
  timestamp: string; // RFC3339 from Alpaca
  timestampMs: number;
  price: number;
  size: number;
  premium: number; // price × size × 100
  exchange: string;
  side: TradeSide;
  // Greeks snapshot from the active chain, null for deep OTM/ITM legs
  // where Alpaca omits them or for trades on a contract outside the
  // backend's strike window.
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  iv?: number | null; // 0..1, e.g. 0.284 = 28.4%
  openInterest?: number | null; // standing OI of the contract (chain snapshot)
};

export async function pollOptionFlow(
  symbol: string,
  sinceMs: number | null,
): Promise<OptionTrade[]> {
  return invoke<OptionTrade[]>("option_flow_poll", {
    args: { symbol, sinceMs },
  });
}
