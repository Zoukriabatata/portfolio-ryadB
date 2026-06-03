"use client";

/**
 * Floating wrapper for the existing `DashboardAIChat` component.
 *
 * The legacy embed sat as a permanent full-width footer bar on
 * `/dashboard`, eating ~280 px of vertical real estate and forcing
 * the bento above it to scroll on smaller monitors. This component
 * collapses it to a refined FAB pill at the bottom-right, expanding
 * on click into a slide-over panel from the right edge.
 *
 * Behaviour :
 *   • Closed → 56 × 56 lime-hairline pill with the AI mark + a
 *     pulsing live dot. Hover reveals "ASK AI" label inline.
 *   • Open  → 420 px wide panel from the right, full viewport tall,
 *     containing the unchanged `<DashboardAIChat />`. Backdrop
 *     dims the rest of the surface.
 *   • Escape key + backdrop click both close the panel.
 *
 * The wrapped chat component receives no props — we don't touch the
 * chat's own state, history, or input handlers. The wrapper is
 * purely a positioning + visibility container.
 */

import { Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const DashboardAIChat = dynamic(
  () => import("@/components/ai/DashboardAIChat"),
  { ssr: false },
);

export function FloatingAIChat() {
  const [open, setOpen] = useState(false);

  // Close on Escape so power-users don't have to reach for the
  // mouse. Bail when the chat itself owns focus (its textarea
  // already swallows Escape for its own buffer clearing).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Lock background scroll while the panel is open — the dashboard
  // sits behind a backdrop and shouldn't move with the wheel.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* FAB pill — bottom-right corner. Position uses `fixed` so it
          stays anchored regardless of dashboard scroll. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open OrderFlow AI assistant"
        className={cn(
          "group fixed z-40",
          "bottom-5 right-5 sm:bottom-6 sm:right-6",
          "flex items-center gap-2",
          "h-11 pl-3 pr-4 rounded-full",
          "bg-[var(--surface-elevated)]",
          "border border-[var(--border-glow)]",
          "shadow-[0_8px_24px_rgba(0,0,0,0.4),0_0_24px_rgba(74,222,128,0.18)]",
          "transition-[transform,box-shadow,border-color] duration-200",
          "hover:scale-[1.02]",
          "hover:border-[var(--primary)]",
          "hover:shadow-[0_10px_28px_rgba(0,0,0,0.5),0_0_32px_rgba(74,222,128,0.32)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
          open && "opacity-0 pointer-events-none scale-90",
        )}
      >
        <span
          aria-hidden
          className="relative flex items-center justify-center"
          style={{ width: 18, height: 18 }}
        >
          <Sparkles size={16} style={{ color: "var(--primary)" }} />
          {/* Live pulse dot anchored to the icon. */}
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
            style={{
              background: "var(--primary)",
              boxShadow: "0 0 8px rgba(74, 222, 128, 0.7)",
              animation: "fab-pulse 1.6s ease-in-out infinite",
            }}
          />
        </span>
        <span
          className={cn(
            "dash-text-xs uppercase tracking-[0.16em] font-semibold",
            "transition-colors",
          )}
          style={{ color: "var(--text-secondary)" }}
        >
          Ask AI
        </span>

        <style>{`
          @keyframes fab-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%      { transform: scale(1.4); opacity: 0.55; }
          }
          @media (prefers-reduced-motion: reduce) {
            .group [style*="fab-pulse"] {
              animation: none !important;
            }
          }
        `}</style>
      </button>

      {/* Backdrop + slide-over panel. Rendered conditionally so the
          DashboardAIChat dynamic import is paid on first open, not
          on dashboard mount. */}
      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className={cn(
              "fixed inset-0 z-40",
              "bg-black/40 backdrop-blur-[2px]",
              "animate-[ai-backdrop-in_180ms_ease-out_both]",
            )}
          />
          <aside
            role="dialog"
            aria-label="OrderFlow AI assistant"
            className={cn(
              "fixed top-0 right-0 z-40",
              "h-full w-full sm:max-w-[420px]",
              "flex flex-col",
              "bg-[var(--surface-elevated)]",
              "border-l border-[var(--border-glow)]",
              "shadow-[-16px_0_40px_rgba(0,0,0,0.5)]",
              "animate-[ai-panel-in_240ms_cubic-bezier(0.22,1,0.36,1)_both]",
            )}
          >
            <header
              className={cn(
                "flex items-center justify-between gap-2",
                "px-4 py-3 shrink-0",
                "border-b border-[var(--border)]",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className="grid place-items-center"
                  style={{ width: 18, height: 18 }}
                >
                  <Sparkles size={14} style={{ color: "var(--primary)" }} />
                </span>
                <span
                  className="font-[var(--font-instrument-serif)] dash-text-base"
                  style={{ color: "var(--text-primary)" }}
                >
                  OrderFlow AI
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close AI assistant"
                className={cn(
                  "shrink-0 grid place-items-center w-8 h-8 rounded-md",
                  "text-[var(--text-secondary)]",
                  "transition-colors duration-150",
                  "hover:bg-[var(--surface-hover)]",
                  "hover:text-[var(--text-primary)]",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--primary)]",
                )}
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-hidden">
              <DashboardAIChat />
            </div>

            <style>{`
              @keyframes ai-backdrop-in {
                from { opacity: 0; }
                to   { opacity: 1; }
              }
              @keyframes ai-panel-in {
                from {
                  transform: translateX(100%);
                  opacity: 0.5;
                }
                to {
                  transform: translateX(0);
                  opacity: 1;
                }
              }
              @media (prefers-reduced-motion: reduce) {
                [class*="animate-[ai-"] {
                  animation: none !important;
                }
              }
            `}</style>
          </aside>
        </>
      )}
    </>
  );
}
