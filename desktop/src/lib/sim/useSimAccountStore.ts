import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computePnl, getContractSpec, type ContractSpec } from "./contractSpecs";

export type Side = "long" | "short";

export type SimPosition = {
  symbol: string;
  side: Side;
  qty: number;
  entryPrice: number;
  /** Optional bracket levels. Hit by `tickPrice` triggering flatten. */
  stopLoss: number | null;
  takeProfit: number | null;
  openedAtMs: number;
};

export type SimTrade = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  reason: "flatten" | "stop" | "target" | "reverse";
  openedAtMs: number;
  closedAtMs: number;
};

/** Pending order awaiting a price trigger. Convention :
 *   buy_limit  → fills when price ≤ triggerPrice (buy below mkt)
 *   sell_limit → fills when price ≥ triggerPrice (sell above mkt)
 *   buy_stop   → fills when price ≥ triggerPrice (breakout up)
 *   sell_stop  → fills when price ≤ triggerPrice (breakdown)
 *  On fill the order is removed from the queue and a market order is
 *  triggered at the trigger price (idealized fill, no slippage). */
export type WorkingOrderType =
  | "buy_limit"
  | "sell_limit"
  | "buy_stop"
  | "sell_stop";

export type WorkingOrder = {
  id: string;
  symbol: string;
  type: WorkingOrderType;
  qty: number;
  triggerPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  createdAtMs: number;
};

