"use client";

/**
 * Featured ticker — the "cover story" of the Watchlist card.
 *
 * Layout intent (Editorial Terminal):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ BTC/USDT · 24H                               │ ← Geist Sans label
 *   │                                              │
 *   │ $68,432.10           ╭ sparkline ╮           │ ← Instrument Serif 48px
 *   │                      │ 24h close │           │   + draw-on SVG curve
 *   │                      ╰───────────╯           │
 *   │ +2.41 %                                      │ ← JetBrains Mono pill
 *   │ Vol $1.2B                                    │ ← Mono muted meta
 *   └──────────────────────────────────────────────┘
 *
 * Click the symbol header → swaps the featured ticker via the
 * parent's `onPickFeatured` callback. Pure controlled component;
 * the symbol persistence lives in WatchlistCard so refreshing the
 * page restores the same focus.
 */

import { cn } from "@/lib/utils";

import type { WatchlistTick } from "@/hooks/dashboard/useWatchlistPrices";

import { WatchlistSparkline } from "./WatchlistSparkline";

export interface WatchlistFeaturedProps {
  symbol: string;
  /** Display label, e.g. "BTC/USDT". */
  label: string;
  tick: WatchlistTick | undefined;
  sparkline: number[] | undefined;
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || !Number.isFinite(price)) return "—";
  if (price >= 10_000)
    return (
      "$" +
      price.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  if (price >= 1) return "$" + price.toFixed(3);
  if (price >= 0.01) return "$" + price.toFixed(4);
  return "$" + price.toFixed(6);
}

function formatVolume(volume: number | undefined): string {
  if (volume === undefined || !Number.isFinite(volume)) return "—";
  if (volume >= 1e9) return "$" + (volume / 1e9).toFixed(2) + "B";
  if (volume >= 1e6) return "$" + (volume / 1e6).toFixed(1) + "M";
  if (volume >= 1e3) return "$" + (volume / 1e3).toFixed(1) + "K";
  return "$" + volume.toFixed(0);
}

export function WatchlistFeatured({
  label,
  tick,
  sparkline,
}: WatchlistFeaturedProps) {
  const changePct = tick?.changePercent24h;
  const isUp = (changePct ?? 0) >= 0;
  const direction: "up" | "down" = isUp ? "up" : "down";
  const accentVar = isUp ? "var(--primary)" : "var(--bear)";

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Header row — symbol label + 24h badge. Letter-spaced label
          reads as a magazine kicker. */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "dash-text-xs font-medium uppercase",
            "tracking-[0.18em]",
          )}
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
        <span
          className="dash-text-xs uppercase tracking-[0.18em]"
          style={{ color: "var(--text-dimmed)" }}
        >
          24 H
        </span>
      </div>

      {/* Body — left: big serif price + change pill. right: sparkline. */}
      <div className="flex items-end justify-between gap-3 sm:gap-5">
        <div className="flex flex-col gap-1 min-w-0">
          {/* Live flash backdrop : sibling element that remounts each
              tick to restart the keyframe animation. Sits one stacking
              context below the price so it tints the area, not the
              glyphs themselves. */}
          <div className="relative inline-flex">
            {tick?.direction && (
              <span
                key={tick.lastUpdated}
                aria-hidden
                className={cn(
                  "absolute -inset-x-2 -inset-y-1 -z-[1] rounded-md pointer-events-none",
                  tick.direction === "up"
                    ? "watchlist-flash-up"
                    : "watchlist-flash-down",
                )}
              />
            )}
            <span
              className={cn(
                "font-[var(--font-jetbrains-mono)]",
                "leading-[0.95] tracking-tight font-medium",
                "text-[40px] sm:text-[48px]",
              )}
              style={{
                color: "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
              }}
            >
              {formatPrice(tick?.price)}
            </span>
          </div>
          <span
            className={cn(
              "font-[var(--font-jetbrains-mono)]",
              "dash-text-base font-medium tabular-nums",
              "transition-colors",
            )}
            style={{ color: accentVar }}
          >
            {changePct === undefined || !Number.isFinite(changePct)
              ? "—"
              : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)} %`}
          </span>
        </div>

        <div className="shrink-0">
          <WatchlistSparkline
            data={sparkline ?? []}
            direction={direction}
            width={180}
            height={64}
            showLastDot
          />
        </div>
      </div>

      {/* Footer meta — volume, separator dot, time scope. */}
      <div
        className={cn(
          "flex items-center gap-2 dash-text-xs",
          "font-[var(--font-jetbrains-mono)] tabular-nums",
        )}
        style={{ color: "var(--text-muted)" }}
      >
        <span>Vol {formatVolume(tick?.volume24h)}</span>
        <span aria-hidden style={{ color: "var(--text-dimmed)" }}>
          ·
        </span>
        <span>Binance · spot</span>
      </div>
    </div>
  );
}
