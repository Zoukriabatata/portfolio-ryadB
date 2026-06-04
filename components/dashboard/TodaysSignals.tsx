"use client";

/**
 * Today's editorial brief — a chronological list of economic events
 * worth watching today, rendered like a financial newspaper's
 * "What matters" column.
 *
 * Layout intent (Editorial Terminal) :
 *
 *   ┌─────────────────────────────┐
 *   │ Today's Signals · ⏵         │ ← DashboardCard standard header
 *   │ ─────────────────────────── │
 *   │ Mon · Jun 3                 │ ← Instrument Serif italic kicker
 *   │ What matters today          │ ← Geist sm muted
 *   │                             │
 *   │ │ 14:30  CPI YoY · USD      │ ← impact bar + mono time + title
 *   │ │ 16:00  FOMC dots · USD    │ ← high-impact = primary lime bar
 *   │ ┊ 18:30  ECB minutes · EUR  │ ← medium = muted bar
 *   │ ┊ 20:00  BOJ rate · JPY     │
 *   │ ⋮ 21:00  Earnings: NVDA    │
 *   └─────────────────────────────┘
 *
 * Empty state : "Quiet day. Watch the tape." — no sad placeholder.
 */

import { Activity } from "lucide-react";
import { useMemo } from "react";

import { useEconomicCalendar } from "@/hooks/useEconomicCalendar";

import { DashboardCard } from "./DashboardCard";
import { cn } from "@/lib/utils";

import type { EconomicEvent } from "@/types/news";

const VISIBLE_LIMIT = 6;

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function formatHeaderDate(now: Date): string {
  return now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const IMPACT_STYLE: Record<EconomicEvent["impact"], string> = {
  high: "bg-[var(--primary)] w-[3px]",
  medium: "bg-[var(--text-secondary)] w-[2px]",
  low: "bg-[var(--text-dimmed)] w-px",
};

const IMPACT_GLOW: Record<EconomicEvent["impact"], string> = {
  high: "shadow-[0_0_8px_rgba(74,222,128,0.45)]",
  medium: "",
  low: "",
};

export function TodaysSignals() {
  const { events, isLoading } = useEconomicCalendar();

  // Today + upcoming only. Server returns the whole week by default,
  // so we narrow client-side. Sort by time so the column reads in
  // chronological order top-to-bottom.
  const filtered = useMemo<EconomicEvent[]>(() => {
    const now = Date.now();
    const today = new Date();
    return events
      .filter((e) => {
        const t = new Date(e.time).getTime();
        if (!Number.isFinite(t)) return false;
        if (t < now) return false;
        return isSameUtcDay(new Date(e.time), today);
      })
      .sort(
        (a, b) =>
          new Date(a.time).getTime() - new Date(b.time).getTime(),
      )
      .slice(0, VISIBLE_LIMIT);
  }, [events]);

  const dateLabel = useMemo(() => formatHeaderDate(new Date()), []);

  return (
    <DashboardCard
      title="Today's Signals"
      icon={<Activity size={14} />}
      loading={isLoading && events.length === 0}
      className="h-full"
    >
      <div className="flex flex-col h-full gap-3">
        {/* Date kicker — magazine "issue" header. */}
        <div className="flex flex-col -mt-0.5">
          <span
            className={cn(
              "font-[var(--font-jetbrains-mono)] uppercase",
              "dash-text-sm font-medium tracking-[0.16em] tabular-nums",
            )}
            style={{ color: "var(--text-primary)" }}
          >
            {dateLabel}
          </span>
          <span
            className="dash-text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            What matters today
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 py-6 gap-1 text-center">
            <span
              className="font-[var(--font-jetbrains-mono)] uppercase dash-text-sm font-medium tracking-[0.18em]"
              style={{ color: "var(--text-secondary)" }}
            >
              Quiet day
            </span>
            <span
              className="dash-text-xs"
              style={{ color: "var(--text-dimmed)" }}
            >
              Watch the tape.
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5 min-h-0 overflow-hidden">
            {filtered.map((event) => (
              <li key={event.id} className="flex items-start gap-3">
                {/* Impact bar — vertical hairline whose width + colour
                    encode importance. The high-impact bar also gets
                    a phosphor halo. */}
                <span
                  aria-label={`${event.impact} impact`}
                  className={cn(
                    "mt-0.5 self-stretch rounded-full",
                    IMPACT_STYLE[event.impact],
                    IMPACT_GLOW[event.impact],
                  )}
                  style={{ minHeight: 28 }}
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={cn(
                        "font-[var(--font-jetbrains-mono)] tabular-nums",
                        "dash-text-xs shrink-0",
                      )}
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatTime(event.time)}
                    </span>
                    <span
                      className="dash-text-sm font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {event.event}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "dash-text-xs uppercase tracking-[0.12em]",
                    )}
                    style={{ color: "var(--text-muted)" }}
                  >
                    {event.currency}
                    {event.forecast ? (
                      <>
                        <span
                          aria-hidden
                          className="mx-1.5"
                          style={{ color: "var(--text-dimmed)" }}
                        >
                          ·
                        </span>
                        <span className="font-[var(--font-jetbrains-mono)] normal-case">
                          fc {event.forecast}
                        </span>
                      </>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardCard>
  );
}