type StoreState = {
  // Capital
  startingCapital: number;
  /** Realized + booked balance. Unrealized is computed on the fly. */
  balance: number;

  // Live state
  position: SimPosition | null;
  history: SimTrade[];
  /** Pending Limit / Stop orders awaiting their trigger price. */
  workingOrders: WorkingOrder[];

  // Live price tracking — fed by useSimTicker.
  livePrices: Record<string, number>; // symbol → last
  /** Last symbol the ticker saw, used as a hint for the panel. */
  lastSymbol: string | null;

  /** Last order error, surfaced as a toast by the panel. Cleared after
   *  ~3s by the panel (UI concern, store stays passive). */
  lastError: { message: string; ts: number } | null;
  /** Last successful order, used to flash the panel with a confirmation
   *  animation when an order fills. */
  /** kind  = open  → "Order filled" voice
   *  kind  = close + reason "stop" → "Stop filled" voice
   *  kind  = close + any other reason → "Order filled" voice (the
   *          generic confirmation also covers targets and manual flats) */
  lastFill: {
    kind: "open" | "close";
    side: Side;
    reason?: SimTrade["reason"];
    ts: number;
  } | null;

  // Actions
  openMarket: (args: {
    symbol: string;
    side: Side;
    qty: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => void;
  clearError: () => void;
  flatten: (reason?: SimTrade["reason"]) => void;
  cancelBrackets: () => void;
  setBrackets: (sl: number | null, tp: number | null) => void;
  placeWorkingOrder: (args: {
    symbol: string;
    type: WorkingOrderType;
    qty: number;
    triggerPrice: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }) => void;
  cancelWorkingOrder: (id: string) => void;
  modifyWorkingOrder: (
    id: string,
    patch: Partial<Pick<WorkingOrder, "triggerPrice" | "stopLoss" | "takeProfit" | "qty">>,
  ) => void;
  tickPrice: (symbol: string, price: number) => void;
  resetAccount: (newCapital: number) => void;
  /** Wipe everything but keep the configured starting capital. */
  resetHistory: () => void;

  /** Voice feedback toggle — when on, useSimVoice speaks fills/errors. */
  voiceEnabled: boolean;
  toggleVoice: () => void;
};

const DEFAULT_CAPITAL = 50_000;
const HISTORY_CAP = 500;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function closePositionAt(
  pos: SimPosition,
  exit: number,
  reason: SimTrade["reason"],
  spec: ContractSpec,
): { trade: SimTrade; pnl: number } {
  const pnl = computePnl(spec, pos.side, pos.entryPrice, exit, pos.qty);
  const trade: SimTrade = {
    id: uid(),
    symbol: pos.symbol,
    side: pos.side,
    qty: pos.qty,
    entryPrice: pos.entryPrice,
    exitPrice: exit,
    pnl,
    reason,
    openedAtMs: pos.openedAtMs,
    closedAtMs: Date.now(),
  };
  return { trade, pnl };
}

export const useSimAccountStore = create<StoreState>()(
  persist(
    (set, get) => ({
      startingCapital: DEFAULT_CAPITAL,
      balance: DEFAULT_CAPITAL,
      position: null,
      history: [],
      workingOrders: [],
      livePrices: {},
      lastSymbol: null,
      lastError: null,
      lastFill: null,

      clearError: () => set({ lastError: null }),

      placeWorkingOrder: ({
        symbol,
        type,
        qty,
        triggerPrice,
        stopLoss = null,
        takeProfit = null,
      }) => {
        if (qty <= 0) {
          set({ lastError: { message: "Qty must be ≥ 1", ts: Date.now() } });
          return;
        }
        if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) {
          set({
            lastError: { message: "Invalid trigger price", ts: Date.now() },
          });
          return;
        }
        const last = get().livePrices[symbol];
        if (!Number.isFinite(last) || last === undefined) {
          set({
            lastError: {
              message: "Order rejected — no live tick yet",
              ts: Date.now(),
            },
          });
          return;
        }
        // Validate direction vs current market — a buy_limit ABOVE mkt
        // would fill instantly (it's really a market order then).
        const isAbove = triggerPrice > last;
        const isBelow = triggerPrice < last;
        let okSide = true;
        if (type === "buy_limit" && !isBelow) okSide = false;
        if (type === "sell_limit" && !isAbove) okSide = false;
        if (type === "buy_stop" && !isAbove) okSide = false;
        if (type === "sell_stop" && !isBelow) okSide = false;
        if (!okSide) {
          set({
            lastError: {
              message: `Invalid ${type.replace("_", " ")} price vs market (${last.toFixed(2)})`,
              ts: Date.now(),
            },
          });
          return;
        }

        const order: WorkingOrder = {
          id: uid(),
          symbol,
          type,
          qty,
          triggerPrice,
          stopLoss,
          takeProfit,
          createdAtMs: Date.now(),
        };
        set({
          workingOrders: [...get().workingOrders, order],
          lastError: null,
        });
      },

      cancelWorkingOrder: (id) =>
        set({ workingOrders: get().workingOrders.filter((o) => o.id !== id) }),

      modifyWorkingOrder: (id, patch) =>
        set({
          workingOrders: get().workingOrders.map((o) =>
            o.id === id ? { ...o, ...patch } : o,
          ),
        }),

      openMarket: ({ symbol, side, qty, stopLoss = null, takeProfit = null }) => {
        if (qty <= 0) {
          set({
            lastError: { message: "Qty must be ≥ 1", ts: Date.now() },
          });
          return;
        }
        const price = get().livePrices[symbol];
        if (!Number.isFinite(price) || price === undefined) {
          set({
            lastError: {
              message: "Order rejected — no live tick yet",
              ts: Date.now(),
            },
          });
          return;
        }
        const spec = getContractSpec(symbol);
        const cur = get().position;

        // Case A : no existing position → open fresh.
        if (!cur) {
          set({
            position: {
              symbol,
              side,
              qty,
              entryPrice: price,
              stopLoss,
              takeProfit,
              openedAtMs: Date.now(),
            },
            lastFill: { kind: "open", side, ts: Date.now() },
            lastError: null,
          });
          return;
        }

        // Case B : existing position on a different symbol → reject for
        // simplicity (single-symbol-at-a-time sim).
        if (cur.symbol !== symbol) {
          set({
            lastError: {
              message: `Already in ${cur.symbol} — flatten first to switch symbol`,
              ts: Date.now(),
            },
          });
          return;
        }

        // Case C : same direction → pyramid (weighted avg entry).
        if (cur.side === side) {
          const newQty = cur.qty + qty;
          const newEntry = (cur.entryPrice * cur.qty + price * qty) / newQty;
          set({
            position: {
              ...cur,
              qty: newQty,
              entryPrice: newEntry,
              stopLoss: stopLoss ?? cur.stopLoss,
              takeProfit: takeProfit ?? cur.takeProfit,
            },
            lastFill: { kind: "open", side, ts: Date.now() },
            lastError: null,
          });
          return;
        }

        // Case D : opposite direction → close current then optionally
        // open new for the remainder.
        const closingQty = Math.min(cur.qty, qty);
        const closedPos: SimPosition = { ...cur, qty: closingQty };
        const { trade, pnl } = closePositionAt(
          closedPos,
          price,
          "reverse",
          spec,
        );
        const remainder = qty - closingQty;
        const remainingExisting = cur.qty - closingQty;

        const newHistory = [trade, ...get().history].slice(0, HISTORY_CAP);
        const newBalance = get().balance + pnl;

        if (remainingExisting > 0) {
          // User's incoming order was partial — keep the rest of cur.
          set({
            position: { ...cur, qty: remainingExisting },
            balance: newBalance,
            history: newHistory,
            lastFill: { kind: "close", side: cur.side, reason: "reverse", ts: Date.now() },
            lastError: null,
          });
          return;
        }
        if (remainder > 0) {
          // User flipped : new position in opposite direction.
          set({
            position: {
              symbol,
              side,
              qty: remainder,
              entryPrice: price,
              stopLoss,
              takeProfit,
              openedAtMs: Date.now(),
            },
            balance: newBalance,
            history: newHistory,
            lastFill: { kind: "open", side, ts: Date.now() },
            lastError: null,
          });
          return;
        }
        // Exact close → flat.
        set({
          position: null,
          balance: newBalance,
          history: newHistory,
          lastFill: { kind: "close", side: cur.side, reason: "reverse", ts: Date.now() },
          lastError: null,
        });
      },

      flatten: (reason = "flatten") => {
        const cur = get().position;
        if (!cur) {
          set({
            lastError: { message: "No open position to flatten", ts: Date.now() },
          });
          return;
        }
        const price = get().livePrices[cur.symbol];
        if (!Number.isFinite(price) || price === undefined) {
          set({
            lastError: {
              message: "Cannot flatten — no live tick",
              ts: Date.now(),
            },
          });
          return;
        }
        const spec = getContractSpec(cur.symbol);
        const { trade, pnl } = closePositionAt(cur, price, reason, spec);
        set({
          position: null,
          balance: get().balance + pnl,
          history: [trade, ...get().history].slice(0, HISTORY_CAP),
          lastFill: { kind: "close", side: cur.side, reason, ts: Date.now() },
          lastError: null,
        });
      },

      cancelBrackets: () => {
        const cur = get().position;
        if (!cur) return;
        set({ position: { ...cur, stopLoss: null, takeProfit: null } });
      },

      setBrackets: (sl, tp) => {
        const cur = get().position;
        if (!cur) return;
        set({ position: { ...cur, stopLoss: sl, takeProfit: tp } });
      },

      tickPrice: (symbol, price) => {
        if (!Number.isFinite(price)) return;
        const cur = get().livePrices[symbol];
        if (cur === price) {
          // Symbol may still need a "last seen" refresh for UI hints.
          if (get().lastSymbol !== symbol) set({ lastSymbol: symbol });
          return;
        }
        set({
          livePrices: { ...get().livePrices, [symbol]: price },
          lastSymbol: symbol,
        });

        // Working-order trigger pass — convert any matching pending
        // order to a market fill at the trigger price. We drain matches
        // for this tick in a single set, then fall through to the
        // SL/TP / pos-trigger checks below.
        const pending = get().workingOrders.filter((o) => o.symbol === symbol);
        const triggered: WorkingOrder[] = [];
        for (const o of pending) {
          let hit = false;
          if (o.type === "buy_limit" && price <= o.triggerPrice) hit = true;
          else if (o.type === "sell_limit" && price >= o.triggerPrice) hit = true;
          else if (o.type === "buy_stop" && price >= o.triggerPrice) hit = true;
          else if (o.type === "sell_stop" && price <= o.triggerPrice) hit = true;
          if (hit) triggered.push(o);
        }
        if (triggered.length > 0) {
          // Drop triggered orders from the queue first so re-entrant
          // calls (e.g. openMarket internally updating state) don't
          // re-process them.
          set({
            workingOrders: get().workingOrders.filter(
              (o) => !triggered.some((t) => t.id === o.id),
            ),
          });
          // Idealized fill : the triggered order becomes a market
          // order at the trigger price. We momentarily inject the
          // trigger price into livePrices so openMarket reads it.
          const before = get().livePrices[symbol];
          for (const o of triggered) {
            set({
              livePrices: { ...get().livePrices, [symbol]: o.triggerPrice },
            });
            const side: Side =
              o.type === "buy_limit" || o.type === "buy_stop" ? "long" : "short";
            get().openMarket({
              symbol: o.symbol,
              side,
              qty: o.qty,
              stopLoss: o.stopLoss,
              takeProfit: o.takeProfit,
            });
          }
          // Restore the actual market price so subsequent SL/TP
          // checks below see the real tick.
          set({ livePrices: { ...get().livePrices, [symbol]: before } });
        }

        // Check SL / TP triggers on the open position if this is its symbol.
        const pos = get().position;
        if (!pos || pos.symbol !== symbol) return;
        const sl = pos.stopLoss;
        const tp = pos.takeProfit;
        const triggerHitLong =
          (sl !== null && price <= sl) || (tp !== null && price >= tp);
        const triggerHitShort =
          (sl !== null && price >= sl) || (tp !== null && price <= tp);
        if (
          (pos.side === "long" && triggerHitLong) ||
          (pos.side === "short" && triggerHitShort)
        ) {
          // Decide reason — favor TP when both technically hit on the
          // same tick (target wins, lucky path).
          let reason: SimTrade["reason"] = "flatten";
          if (
            pos.side === "long" &&
            tp !== null &&
            price >= tp
          ) {
            reason = "target";
          } else if (
            pos.side === "short" &&
            tp !== null &&
            price <= tp
          ) {
            reason = "target";
          } else if (sl !== null) {
            reason = "stop";
          }
          // Fill at the trigger price (idealized — real fills slip).
          const fillPrice =
            reason === "stop" ? sl ?? price : reason === "target" ? tp ?? price : price;
          const spec = getContractSpec(pos.symbol);
          const { trade, pnl } = closePositionAt(
            pos,
            fillPrice,
            reason,
            spec,
          );
          set({
            position: null,
            balance: get().balance + pnl,
            history: [trade, ...get().history].slice(0, HISTORY_CAP),
            // Surface the auto-close so useSimVoice can play the
            // matching clip (stop_filled.mp3 on SL hit).
            lastFill: {
              kind: "close",
              side: pos.side,
              reason,
              ts: Date.now(),
            },
          });
        }
      },

      resetAccount: (newCapital) => {
        if (!Number.isFinite(newCapital) || newCapital <= 0) return;
        set({
          startingCapital: newCapital,
          balance: newCapital,
          position: null,
          history: [],
        });
      },

      resetHistory: () =>
        set({
          balance: get().startingCapital,
          position: null,
          history: [],
        }),

      voiceEnabled: true,
      toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
    }),
    {
      name: "orderflow:sim_account:v1",
      partialize: (s) => ({
        startingCapital: s.startingCapital,
        balance: s.balance,
        position: s.position,
        history: s.history,
        workingOrders: s.workingOrders,
        voiceEnabled: s.voiceEnabled,
      }),
    },
  ),
);
