// Indicators dropdown — entry point for the footprint chart's
// overlay indicators (VWAP, sessions, etc.). Each entry below
// becomes a clickable row whose on/off state lives in
// useFootprintSettingsStore and flows through the standard
// settings → rendererSettings → adapter pipeline.

import { useEffect, useRef, useState } from "react";
import { useFootprintSettingsStore } from "../../stores/useFootprintSettingsStore";
import type { FootprintSettings } from "../../stores/useFootprintSettingsStore";
import "./IndicatorsButton.css";

// Indicator registry — extend here when adding a new overlay.
// `key` MUST be a boolean field on FootprintSettings.
type IndicatorEntry = {
  key: BooleanSettingKey;
  label: string;
  description?: string;
};
type BooleanSettingKey = {
  [K in keyof FootprintSettings]: FootprintSettings[K] extends boolean
    ? K
    : never;
}[keyof FootprintSettings];

const INDICATORS: IndicatorEntry[] = [
  {
    key: "showVwapIndicator",
    label: "VWAP",
    description: "Volume-Weighted Average Price · CME session (17:00 CT)",
  },
  {
    key: "showClusterStat",
    label: "Cluster Statistic",
    description: "Per-bar Ask/Bid/Delta/Vol panel under the chart",
  },
];

export function IndicatorsButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Subscribe to the whole settings object — the dropdown is rare
  // enough (open on click) that the extra rerender cost is negligible.
  const settings = useFootprintSettingsStore();
  const toggle = useFootprintSettingsStore((s) => s.toggle);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount = INDICATORS.filter((it) => settings[it.key]).length;

  return (
    <div className="ind-btn-wrap" ref={containerRef}>
      <button
        type="button"
        className={`ind-btn ${open ? "ind-btn-open" : ""} ${activeCount > 0 ? "ind-btn-has-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Indicators"
        aria-label="Indicators"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="ind-icon" aria-hidden>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 17l4-6 4 4 4-9 4 7 2-1" />
          </svg>
        </span>
        <span className="ind-label">Indicators</span>
        {activeCount > 0 && <span className="ind-count">{activeCount}</span>}
        <span className="ind-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ind-menu" role="menu">
          {INDICATORS.length === 0 ? (
            <div className="ind-empty">No indicators yet</div>
          ) : (
            INDICATORS.map((it) => {
              const active = !!settings[it.key];
              return (
                <button
                  key={it.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  className={`ind-row ${active ? "ind-row-active" : ""}`}
                  onClick={() => toggle(it.key)}
                >
                  <span className={`ind-check ${active ? "ind-check-on" : ""}`} aria-hidden>
                    {active ? "✓" : ""}
                  </span>
                  <span className="ind-row-text">
                    <span className="ind-row-label">{it.label}</span>
                    {it.description && (
                      <span className="ind-row-desc">{it.description}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
