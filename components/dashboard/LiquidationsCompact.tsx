"use client";

/**
 * Liquidations — last 6 events ≥ $100K. The legacy widget showed
 * everything ≥ $10K, which buried the meaningful flow under noise on
 * normal-volatility days. $100K cutoff matches the threshold most
 * trader dashboards (Coinglass, Hyblock) use for "actionable" liqs.
 *
 * Editorial Terminal pass :
 *   • Symbol → JetBrains Mono badge (border `var(--border)`, padding
 *     compact) so the row reads as a tape entry, not a label.
 *   • Side pill → LONG (forced sell = bearish) coloured `var(--bear)`;
 *     SHORT (forced buy = bullish) coloured `var(--primary)`.
 *   • $value → JetBrains Mono tabular-nums.
 *   • Time ago → JetBrains Mono italic, muted.
 *   • Card opts into `live` border (it streams forced-liq events).
 */

import { Flame } from "lucide-react";

import { DISPLAY_NAMES, type LiquidationEvent } from "@/hooks/dashboard";
import { cn } from "@/lib/utils";

import { DashboardCard } from "./DashboardCard";

interface LiquidationsCompactProps {
  liquidations: LiquidationEvent[];
  className?: string;
}

const MIN_VALUE = 100_000;

function fmtAge(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return `${Math.floor(d / 1_000)}s`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  return `${Math.floor(d / 3_600_000)}h`;
}

function fmtUSD(v: number): string {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}

export function LiquidationsCompact({
  liquidations,
  className,
}: LiquidationsCompactProps) {
  const filtered = liquidations
    .filter((l) => l.valueUSD >= MIN_VALUE)
    .slice(0, 6);

  return (
    <DashboardCard
      variant="compact"
      title="Liquidations"
      icon={<Flame size={14} />}
      action={
        <span
          className="dash-text-xs font-[var(--font-jetbrains-mono)] tabular-nums"
          style={{ color: "var(--text-muted)" }}
        >
          ≥ $100K
        </span>
      }
      loading={filtered.length === 0}
      live
      className={className}
    >
      <ul className="flex flex-col">
        {filtered.map((liq) => {
          const isLong = liq.side === "LONG";
          // LONG liquidation = forced sell = bear pressure;
          // SHORT liquidation = forced buy = bull pressure.
          const sideColor = isLong ? "var(--bear)" : "var(--primary)";
          const name =
            DISPLAY_NAMES[liq.symbol] ?? liq.symbol.replace("USDT", "");
          return (
            <li
              key={liq.id}
              className={cn(
                "flex items-center gap-2 py-1 transition-colors duration-150",
                "hover:bg-[color-mix(in_oklab,var(--surface-elevated)_55%,transparent)]",
              )}
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              {/* Symbol mono badge */}
              <span
                className="dash-text-xs font-[var(--font-jetbrains-mono)] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-elevated)",
                }}
              >
                {name}
              </span>
              {/* Side pill */}
              <span
                className="dash-text-xs font-semibold px-1.5 py-0.5 rounded uppercase tracking-[0.12em]"
                style={{
                  background:
                    "color-mix(in oklab, " +
                    sideColor +
                    " 10%, transparent)",
                  color: sideColor,
                }}
              >
                {liq.side}
              </span>
              {/* $value */}
              <span
                className="dash-text-xs font-[var(--font-jetbrains-mono)] font-semibold tabular-nums flex-1 text-right"
                style={{ color: sideColor }}
              >
                {fmtUSD(liq.valueUSD)}
              </span>
              {/* Time-ago */}
              <span
                className="dash-text-xs font-[var(--font-jetbrains-mono)] italic tabular-nums w-8 text-right"
                style={{ color: "var(--text-muted)" }}
              >
                {fmtAge(liq.time)}
              </span>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
