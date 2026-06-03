"use client";

/**
 * One row in the Watchlist "index" (the list of non-featured
 * tickers under the featured cover).
 *
 * Editorial typography :
 *   • symbol  → Geist Sans uppercase tracked (kicker / catalog
 *               label)
 *   • price   → JetBrains Mono tabular-nums (data table feel)
 *   • change% → JetBrains Mono pill, signed, coloured lime / bear
 *   • mini sparkline → 80×24 SVG
 *
 * Click → calls `onClick` so the parent can promote this row to
 * featured. The row is keyboard-focusable + Enter-handled so it
 * works without a mouse.
 */

import { cn } from "@/lib/utils";

import type { WatchlistTick } from "@/hooks/dashboard/useWatchlistPrices";

import { WatchlistSparkline } from "./WatchlistSparkline";

export interface WatchlistRowProps {
  symbol: string;
  label: string;
  tick: WatchlistTick | undefined;
  sparkline: number[] | undefined;
  onClick: () => void;
}

function compactPrice(price: number | undefined): string {
  if (price === undefined || !Number.isFinite(price)) return "—";
  if (price >= 10_000)
    return price.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

export function WatchlistRow({
  label,
  tick,
  sparkline,
  onClick,
}: WatchlistRowProps) {
  const changePct = tick?.changePercent24h;
  const isUp = (changePct ?? 0) >= 0;
  const direction: "up" | "down" = isUp ? "up" : "down";
  const accent = isUp ? "var(--primary)" : "var(--bear)";

  const baseSymbol = label.split("/")[0];

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group w-full text-left",
        "grid grid-cols-[64px_1fr_72px_72px] items-center gap-3",
        "py-1.5 px-2 -mx-2 rounded-md",
        "transition-[background,transform] duration-150",
        "hover:bg-[color-mix(in_oklab,var(--surface-elevated)_70%,transparent)]",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]",
      )}
      aria-label={`Set ${label} as featured ticker`}
    >
      {/* Symbol kicker */}
      <span
        className={cn(
          "dash-text-xs font-semibold uppercase",
          "tracking-[0.12em]",
        )}
        style={{ color: "var(--text-secondary)" }}
      >
        {baseSymbol}
      </span>

      {/* Mini sparkline aligned baseline-right of the cell */}
      <div className="overflow-hidden">
        <WatchlistSparkline
          data={sparkline ?? []}
          direction={direction}
          width={96}
          height={22}
        />
      </div>

      {/* Price (tabular mono) */}
      <span
        className={cn(
          "font-[var(--font-jetbrains-mono)]",
          "dash-text-xs tabular-nums text-right",
        )}
        style={{ color: "var(--text-primary)" }}
      >
        {compactPrice(tick?.price)}
      </span>

      {/* Change pill */}
      <span
        className={cn(
          "font-[var(--font-jetbrains-mono)]",
          "dash-text-xs tabular-nums text-right",
          "transition-colors",
        )}
        style={{ color: accent }}
      >
        {changePct === undefined || !Number.isFinite(changePct)
          ? "—"
          : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
      </span>
    </button>
  );
}
