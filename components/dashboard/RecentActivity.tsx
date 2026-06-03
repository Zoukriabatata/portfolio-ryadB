"use client";

/**
 * Recent chart sessions widget — "pick up where you left off."
 *
 * Reads `useRecentChartsStore` which is populated by
 * `useTrackChartVisit()` from each chart route's page.tsx.
 *
 * Layout intent :
 *   ┌──────────────────────────────────┐
 *   │ Recent Activity · ⏱              │
 *   │ ─────────────────────────────── │
 *   │ Footprint  MNQ      · 4 min     │ ← chart label + symbol + ago
 *   │ Live       BTCUSDT  · 22 min    │
 *   │ GEX        SPY      · 1h 12m    │
 *   │ ⋮                                │
 *   └──────────────────────────────────┘
 *
 * Each row is a `<Link>` so the browser handles prefetch + the back
 * stack naturally.
 */

import Link from "next/link";
import { History } from "lucide-react";
import { useMemo } from "react";

import {
  type RecentChartRoute,
  useRecentChartsStore,
} from "@/stores/useRecentChartsStore";

import { DashboardCard } from "./DashboardCard";
import { cn } from "@/lib/utils";

const VISIBLE_LIMIT = 5;

const ROUTE_LABEL: Record<RecentChartRoute, string> = {
  "/live": "Live",
  "/footprint": "Footprint",
  "/gex": "GEX",
  "/volatility": "Volatility",
  "/flow": "Options Flow",
};

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const mm = m % 60;
    return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function RecentActivity() {
  const visits = useRecentChartsStore((s) => s.visits);

  const top = useMemo(() => visits.slice(0, VISIBLE_LIMIT), [visits]);

  return (
    <DashboardCard
      title="Recent Activity"
      icon={<History size={14} />}
      className="h-full"
    >
      {top.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full py-6 gap-1 text-center">
          <span
            className="font-[var(--font-instrument-serif)] italic dash-text-base"
            style={{ color: "var(--text-secondary)" }}
          >
            No sessions yet
          </span>
          <span
            className="dash-text-xs"
            style={{ color: "var(--text-dimmed)" }}
          >
            Your last 5 charts will surface here.
          </span>
        </div>
      ) : (
        <ul className="flex flex-col">
          {top.map((visit, i) => (
            <li
              key={`${visit.route}-${visit.symbol}-${i}`}
              className={cn(
                i > 0 && "border-t border-[var(--border)]/40",
              )}
            >
              <Link
                href={visit.route}
                prefetch
                className={cn(
                  "group flex items-baseline gap-3 py-2 px-1 -mx-1 rounded-md",
                  "transition-colors duration-150",
                  "hover:bg-[color-mix(in_oklab,var(--surface-elevated)_70%,transparent)]",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]",
                )}
              >
                <span
                  className="dash-text-sm font-medium shrink-0"
                  style={{ color: "var(--text-primary)" }}
                >
                  {ROUTE_LABEL[visit.route] ?? visit.route}
                </span>
                <span
                  className={cn(
                    "dash-text-xs uppercase tracking-[0.14em]",
                    "font-[var(--font-jetbrains-mono)]",
                    "border border-[var(--border)] rounded px-1.5 py-px",
                    "shrink-0",
                  )}
                  style={{ color: "var(--text-secondary)" }}
                >
                  {visit.symbol}
                </span>
                <span
                  className={cn(
                    "dash-text-xs italic ml-auto shrink-0",
                    "font-[var(--font-jetbrains-mono)] not-italic",
                  )}
                  style={{ color: "var(--text-muted)" }}
                >
                  {timeAgo(visit.visitedAt)} ago
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
