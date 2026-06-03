"use client";

/**
 * Slim launch-offer banner shown above the bento grid for FREE-tier
 * users. Dismissible (state local to the component — re-renders only
 * when the user clicks). Not a DashboardCard: it sits *outside* the
 * grid so the visual weight stays banner-like.
 *
 * Palette: primary lime → accent teal gradient. No purple / orange.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";

export function UpgradeBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || session?.user?.tier === "PRO") return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-[12px] relative"
      style={{
        background:
          "linear-gradient(to right, color-mix(in oklab, var(--primary) 8%, transparent), color-mix(in oklab, var(--accent) 8%, transparent))",
        border:
          "1px solid color-mix(in oklab, var(--primary) 18%, var(--border))",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
        style={{ background: "var(--primary)" }}
      />
      <span style={{ color: "var(--text-secondary)" }}>
        <span style={{ color: "var(--primary)", fontWeight: 600 }}>
          Launch offer:
        </span>{" "}
        Unlock footprint charts, heatmap, GEX &amp; more for{" "}
        <strong style={{ color: "var(--text-primary)" }}>$29/mo</strong> —
        locked for life.
      </span>
      <a
        href="/pricing"
        className="flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold transition-all hover:-translate-y-px"
        style={{
          background: "var(--primary)",
          color: "var(--background, #0a0a0f)",
        }}
      >
        Upgrade →
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-80 transition-opacity p-1"
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
