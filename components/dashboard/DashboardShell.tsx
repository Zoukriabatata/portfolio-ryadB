"use client";

/**
 * Phase 4 of the dashboard redesign: the bento grid that replaces
 * the legacy 1/3-col stack.
 *
 * Phase 6 polish layered on top:
 *   • `data-stagger-slot` on each slot drives a single orchestrated
 *     fade-in / translate sequence at mount (CSS keyframes only,
 *     no Framer runtime). Honours prefers-reduced-motion via the
 *     globals.css media query.
 *   • Keyboard shortcuts 1 / 2 / 4 / 5 / 7 navigate to the
 *     corresponding chart routes (mirrors the QuickLaunchGrid
 *     legend). Disabled while focus sits in an input / textarea so
 *     typing a "2" into a search box never throws the user to /footprint.
 */

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export interface DashboardShellProps {
  topBar: ReactNode;
  upgradeBanner?: ReactNode;
  watchlistSlot: ReactNode;
  marketPulseSlot: ReactNode;
  todaysSignalsSlot: ReactNode;
  fundingSlot: ReactNode;
  openInterestSlot: ReactNode;
  liquidationsSlot: ReactNode;
  recentActivitySlot: ReactNode;
  quickLaunchSlot: ReactNode;
  accountSummarySlot: ReactNode;
}

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

/** Map of digit keys → routes. Matches the legend rendered inside
 *  QuickLaunchGrid so the user sees which shortcut goes where. The
 *  Account route ('account') intentionally has no shortcut — it's
 *  not a chart and lives in its own settings flow. */
const SHORTCUT_ROUTES: Record<string, string> = {
  "1": "/live",
  "2": "/footprint",
  "4": "/gex",
  "5": "/volatility",
  "7": "/news",
};

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
  const router = useRouter();

  // Global digit-key navigation. Bail when typing in a form control
  // or when a modifier is held (Cmd-1 means "switch tab" in the
  // browser, hijacking it would be hostile).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const route = SHORTCUT_ROUTES[event.key];
      if (!route) return;
      event.preventDefault();
      router.push(route);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

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
        )}
      >
        <div data-stagger-slot="0">{topBar}</div>
        {upgradeBanner && <div data-stagger-slot="1">{upgradeBanner}</div>}

        <main
          aria-label="Dashboard widgets"
          className={cn(
            "grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12",
            "gap-3 sm:gap-4",
            "[grid-auto-rows:minmax(140px,auto)]",
          )}
        >
          <div data-stagger-slot="2" className={SLOTS.watchlist}>
            {watchlistSlot}
          </div>
          <div data-stagger-slot="2" className={SLOTS.marketPulse}>
            {marketPulseSlot}
          </div>
          <div data-stagger-slot="2" className={SLOTS.todaysSignals}>
            {todaysSignalsSlot}
          </div>

          <div data-stagger-slot="3" className={SLOTS.funding}>
            {fundingSlot}
          </div>
          <div data-stagger-slot="3" className={SLOTS.openInterest}>
            {openInterestSlot}
          </div>
          <div data-stagger-slot="3" className={SLOTS.liquidations}>
            {liquidationsSlot}
          </div>

          <div data-stagger-slot="4" className={SLOTS.recentActivity}>
            {recentActivitySlot}
          </div>
          <div data-stagger-slot="4" className={SLOTS.quickLaunch}>
            {quickLaunchSlot}
          </div>

          <div data-stagger-slot="5" className={SLOTS.accountSummary}>
            {accountSummarySlot}
          </div>
        </main>
      </div>
    </div>
  );
}
