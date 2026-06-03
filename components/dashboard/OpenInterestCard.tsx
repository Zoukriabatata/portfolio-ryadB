"use client";

/**
 * Open Interest — 4 symbols (BTC / ETH / SOL / BNB) with a horizontal
 * bar proportional to current OI and a 30-min delta percent on the
 * right. Compact variant so it fits the bento side column.
 *
 * Bar colour: solid `--text-secondary` so the colour budget stays for
 * the delta (bull / bear). No per-symbol brand colours.
 */

import { BarChart3 } from "lucide-react";

import { OI_SYMBOLS, DISPLAY_NAMES } from "@/hooks/dashboard";

import { DashboardCard } from "./DashboardCard";

interface OpenInterestCardProps {
  oi: Record<string, { current: number; prev: number }>;
  className?: string;
}

function fmtOI(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

export function OpenInterestCard({ oi, className }: OpenInterestCardProps) {
  const items = OI_SYMBOLS.map((sym) => {
    const data = oi[sym];
    const change =
      data && data.prev > 0
        ? ((data.current - data.prev) / data.prev) * 100
        : 0;
    return {
      symbol: sym,
      name: DISPLAY_NAMES[sym] ?? sym.replace("USDT", ""),
      current: data?.current ?? 0,
      change,
    };
  });

  const hasData = items.some((i) => i.current > 0);
  const maxOI = Math.max(...items.map((i) => i.current), 1);

  return (
    <DashboardCard
      variant="compact"
      title="Open Interest"
      icon={<BarChart3 size={14} />}
      loading={!hasData}
      className={className}
    >
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const barPct = maxOI > 0 ? (item.current / maxOI) * 100 : 0;
          const deltaColor =
            item.change >= 0 ? "var(--bull)" : "var(--bear)";
          return (
            <li key={item.symbol} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="dash-text-xs font-semibold w-10"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.name}
                </span>
                <span
                  className="dash-text-xs font-mono tabular-nums flex-1 text-right"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.current > 0 ? fmtOI(item.current) : "—"}
                </span>
                {item.current > 0 && (
                  <span
                    className="dash-text-xs font-mono font-semibold tabular-nums w-14 text-right"
                    style={{ color: deltaColor }}
                  >
                    {item.change >= 0 ? "+" : ""}
                    {item.change.toFixed(2)}%
                  </span>
                )}
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${barPct}%`,
                    background: "var(--text-secondary)",
                    opacity: 0.6,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
