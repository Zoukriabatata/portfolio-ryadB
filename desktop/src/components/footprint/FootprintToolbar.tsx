import type { ReactNode } from "react";
import "./FootprintToolbar.css";

export type FootprintTool = {
  /** Stable identifier used as the React key. */
  id: string;
  /** Tooltip + aria-label. */
  label: string;
  /** SVG (or any node) rendered inside the button. Should use
   *  `currentColor` for the stroke so the active/inactive state
   *  drives the colour via CSS. */
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  /** Where the button sits in the toolbar. "top" (default) stacks
   *  at the top; "bottom" pushes the button to the bottom via a
   *  flex spacer — useful for destructive actions (trash) and
   *  pinned utilities (settings) that should sit apart from the
   *  primary tool set. */
  position?: "top" | "bottom";
};

export function FootprintToolbar({ tools }: { tools: FootprintTool[] }) {
  const top = tools.filter((t) => t.position !== "bottom");
  const bottom = tools.filter((t) => t.position === "bottom");
  return (
    <aside className="footprint-toolbar" aria-label="Footprint tools">
      {top.map(renderTool)}
      {bottom.length > 0 && (
        <>
          <div className="fp-toolbar-spacer" aria-hidden />
          {bottom.map(renderTool)}
        </>
      )}
    </aside>
  );
}

function renderTool(tool: FootprintTool) {
  return (
    <button
      key={tool.id}
      type="button"
      className={`fp-tool ${tool.active ? "fp-tool-active" : ""}`}
      onClick={tool.onClick}
      aria-label={tool.label}
      aria-pressed={tool.active}
      title={tool.label}
    >
      {tool.icon}
    </button>
  );
}

export function IconCrosshair() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M12 3V8M12 16V21M3 12H8M16 12H21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

export function IconLong() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Reward zone (top) + risk zone (bottom) stacked around the entry
          line, with an up arrow marking the bullish direction. */}
      <rect x="4" y="6" width="16" height="5" rx="1" fill="#7ed321" fillOpacity="0.25" />
      <rect x="4" y="13" width="16" height="3" rx="1" fill="#ff4757" fillOpacity="0.25" />
      <path d="M4 12H20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M12 9V3M12 3L9 6M12 3L15 6"
        stroke="#7ed321"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconShort() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Mirror of IconLong: risk zone on top, reward zone on bottom,
          down arrow marking the bearish direction. */}
      <rect x="4" y="8" width="16" height="3" rx="1" fill="#ff4757" fillOpacity="0.25" />
      <rect x="4" y="13" width="16" height="5" rx="1" fill="#7ed321" fillOpacity="0.25" />
      <path d="M4 12H20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M12 15V21M12 21L9 18M12 21L15 18"
        stroke="#ff4757"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconHLine() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Full-width horizontal line with two end-caps for visual
          weight, signaling "infinite horizontal". */}
      <path
        d="M2 12H22"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="4" cy="12" r="1.4" fill="currentColor" />
      <circle cx="20" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconHRay() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Anchor point on the left, horizontal segment, arrowhead on
          the right → "horizontal ray going forward". */}
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <path
        d="M7 12H19"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M16 8L20 12L16 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconRect() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Axis-aligned rectangle outline with corner dots to hint at
          the resize handles available on the drawing. */}
      <rect
        x="4.5"
        y="6.5"
        width="15"
        height="11"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="4.5" cy="6.5" r="1.4" fill="currentColor" />
      <circle cx="19.5" cy="6.5" r="1.4" fill="currentColor" />
      <circle cx="4.5" cy="17.5" r="1.4" fill="currentColor" />
      <circle cx="19.5" cy="17.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconTrend() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Diagonal segment between two endpoints (filled circles). */}
      <circle cx="5" cy="18" r="2.2" fill="currentColor" />
      <circle cx="19" cy="6" r="2.2" fill="currentColor" />
      <path
        d="M6 17L18 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconText() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Capital "T" — top bar + descending stem. Reads as the
          universal "text annotation" glyph (Photoshop, Figma,
          TradingView all use the same). */}
      <path
        d="M5 6H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 6V19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 19H15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

export function IconRuler() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Diagonal ruler segment with two endpoints + tick marks at
          1/3 and 2/3 — reads as "measure between A and B". */}
      <circle cx="5" cy="18" r="2" fill="currentColor" />
      <circle cx="19" cy="6" r="2" fill="currentColor" />
      <path
        d="M5.7 17.3L18.3 6.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M9.5 14.5L8 13M14.5 9.5L13 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      {/* Trash bin: lid + body + 2 vertical strokes inside. */}
      <path
        d="M4 7H20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 4H14M9 7V19C9 19.55 9.45 20 10 20H14C14.55 20 15 19.55 15 19V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M6 7L7 20C7 20.55 7.45 21 8 21H16C16.55 21 17 20.55 17 20L18 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M11 11V17M13 11V17"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}
