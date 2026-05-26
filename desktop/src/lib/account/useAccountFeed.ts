import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  fetchTodayTrades,
  listAccounts, startLive, stopLive,
  type AccountStats, type FeedStatus, type Position, type WorkingOrder,
} from "./api";
import { useAccountStore } from "./useAccountStore";

/** One-instance hook. Mount in AccountRoute only. Discovers accounts,
 *  auto-selects the first, and starts the live feed. Subscribes to all
 *  Tauri events and pipes them to the store. Cleans everything up on
 *  unmount. */
export function useAccountFeed() {
  const setAccounts = useAccountStore((s) => s.setAccounts);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);
  const setStats = useAccountStore((s) => s.setStats);
  const upsertPosition = useAccountStore((s) => s.upsertPosition);
  const setOrders = useAccountStore((s) => s.setOrders);
  const setFeedStatus = useAccountStore((s) => s.setFeedStatus);
  const setError = useAccountStore((s) => s.setError);
  const resetFeedData = useAccountStore((s) => s.resetFeedData);
  const seedDayStats = useAccountStore((s) => s.seedDayStats);
  const pushEquityPoint = useAccountStore((s) => s.pushEquityPoint);

  useEffect(() => {
    let cancelled = false;
    let unlistenStats: (() => void) | null = null;
    let unlistenPos:   (() => void) | null = null;
    let unlistenOrders:(() => void) | null = null;
    let unlistenStatus:(() => void) | null = null;
    let equityTimer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      try {
        const accounts = await listAccounts();
        if (cancelled) return;
        setAccounts(accounts);
        if (accounts.length === 0) {
          setError("No accounts found on this login.");
          return;
        }
        const first = accounts[0];
        setActiveAccountId(first.id);
        resetFeedData();

        // Subscribe to events BEFORE starting the live feed so we don't
        // miss the first burst of snapshot frames.
        unlistenStats = await listen<AccountStats>(
          "account-stats-update",
          (e) => setStats(e.payload),
        );
        unlistenPos = await listen<Position>(
          "account-position-update",
          (e) => upsertPosition(e.payload),
        );
        unlistenOrders = await listen<WorkingOrder[]>(
          "account-orders-update",
          (e) => setOrders(e.payload),
        );
        unlistenStatus = await listen<FeedStatus>(
          "account-feed-status",
          (e) => setFeedStatus(e.payload),
        );

        // 1. Seed today's closed-trade stats BEFORE startLive — Apex
        //    only allows one concurrent OrderPlant session, so we pull
        //    history first (transient socket) and only then open the
        //    long-lived subscribe socket. Doing this after startLive
        //    silently fails because Rithmic refuses the 2nd login.
        try {
          const today = await fetchTodayTrades();
          if (cancelled) return;
          console.info(`account: fetched ${today.length} today trades`, today);
          seedDayStats(today.map((t) => t.pnl));
        } catch (e) {
          console.warn("account: fetchTodayTrades failed:", e);
        }

        // 2. Now open the live feed (PnL + Order subscribe).
        await startLive({ accountId: first.id, fcm: first.fcm, ibId: first.ibId });

        // 3. Periodic equity sampler — drives the chart even when
        //    Rithmic isn't pushing PnL updates (no positions open).
        equityTimer = setInterval(() => pushEquityPoint(), 30_000);
      } catch (e) {
        setError(String(e));
        setFeedStatus("error");
      }
    };
    void run();

    return () => {
      cancelled = true;
      unlistenStats?.();
      unlistenPos?.();
      unlistenOrders?.();
      unlistenStatus?.();
      if (equityTimer) clearInterval(equityTimer);
      void stopLive().catch(() => {});
    };
  }, [
    setAccounts, setActiveAccountId, setStats, upsertPosition,
    setOrders, setFeedStatus, setError, resetFeedData, seedDayStats,
    pushEquityPoint,
  ]);
}
