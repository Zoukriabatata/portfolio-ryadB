// Native Journal hook — replaces the website's `useJournal` (which
// hits `/api/journal`) with local SQLite via Tauri commands. Keeps the
// same return shape so the website's TradesTab component can be
// reused with minimal edits.

import { useCallback, useEffect, useRef, useState } from "react";
import { listTrades } from "./api";
import type { JournalEntry, TradeFilter, TradeStats } from "../../types/journal";

const EMPTY_STATS: TradeStats = {
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
  openCount: 0,
  totalPnl: 0,
  winRate: 0,
  avgWin: 0,
  avgLoss: 0,
  bestTrade: 0,
  worstTrade: 0,
};

export interface UseJournalOptions {
  pageSize?: number;
  /** Active filters (symbol, dates, setup, etc.). Pagination is
   *  managed by the hook itself via `page` / `setPage`. */
  filter?: Omit<TradeFilter, "limit" | "offset">;
}

export function useJournal({ pageSize = 25, filter = {} }: UseJournalOptions = {}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<TradeStats>(EMPTY_STATS);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable filter ref so the fetch effect doesn't re-fire on every
  // render that produces a structurally-equal filter.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const filterKey = JSON.stringify(filter);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = page * pageSize;
      const res = await listTrades({
        ...filterRef.current,
        limit: pageSize,
        offset,
      });
      setEntries(res.entries);
      setTotal(res.total);
      setStats(res.stats);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void refetch();
    // refetch when filter or page changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filterKey]);

  const pagination = {
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };

  return {
    entries,
    stats,
    pagination,
    loading,
    error,
    page,
    setPage,
    refetch,
  };
}
