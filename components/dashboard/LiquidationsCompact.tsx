"use client";

/**
 * Liquidations — last 6 events ≥ $100K. The legacy widget showed
 * everything ≥ $10K, which buried the meaningful flow under noise on
 * normal-volatility days. $100K cutoff matches the threshold most
 * trader dashboards (Coinglass, Hyblock) use for "actionable" liqs.
 *
 * Row: SYMBOL | LONG/SHORT pill | $value | time-ago. Whale emoji and
 * brand colours dropped — only the side pill and value carry colour.
 */

import { Flame } from "lucide-react";

import { DISPLAY_NAMES, type LiquidationEvent } from "@/hooks/dashboard";

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
          className="dash-text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ≥ $100K
        </span>
      }
      loading={filtered.length === 0}
      className={className}
    >
      <ul className="flex flex-col">
        {filtered.map((liq) => {
          const isLong = liq.side === "LONG";
          // A LONG liquidation = forced sell = bearish pressure.
          const sideColor = isLong ? "var(--bear)" : "var(--bull)";
          const name =
            DISPLAY_NAMES[liq.symbol] ?? liq.symbol.replace("USDT", "");
          return (
            <li
              key={liq.id}
              className="flex items-center gap-2 py-1"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <span
                className="dash-text-xs font-semibold w-12"
                style={{ color: "var(--text-primary)" }}
              >
                {name}
              </span>
              <span
                className="dash-text-xs font-bold px-1.5 py-0.5 rounded tabular-nums"
                style={{
                  background:
                    "color-mix(in oklab, " +
                    sideColor +
                    " 10%, transparent)",
                  color: sideColor,
                  letterSpacing: "0.05em",
                }}
              >
                {liq.side}
              </span>
              <span
                className="dash-text-xs font-mono font-semibold tabular-nums flex-1 text-right"
                style={{ color: sideColor }}
              >
                {fmtUSD(liq.valueUSD)}
              </span>
              <span
                className="dash-text-xs font-mono tabular-nums w-8 text-right"
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
