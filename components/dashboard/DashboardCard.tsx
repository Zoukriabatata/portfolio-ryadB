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

// Editorial Terminal surface treatment :
//   • hero     → elevated, hairline lime "live" border + halo behind.
//                The halo is rendered inline via a CSS variable so
//                browsers without `radial-gradient` in box-shadow
//                degrade gracefully.
//   • standard → flat surface, neutral border. The default "card".
//   • compact  → semi-transparent surface so a row of these reads as
//                a strip, not three distinct features.
const VARIANT_CLASS: Record<DashboardCardVariant, string> = {
  hero: cn(
    "relative bg-[var(--surface-elevated)]",
    "border border-[var(--border-glow)]",
    "shadow-[var(--shadow-lg)]",
    "p-5",
    "rounded-2xl",
    "overflow-hidden",
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

// Editorial Terminal typography :
//   • hero     → Instrument Serif (editorial gravitas on the
//                featured card). Regular weight; the italic shift
//                is reserved for the hover micro-interaction.
//   • standard → Geist Sans medium, tracking-tight. Reads as
//                "section heading" without competing with the hero.
//   • compact  → Geist Sans medium uppercase widely tracked. Reads
//                as label, not a title — these cards are status
//                strips, not features.
const TITLE_CLASS: Record<DashboardCardVariant, string> = {
  hero:
    "font-[var(--font-instrument-serif)] dash-text-xl tracking-tight",
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
      {/* Editorial halo behind the hero card — barely-there elliptical
          accent so the featured content has a soft spotlight without
          screaming "glow." Skipped on standard / compact to keep the
          rest of the grid sober. */}
      {variant === "hero" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0"
          style={{ background: "var(--halo-hero)" }}
        />
      )}
      <div className="relative z-[1] flex flex-col min-h-0 flex-1">
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
