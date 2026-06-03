"use client";

/**
 * Slim launch-offer banner shown above the bento grid for FREE-tier
 * users. Dismissible (state local to the component — re-renders only
 * when the user clicks). Not a DashboardCard: it sits *outside* the
 * grid so the visual weight stays banner-like.
 *
 * Editorial Terminal pass :
 *   • Title → Instrument Serif italic `dash-text-lg`
 *   • Description → Geist Sans `dash-text-sm` muted
 *   • CTA → bordered lime, transparent bg, ArrowUpRight icon. The
 *     legacy gradient pill (lime → teal) was too loud for a slim
 *     status strip; the bordered ghost button fits the editorial
 *     palette better.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function UpgradeBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || session?.user?.tier === "PRO") return null;

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 rounded-xl relative"
      style={{
        background:
          "linear-gradient(to right, color-mix(in oklab, var(--primary) 6%, transparent), transparent)",
        border:
          "1px solid color-mix(in oklab, var(--primary) 18%, var(--border))",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
        style={{ background: "var(--primary)" }}
      />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <span
          className={cn(
            "font-[var(--font-instrument-serif)] italic dash-text-lg",
          )}
          style={{ color: "var(--text-primary)" }}
        >
          Upgrade to PRO
        </span>
        <span
          className="dash-text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Unlock footprint charts, heatmap, GEX &amp; more for{" "}
          <span
            className="font-[var(--font-jetbrains-mono)] tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            $29/mo
          </span>{" "}
          — locked for life.
        </span>
      </div>
      <a
        href="/pricing"
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg dash-text-sm font-medium transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--primary)_10%,transparent)]"
        style={{
          background: "transparent",
          color: "var(--primary)",
          border: "1px solid color-mix(in oklab, var(--primary) 40%, var(--border))",
        }}
      >
        Upgrade
        <ArrowUpRight size={14} />
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-2 opacity-40 hover:opacity-80 transition-opacity p-1"
        aria-label="Dismiss"
        style={{ color: "var(--text-muted)" }}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
