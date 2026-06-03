/**
 * Shared types for the redesigned dashboard widgets.
 *
 * Each widget in components/dashboard/* implements `DashboardWidgetProps`
 * so the shell can stitch them into the bento grid without per-widget
 * special cases.
 */

import type { ReactNode } from "react";

/** Visual hierarchy variants for the DashboardCard primitive. */
export type DashboardCardVariant = "hero" | "standard" | "compact";

/** Shared props every widget accepts so the bento grid can wire them
 *  consistently (className for grid placement, loading state for
 *  skeleton rendering). */
export interface DashboardWidgetProps {
  className?: string;
  loading?: boolean;
}

/** Generic shape of a card header action — typically a refresh button
 *  or a "view all" link. */
export interface CardAction {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: ReactNode;
}
