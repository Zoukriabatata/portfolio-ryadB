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
};

export async function pollOptionFlow(
  symbol: string,
  sinceMs: number | null,
): Promise<OptionTrade[]> {
  return invoke<OptionTrade[]>("option_flow_poll", {
    args: { symbol, sinceMs },
  });
}
