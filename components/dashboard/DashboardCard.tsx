/**
 * Single card primitive for the redesigned dashboard.
 *
 * The legacy dashboard repeated `rounded-xl border h-full flex
 * flex-col` 11 times with no visual hierarchy — every widget looked
 * identical regardless of importance. This component centralises the
 * surface treatment and adds three variants so the bento grid can
 * communicate priority:
 *
 *   hero     → most important content (Watchlist). Elevated surface,
 *              soft primary border, larger padding + title.
 *   standard → main widgets (MarketPulse, TodaysSignals, etc.).
 *              Default surface, neutral border, medium padding.
 *   compact  → at-a-glance status (Funding rates, OI). Sunken
 *              surface, thinner border, tight padding.
 *
 * A loading state renders a skeleton in place of children so each
 * widget can hand off "still fetching" without rewriting layout.
 */

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

import type { DashboardCardVariant } from "./types";

export interface DashboardCardProps {
  variant?: DashboardCardVariant;
  /** Card header title — rendered with a variant-appropriate size.
   *  Omit to drop the header row entirely (e.g. for ad-hoc layouts). */
  title?: string;
  /** Icon shown to the left of the title. 14×14 px target. */
  icon?: ReactNode;
  /** Right-aligned slot for refresh buttons, "view all" links, tabs. */
  action?: ReactNode;
  /** When true, body is replaced by a 3-line skeleton. Header stays so
   *  the user sees what is loading. */
  loading?: boolean;
  /** Card body. */
  children?: ReactNode;
  /** Optional grid placement classes (col-span-*, row-span-*) supplied
   *  by the bento shell. Kept separate from variant styling so the
   *  card itself doesn't have to know about its grid coordinates. */
  className?: string;
}

const VARIANT_CLASS: Record<DashboardCardVariant, string> = {
  hero: cn(
    "bg-[var(--surface-elevated)]",
    "border border-[color-mix(in_oklab,var(--primary)_22%,var(--border))]",
    "shadow-[var(--shadow-lg)]",
    "p-5",
    "rounded-2xl",
  ),
  standard: cn(
    "bg-[var(--surface)]",
    "border border-[var(--border)]",
    "shadow-[var(--shadow-sm)]",
    "p-4",
    "rounded-xl",
  ),
  compact: cn(
    "bg-[color-mix(in_oklab,var(--surface)_60%,transparent)]",
    "border border-[color-mix(in_oklab,var(--border)_50%,transparent)]",
    "p-3",
    "rounded-lg",
  ),
};

const TITLE_CLASS: Record<DashboardCardVariant, string> = {
  hero: "dash-text-lg font-semibold tracking-tight",
  standard: "dash-text-base font-semibold tracking-tight",
  compact: "dash-text-sm font-medium uppercase tracking-wider",
};

const TITLE_COLOR: Record<DashboardCardVariant, string> = {
  hero: "text-[var(--text-primary)]",
  standard: "text-[var(--text-primary)]",
  compact: "text-[var(--text-muted)]",
};

export function DashboardCard({
  variant = "standard",
  title,
  icon,
  action,
  loading = false,
  children,
  className,
}: DashboardCardProps) {
  const hasHeader = Boolean(title || icon || action);

  return (
    <section
      className={cn(
        "flex flex-col min-h-0 transition-colors duration-150",
        "hover:border-[color-mix(in_oklab,var(--primary)_18%,var(--border))]",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {hasHeader && (
        <header
          className={cn(
            "flex items-center justify-between gap-2",
            variant === "compact" ? "mb-2" : "mb-3",
            "shrink-0",
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {icon && (
              <span
                className="shrink-0 grid place-items-center"
                style={{
                  width: 14,
                  height: 14,
                  color:
                    variant === "compact"
                      ? "var(--text-muted)"
                      : "var(--primary)",
                }}
                aria-hidden
              >
                {icon}
              </span>
            )}
            {title && (
              <h3
                className={cn(
                  TITLE_CLASS[variant],
                  TITLE_COLOR[variant],
                  "truncate",
                )}
              >
                {title}
              </h3>
            )}
          </div>
          {action && (
            <div className="shrink-0 flex items-center">{action}</div>
          )}
        </header>
      )}

      <div className="flex-1 min-h-0">
        {loading ? <CardSkeleton variant={variant} /> : children}
      </div>
    </section>
  );
}

/** Three-line skeleton sized to the variant. */
function CardSkeleton({ variant }: { variant: DashboardCardVariant }) {
  const rowH = variant === "compact" ? 10 : variant === "hero" ? 16 : 12;
  return (
    <div className="flex flex-col gap-2 animate-pulse" aria-hidden>
      {[1, 0.85, 0.6].map((w, i) => (
        <div
          key={i}
          className="rounded-md bg-[color-mix(in_oklab,var(--text-muted)_12%,transparent)]"
          style={{ height: rowH, width: `${w * 100}%` }}
        />
      ))}
    </div>
  );
}
