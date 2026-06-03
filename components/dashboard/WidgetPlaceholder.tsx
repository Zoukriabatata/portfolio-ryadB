/**
 * Temporary placeholder used in the bento slots that Phase 5 will
 * fill (Watchlist, TodaysSignals, RecentActivity, AccountSummary).
 *
 * Keeps the grid structure honest in the meantime — a slot that's
 * `null` would collapse and reshuffle the layout, which we want to
 * avoid so the Phase 4 commit reads as a layout swap (not a content
 * change). The placeholder is intentionally low-contrast so users
 * don't mistake it for real data.
 */

import type { ReactNode } from "react";

import { DashboardCard } from "./DashboardCard";
import type { DashboardCardVariant } from "./types";

export interface WidgetPlaceholderProps {
  title: string;
  icon?: ReactNode;
  variant?: DashboardCardVariant;
  /** Single-line hint about what the slot will become. */
  comingSoon?: string;
}

export function WidgetPlaceholder({
  title,
  icon,
  variant = "standard",
  comingSoon = "Coming soon",
}: WidgetPlaceholderProps) {
  return (
    <DashboardCard
      variant={variant}
      title={title}
      icon={icon}
      className="h-full"
    >
      <div
        className="flex flex-col items-center justify-center h-full py-6 gap-1"
        style={{ color: "var(--text-muted)" }}
      >
        <span className="dash-text-sm font-medium">{comingSoon}</span>
        <span
          className="dash-text-xs"
          style={{ color: "var(--text-dimmed)" }}
        >
          Phase 5 of the dashboard redesign
        </span>
      </div>
    </DashboardCard>
  );
}
