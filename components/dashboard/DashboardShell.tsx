"use client";

/**
 * Phase 4 of the dashboard redesign: the bento grid that replaces
 * the legacy 1/3-col stack.
 *
 *   • 12-col CSS grid with auto-rows minmax(140px, auto).
 *   • Hero card (Watchlist) sits at col-span-6 / row-span-2 so it
 *     reads as the primary surface at a glance.
 *   • Two flanking row-span-2 cards (MarketPulse + TodaysSignals)
 *     fill the visual hierarchy across the top half.
 *   • Three compact cards (Funding / OI / Liquidations) form the
 *     middle band — homogeneous size signals "monitoring strip".
 *   • Bottom band : RecentActivity (col-5) + QuickLaunch (col-7) so
 *     navigation is the last thing the eye lands on (Fitt's law).
 *   • AccountSummary spans the full row at the very bottom — it's
 *     contextual, not primary, until a broker is wired.
 *
 * Responsive breakpoints :
 *   • <640px  → everything stacks to col-span-1 in source order.
 *   • 640-1024px → 6-col grid; hero spans 6, secondaries 3, mid-band
 *     stays 2 each.
 *   • ≥1024px → full 12-col bento as documented above.
 */

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface DashboardShellProps {
  /** Slim greeting + clock + market-status bar. Owns its own height. */
  topBar: ReactNode;
  /** Conditional upgrade nudge (FREE plan only). Render `null` to skip. */
  upgradeBanner?: ReactNode;
  /** Hero card — currently a placeholder, becomes Watchlist in phase 5. */
  watchlistSlot: ReactNode;
  marketPulseSlot: ReactNode;
  /** Phase-5 placeholder until TodaysSignals lands. */
  todaysSignalsSlot: ReactNode;
  fundingSlot: ReactNode;
  openInterestSlot: ReactNode;
  liquidationsSlot: ReactNode;
  /** Phase-5 placeholder until RecentActivity lands. */
  recentActivitySlot: ReactNode;
  quickLaunchSlot: ReactNode;
  /** Phase-5 placeholder until AccountSummary lands. */
  accountSummarySlot: ReactNode;
}

/** Shared grid-item placement classes. Kept here (not inside each
 *  widget) so the bento layout is debuggable from a single file —
 *  changing the layout means editing this map, not 10 components. */
const SLOTS = {
  watchlist: cn(
    "col-span-1",
    "sm:col-span-6",
    "lg:col-span-6 lg:row-span-2",
  ),
  marketPulse: cn(
    "col-span-1",
    "sm:col-span-3",
    "lg:col-span-3 lg:row-span-2",
  ),
  todaysSignals: cn(
    "col-span-1",
    "sm:col-span-3",
    "lg:col-span-3 lg:row-span-2",
  ),
  funding: cn("col-span-1", "sm:col-span-2", "lg:col-span-4"),
  openInterest: cn("col-span-1", "sm:col-span-2", "lg:col-span-4"),
  liquidations: cn("col-span-1", "sm:col-span-2", "lg:col-span-4"),
  recentActivity: cn("col-span-1", "sm:col-span-3", "lg:col-span-5"),
  quickLaunch: cn("col-span-1", "sm:col-span-3", "lg:col-span-7"),
  accountSummary: cn("col-span-1", "sm:col-span-6", "lg:col-span-12"),
} as const;

export function DashboardShell({
  topBar,
  upgradeBanner,
  watchlistSlot,
  marketPulseSlot,
  todaysSignalsSlot,
  fundingSlot,
  openInterestSlot,
  liquidationsSlot,
  recentActivitySlot,
  quickLaunchSlot,
  accountSummarySlot,
}: DashboardShellProps) {
  return (
    <div
      className="h-full overflow-auto custom-scrollbar"
      data-grain="on"
    >
      <div
        className={cn(
          "max-w-[1400px] mx-auto",
          "px-3 sm:px-4 lg:px-5 py-3 sm:py-4",
          "flex flex-col gap-3 sm:gap-4",
          "animate-fadeIn",
        )}
      >
        {topBar}
        {upgradeBanner}

        <main
          aria-label="Dashboard widgets"
          className={cn(
            "grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12",
            "gap-3 sm:gap-4",
            // grid-auto-rows lets row-span-2 actually double the
            // vertical footprint of hero / pulse / signals while the
            // other cards stay snug.
            "[grid-auto-rows:minmax(140px,auto)]",
          )}
        >
          <div className={SLOTS.watchlist}>{watchlistSlot}</div>
          <div className={SLOTS.marketPulse}>{marketPulseSlot}</div>
          <div className={SLOTS.todaysSignals}>{todaysSignalsSlot}</div>
          <div className={SLOTS.funding}>{fundingSlot}</div>
          <div className={SLOTS.openInterest}>{openInterestSlot}</div>
          <div className={SLOTS.liquidations}>{liquidationsSlot}</div>
          <div className={SLOTS.recentActivity}>{recentActivitySlot}</div>
          <div className={SLOTS.quickLaunch}>{quickLaunchSlot}</div>
          <div className={SLOTS.accountSummary}>{accountSummarySlot}</div>
        </main>
      </div>
    </div>
  );
}
