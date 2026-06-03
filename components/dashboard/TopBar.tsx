"use client";

/**
 * Slim 56-px top bar that replaces the legacy "HeroBar" card. The old
 * hero packed greeting + clock + BTC/ETH chips into a heavy panel; the
 * BTC/ETH price duty now belongs to the future Watchlist widget, so
 * this strip keeps only the two things that nothing else owns:
 *   1. Personalised greeting + live clock (left)
 *   2. Market-status pill (right)
 *
 * Not a DashboardCard — it lives above the grid.
 */

import { useClock } from "@/hooks/dashboard";

interface TopBarProps {
  /** Optional first name for the greeting line. */
  userName?: string;
}

export function TopBar({ userName }: TopBarProps) {
  const { time, greeting } = useClock();

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 rounded-xl border"
      style={{
        height: 56,
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Left — greeting + clock */}
      <div className="flex items-baseline gap-3 min-w-0">
        <span
          className="dash-text-base font-semibold tracking-tight truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {greeting}
          {userName ? `, ${userName}` : ""}
        </span>
        <span
          className="dash-text-sm font-mono tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          {time}
        </span>
      </div>

      {/* Right — live market pill */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
        style={{
          background: "color-mix(in oklab, var(--bull) 10%, transparent)",
          border:
            "1px solid color-mix(in oklab, var(--bull) 22%, transparent)",
        }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
            style={{ background: "var(--bull)" }}
          />
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--bull)" }}
          />
        </span>
        <span
          className="dash-text-xs font-bold tracking-widest uppercase"
          style={{ color: "var(--bull)" }}
        >
          LIVE
        </span>
      </div>
    </div>
  );
}
