"use client";

/**
 * QuickLaunch — 6 hand-picked entrypoints into the analytical surfaces
 * of the app. The legacy version shipped seven custom inline SVG
 * icons; we swap them for `lucide-react` so the icon language stays
 * consistent with the rest of the dashboard (DashboardCard headers
 * already use lucide).
 *
 * Editorial Terminal pass :
 *   • Tool label → Geist Sans medium
 *   • Shortcut badge → JetBrains Mono in a mini bordered pill
 *   • Description → Geist Sans `dash-text-xs` muted
 *   • Hover → border + halo lime (`--border-glow`), label flips to
 *     `--text-primary`, and an ArrowUpRight icon fades in top-right.
 *
 * /bias and /replay are intentionally absent — they were retired in
 * the same sweep that produced this refactor.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CandlestickChart,
  Grid3x3,
  Newspaper,
  Zap as ZapIcon,
} from "lucide-react";

import { DashboardCard } from "./DashboardCard";

interface QuickLaunchGridProps {
  className?: string;
}

interface Tool {
  href: string;
  label: string;
  description: string;
  shortcut?: string;
  icon: ReactNode;
}

const TOOLS: Tool[] = [
  {
    href: "/live",
    label: "Live",
    description: "Tape & DOM",
    shortcut: "1",
    icon: <CandlestickChart size={20} />,
  },
  {
    href: "/footprint",
    label: "Footprint",
    description: "Bid/Ask cells",
    shortcut: "2",
    icon: <Grid3x3 size={20} />,
  },
  {
    href: "/gex",
    label: "GEX",
    description: "Dealer gamma",
    shortcut: "4",
    icon: <ZapIcon size={20} />,
  },
  {
    href: "/volatility",
    label: "Volatility",
    description: "IV smile",
    shortcut: "5",
    icon: <Activity size={20} />,
  },
  {
    href: "/news",
    label: "News",
    description: "Headlines",
    shortcut: "7",
    icon: <Newspaper size={20} />,
  },
  {
    href: "/ai",
    label: "AI",
    description: "Co-pilot",
    icon: <Bot size={20} />,
  },
];

export function QuickLaunchGrid({ className }: QuickLaunchGridProps) {
  return (
    <DashboardCard
      variant="standard"
      title="Quick Launch"
      icon={<ZapIcon size={14} />}
      className={className}
    >
      <div className="grid grid-cols-3 gap-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group relative flex flex-col items-start gap-1.5 px-2.5 py-3 rounded-lg border transition-colors duration-150 hover:border-[var(--border-glow)] hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
            style={{
              background: "var(--surface-elevated)",
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            {tool.shortcut && (
              <span
                className="absolute top-1.5 right-1.5 dash-text-xs font-[var(--font-jetbrains-mono)] font-semibold px-1 rounded leading-none group-hover:opacity-0 transition-opacity duration-150"
                style={{
                  background: "var(--surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {tool.shortcut}
              </span>
            )}
            {/* Hover arrow — slides in on top-right, replacing the
                shortcut badge so the layout doesn't shift. */}
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{ color: "var(--primary)" }}
            >
              <ArrowUpRight size={14} />
            </span>
            <span
              aria-hidden
              className="transition-colors duration-150 group-hover:text-[var(--primary)]"
              style={{ color: "var(--text-secondary)" }}
            >
              {tool.icon}
            </span>
            <span
              className="dash-text-sm font-medium tracking-tight transition-colors duration-150 group-hover:text-[var(--text-primary)]"
              style={{ color: "var(--text-primary)" }}
            >
              {tool.label}
            </span>
            <span
              className="dash-text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {tool.description}
            </span>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}
