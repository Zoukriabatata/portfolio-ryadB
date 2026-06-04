"use client";

/**
 * MarketPulse — fusion of the legacy TopMovers leaderboard and the
 * MarketStatsCard. Why fuse? They were both 24-h Binance derivations
 * on the same ticker slice; surfacing them as siblings forced the user
 * to scan twice. Single widget with three tabs (Gainers / Losers /
 * Volume) and a consolidated stats footer collapses the redundancy.
 *
 * Editorial Terminal pass :
 *   • Symbols  → Geist Sans uppercase, kicker tracking
 *   • Prices / change% / volume → JetBrains Mono tabular-nums
 *   • Footer stats labels → uppercase Geist; numbers → mono
 *   • Palette restricted to lime (`--primary`) / red (`--bear`) /
 *     text-{primary,secondary,muted}. No brand hex, no amber/orange.
 *   • Card opts into the `live` border (it streams Binance tickers).
 */

import { useState, useMemo } from "react";
import { Activity } from "lucide-react";

import { DISPLAY_NAMES, type TickerData } from "@/hooks/dashboard";
import { cn } from "@/lib/utils";

import { DashboardCard } from "./DashboardCard";

type Tab = "gainers" | "losers" | "volume";

interface MarketPulseProps {
  tickers: TickerData[];
  className?: string;
}

function fmtPrice(price: number): string {
  if (price >= 10000)
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.001) return price.toFixed(5);
  return price.toFixed(8);
}

function fmtVolume(vol: number): string {
  if (vol >= 1e9) return "$" + (vol / 1e9).toFixed(2) + "B";
  if (vol >= 1e6) return "$" + (vol / 1e6).toFixed(1) + "M";
  if (vol >= 1e3) return "$" + (vol / 1e3).toFixed(1) + "K";
  return "$" + vol.toFixed(0);
}

const TABS: { id: Tab; label: string }[] = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "volume", label: "Volume" },
];

export function MarketPulse({ tickers, className }: MarketPulseProps) {
  const [tab, setTab] = useState<Tab>("gainers");

  const rows = useMemo(() => {
    const list = [...tickers];
    if (tab === "gainers") list.sort((a, b) => b.changePercent - a.changePercent);
    else if (tab === "losers")
      list.sort((a, b) => a.changePercent - b.changePercent);
    else list.sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);
    return list.slice(0, 8);
  }, [tickers, tab]);

  // Footer stats (constant across tab switches — they describe the
  // whole universe, not the current sort).
  const stats = useMemo(() => {
    if (tickers.length === 0) return null;
    const totalVol = tickers.reduce((s, t) => s + t.quoteVolume24h, 0);
    const btcVol =
      tickers.find((t) => t.symbol === "BTCUSDT")?.quoteVolume24h ?? 0;
    const btcDom = totalVol > 0 ? (btcVol / totalVol) * 100 : 0;
    const sorted = [...tickers].sort(
      (a, b) => b.changePercent - a.changePercent,
    );
    return {
      btcDom,
      topGainer: sorted[0],
      topLoser: sorted[sorted.length - 1],
    };
  }, [tickers]);

  const tabSwitcher = (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-md"
      style={{
        background: "var(--surface-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className="dash-text-xs font-medium px-2 py-0.5 rounded uppercase tracking-wider transition-colors duration-150"
          style={{
            background: tab === t.id ? "var(--surface)" : "transparent",
            color:
              tab === t.id ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <DashboardCard
      variant="standard"
      title="Market Pulse"
      icon={<Activity size={14} />}
      action={tabSwitcher}
      loading={tickers.length === 0}
      live
      className={className}
    >
      <div className="flex flex-col h-full">
        {/* Rows */}
        <ul className="flex-1 flex flex-col">
          {rows.map((row, i) => (
            <PulseRow key={row.symbol} row={row} rank={i + 1} tab={tab} />
          ))}
        </ul>

        {/* Stats footer */}
        {stats && (
          <div
            className="flex items-center justify-between gap-3 mt-2 pt-2 dash-text-xs"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="uppercase tracking-[0.12em]"
                style={{ color: "var(--text-muted)" }}
              >
                BTC Dom
              </span>
              <span
                className="font-[var(--font-jetbrains-mono)] tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                {stats.btcDom.toFixed(1)}%
              </span>
            </div>
            {stats.topGainer && (
              <div className="flex items-center gap-1.5">
                <span
                  className="uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Top
                </span>
                <span
                  className="font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-primary)" }}
                >
                  {DISPLAY_NAMES[stats.topGainer.symbol] ??
                    stats.topGainer.symbol.replace("USDT", "")}
                </span>
                <span
                  className="font-[var(--font-jetbrains-mono)] tabular-nums"
                  style={{ color: "var(--primary)" }}
                >
                  +{stats.topGainer.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
            {stats.topLoser && (
              <div className="flex items-center gap-1.5">
                <span
                  className="uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Bot
                </span>
                <span
                  className="font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-primary)" }}
                >
                  {DISPLAY_NAMES[stats.topLoser.symbol] ??
                    stats.topLoser.symbol.replace("USDT", "")}
                </span>
                <span
                  className="font-[var(--font-jetbrains-mono)] tabular-nums"
                  style={{ color: "var(--bear)" }}
                >
                  {stats.topLoser.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

interface PulseRowProps {
  row: TickerData;
  rank: number;
  tab: Tab;
}

function PulseRow({ row, rank, tab }: PulseRowProps) {
  const isUp = row.changePercent >= 0;
  const deltaColor = isUp ? "var(--primary)" : "var(--bear)";
  const name = DISPLAY_NAMES[row.symbol] ?? row.symbol.replace("USDT", "");

  return (
    <li
      className={cn(
        "flex items-center gap-3 py-1.5 transition-colors duration-150",
        "hover:bg-[color-mix(in_oklab,var(--surface-elevated)_55%,transparent)]",
      )}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Rank */}
      <span
        className="dash-text-xs font-[var(--font-jetbrains-mono)] tabular-nums w-4 text-right shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        {rank}
      </span>

      {/* Symbol — Geist Sans uppercase kicker */}
      <span
        className="dash-text-sm font-semibold w-14 truncate uppercase tracking-wide"
        style={{ color: "var(--text-primary)" }}
      >
        {name}
      </span>

      {/* Price */}
      <span
        className="dash-text-xs font-[var(--font-jetbrains-mono)] tabular-nums flex-1 text-right"
        style={{ color: "var(--text-secondary)" }}
      >
        ${fmtPrice(row.price)}
      </span>

      {/* Change% */}
      <span
        className="dash-text-xs font-[var(--font-jetbrains-mono)] font-semibold tabular-nums w-16 text-right"
        style={{ color: deltaColor }}
      >
        {isUp ? "+" : ""}
        {row.changePercent.toFixed(2)}%
      </span>

      {/* Volume — emphasised in volume tab */}
      <span
        className="dash-text-xs font-[var(--font-jetbrains-mono)] tabular-nums w-16 text-right shrink-0"
        style={{
          color:
            tab === "volume"
              ? "var(--text-primary)"
              : "var(--text-muted)",
          fontWeight: tab === "volume" ? 600 : 400,
        }}
      >
        {fmtVolume(row.quoteVolume24h)}
      </span>
    </li>
  );
}
