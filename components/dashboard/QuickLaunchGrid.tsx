"use client";

/**
 * QuickLaunch — 6 hand-picked entrypoints into the analytical surfaces
 * of the app. The legacy version shipped seven custom inline SVG
 * icons; we swap them for `lucide-react` so the icon language stays
 * consistent with the rest of the dashboard (DashboardCard headers
 * already use lucide).
 *
 * /bias and /replay are intentionally absent — they were retired in
 * the same sweep that produced this refactor.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
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
  shortcut?: string;
  icon: ReactNode;
}

const TOOLS: Tool[] = [
  { href: "/live", label: "Live", shortcut: "1", icon: <CandlestickChart size={20} /> },
  { href: "/footprint", label: "Footprint", shortcut: "2", icon: <Grid3x3 size={20} /> },
  { href: "/gex", label: "GEX", shortcut: "4", icon: <ZapIcon size={20} /> },
  { href: "/volatility", label: "Volatility", shortcut: "5", icon: <Activity size={20} /> },
  { href: "/news", label: "News", shortcut: "7", icon: <Newspaper size={20} /> },
  { href: "/ai", label: "AI", icon: <Bot size={20} /> },
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
            className="group relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg border transition-all duration-150"
            style={{
              background: "var(--surface-elevated)",
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.borderColor =
                "color-mix(in oklab, var(--primary) 40%, var(--border))";
              el.style.boxShadow =
                "0 0 0 1px color-mix(in oklab, var(--primary) 22%, transparent)";
              el.style.color = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement;
              el.style.borderColor = "var(--border)";
              el.style.boxShadow = "none";
              el.style.color = "var(--text-secondary)";
            }}
          >
            {tool.shortcut && (
              <span
                className="absolute top-1 right-1 dash-text-xs font-mono font-semibold px-1 rounded leading-none"
                style={{
                  background: "var(--surface)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {tool.shortcut}
              </span>
            )}
            <span aria-hidden>{tool.icon}</span>
            <span
              className="dash-text-xs font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {tool.label}
            </span>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}
