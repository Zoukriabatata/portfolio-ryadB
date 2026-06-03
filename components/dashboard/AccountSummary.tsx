"use client";

/**
 * Account summary — full-width footer card.
 *
 * Until a broker (Rithmic / Apex via NinjaTrader bridge) is linked
 * we render an editorial micro-essay explaining what *will* land
 * here, with a CTA pointing at the broker settings. When the broker
 * module ships, this same component swaps the marketing copy for
 * live P&L + open positions + today's session stats.
 *
 * Visual treatment :
 *   • compact variant
 *   • two-column flex with the CTA pinned right
 *   • Instrument Serif italic micro-headline so the empty state
 *     reads as deliberate, not "data missing"
 */

import { Wallet, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { DashboardCard } from "./DashboardCard";

export interface AccountSummaryProps {
  /** Future hook for the live data variant. Today we always render
   *  the placeholder because no broker pipe is wired. */
  brokerConnected?: boolean;
}

export function AccountSummary({
  brokerConnected = false,
}: AccountSummaryProps) {
  return (
    <DashboardCard
      variant="compact"
      title="Account"
      icon={<Wallet size={14} />}
      className="h-full"
    >
      {brokerConnected ? (
        // Live branch lands when the Rithmic / NT bridge data pipe
        // is exposed to the web side. For now we just keep the slot
        // honest if some future state turns the flag on.
        <div
          className="font-[var(--font-jetbrains-mono)] tabular-nums dash-text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Broker connected — live stats coming.
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span
              className={cn(
                "font-[var(--font-jetbrains-mono)] uppercase",
                "dash-text-sm font-medium tracking-[0.14em]",
              )}
              style={{ color: "var(--text-primary)" }}
            >
              No broker linked yet
            </span>
            <span
              className="dash-text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Connect Rithmic to surface P&L, open positions and
              today&apos;s session stats here.
            </span>
          </div>
          <Link
            href="/account?broker=true"
            className={cn(
              "shrink-0 self-start sm:self-end",
              "inline-flex items-center gap-1.5",
              "dash-text-xs font-medium uppercase tracking-[0.14em]",
              "px-2.5 py-1.5 rounded-md",
              "border border-[var(--border-glow)]",
              "transition-colors duration-150",
              "hover:bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]",
            )}
            style={{ color: "var(--primary)" }}
          >
            <span>Link Rithmic</span>
            <ArrowUpRight size={12} aria-hidden />
          </Link>
        </div>
      )}
    </DashboardCard>
  );
}
