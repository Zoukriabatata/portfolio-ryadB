"use client";

/**
 * Funding rates — top 6 by absolute rate. Compact variant, two-line
 * cells: symbol + rate on top, next-funding countdown underneath.
 *
 * Colour rule: positive = bull, negative = bear. The legacy strip
 * coloured positive funding *red* (because longs pay shorts when
 * funding is positive on Binance perps) — that's the trader-mental-
 * model convention, but it clashes with the new "green = good" pal-
 * ette guidance. We follow the brief: sign-based colouring, no orange.
 */

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

import { DISPLAY_NAMES, type FundingData } from "@/hooks/dashboard";

import { DashboardCard } from "./DashboardCard";

interface FundingRatesCompactProps {
  rates: FundingData[];
  className?: string;
}

function useCountdown(target: number | undefined): string {
  const [str, setStr] = useState("");
  useEffect(() => {
    if (!target) {
      setStr("");
      return;
    }
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setStr("00:00");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setStr(`${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [target]);
  return str;
}

export function FundingRatesCompact({
  rates,
  className,
}: FundingRatesCompactProps) {
  const sorted = [...rates]
    .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
    .slice(0, 6);

  const countdown = useCountdown(sorted[0]?.nextFundingTime);

  return (
    <DashboardCard
      variant="compact"
      title="Funding Rates"
      icon={<Zap size={14} />}
      action={
        countdown ? (
          <span
            className="dash-text-xs font-mono tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            next {countdown}
          </span>
        ) : null
      }
      loading={rates.length === 0}
      className={className}
    >
      <div
        className="grid grid-cols-3 gap-1.5 overflow-x-auto"
        role="list"
      >
        {sorted.map((r) => {
          const isPositive = r.fundingRate >= 0;
          const color = isPositive ? "var(--bull)" : "var(--bear)";
          const name =
            DISPLAY_NAMES[r.symbol] ?? r.symbol.replace("USDT", "");
          return (
            <div
              key={r.symbol}
              role="listitem"
              className="flex flex-col gap-0.5 px-2 py-1.5 rounded-md min-w-[80px]"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              <span
                className="dash-text-xs font-semibold tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                {name}
              </span>
              <span
                className="dash-text-sm font-mono font-semibold tabular-nums"
                style={{ color }}
              >
                {isPositive ? "+" : ""}
                {r.fundingRate.toFixed(4)}%
              </span>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}
