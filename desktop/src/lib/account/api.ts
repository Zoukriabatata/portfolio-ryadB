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

/** Mirror of the Rust `Trade` shape exposed via `journal_trades_on_day`.
 *  We only keep the fields the Account dashboard needs (full surface
 *  area lives in `lib/journal/api.ts`). */
type JournalTrade = {
  id: string;
  symbol: string;
  side: string;
  pnl: number | null;
  entryTime: string;
  exitTime: string | null;
  externalSource?: string | null;
};

/** Pull today's CLOSED trades from the local journal SQLite. The
 *  journal is populated by the user's manual / scheduled "Sync from
 *  Rithmic" in the Journal module. If the user has never synced,
 *  this returns []. */
export async function fetchTodayTrades(): Promise<TodayTrade[]> {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const date = `${y}-${m}-${day}`;
  const rows = await invoke<JournalTrade[]>("journal_trades_on_day", {
    args: { date },
  });
  return rows
    .filter((t) => t.exitTime !== null && t.pnl !== null && Number.isFinite(t.pnl))
    .map((t) => ({
      symbol: t.symbol,
      side: t.side,
      pnl: t.pnl as number,
      exitTime: t.exitTime as string,
    }));
}
