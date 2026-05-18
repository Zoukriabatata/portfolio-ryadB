import { invoke } from "@tauri-apps/api/core";

export type Account = {
  id: string;
  fcm: string;
  ibId: string;
  systemName: string;
};

export type AccountStats = {
  accountId: string;
  balance: number;
  startOfDayBalance: number;
  dailyPnl: number;
  dailyLossLimit: number | null;
  trailingDrawdown: number | null;
  trailingDrawdownLimit: number | null;
  marginUsed: number | null;
};

export type PositionSide = "long" | "short" | "flat";

export type Position = {
  accountId: string;
  symbol: string;
  exchange: string;
  side: PositionSide;
  qty: number;
  avgPrice: number;
  marketPrice: number;
  unrealizedPnl: number;
  realizedPnlToday: number;
};

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "stop" | "market" | "stop_limit";

export type WorkingOrder = {
  accountId: string;
  orderId: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  orderType: OrderType;
  qty: number;
  filledQty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  status: string;
  placedAt: string;
};

export type FeedStatus = "connecting" | "connected" | "disconnected" | "error";

export async function listAccounts(): Promise<Account[]> {
  return invoke<Account[]>("account_list");
}

export async function startLive(account: {
  accountId: string;
  fcm: string;
  ibId: string;
}): Promise<void> {
  return invoke<void>("account_start_live", { args: account });
}

export async function stopLive(): Promise<void> {
  return invoke<void>("account_stop_live");
}

export type TodayTrade = {
  symbol: string;
  side: string; // "LONG" | "SHORT"
  pnl: number;
  exitTime: string;
};

export async function fetchTodayTrades(): Promise<TodayTrade[]> {
  return invoke<TodayTrade[]>("account_fetch_today_trades");
}
