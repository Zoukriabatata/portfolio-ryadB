// Right-click context menu for the footprint chart. Floats at the
// click point with viewport-clamping so it never spills off-screen,
// closes on outside-click / Escape / item-activation. Visual chrome
// matches the AdvancedSettingsModal / SymbolPickerModal so all the
// floating surfaces feel like the same product.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./ChartContextMenu.css";

export type ChartContextMenuItem = {
  /** Stable key for React. */
  id: string;
  /** Visible row label. */
  label: string;
  /** Optional right-hand aside (e.g. the captured price). */
  detail?: string;
  /** Inline SVG / glyph rendered before the label. */
  icon?: ReactNode;
  /** Optional separator before this row (for grouping). */
  divider?: boolean;
  /** Disabled rows still render but ignore clicks (e.g. Paste when
   *  the clipboard doesn't hold a number). */
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  /** Anchor in viewport coordinates (clientX / clientY). */
  x: number;
  y: number;
  items: ChartContextMenuItem[];
  onClose: () => void;
};

export function ChartContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Position state — initialised at the click point, then nudged in
  // useLayoutEffect once the actual menu size is known so the box
  // never overflows the viewport (bottom-right click → menu opens
  // upward / leftward).
  const [pos, setPos] = useState<{ x: number; y: number }>({ x, y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    let nx = x;
    let ny = y;
    if (nx + rect.width + margin > vw) nx = vw - rect.width - margin;
    if (ny + rect.height + margin > vh) ny = vh - rect.height - margin;
    if (nx < margin) nx = margin;
    if (ny < margin) ny = margin;
    setPos({ x: nx, y: ny });
  }, [x, y, items.length]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Capture phase so the click that closes the menu doesn't also
    // get treated as a regular chart click underneath.
    window.addEventListener("mousedown", onDocClick, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocClick, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="ccm"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => (
        <div key={it.id}>
          {it.divider && <div className="ccm-divider" />}
          <button
            type="button"
            role="menuitem"
            className={`ccm-row ${it.disabled ? "ccm-row-disabled" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return;
              it.onSelect();
              onClose();
            }}
          >
            <span className="ccm-icon" aria-hidden>
              {it.icon}
            </span>
            <span className="ccm-label">{it.label}</span>
            {it.detail && <span className="ccm-detail">{it.detail}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────

export function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <rect
        x="8" y="8" width="12" height="12" rx="2"
        stroke="currentColor" strokeWidth="1.6"
      />
      <path
        d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPaste() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <rect
        x="6" y="5" width="12" height="16" rx="2"
        stroke="currentColor" strokeWidth="1.6"
      />
      <rect
        x="9" y="3" width="6" height="4" rx="1"
        stroke="currentColor" strokeWidth="1.6"
      />
      <path
        d="M9 12h6M9 15h6"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBell() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16z"
        stroke="currentColor" strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 21h4"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
      />
    </svg>
  );
}

export function IconReset() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 3v5h5"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
      <circle
        cx="12" cy="12" r="3"
        stroke="currentColor" strokeWidth="1.6"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor" strokeWidth="1.4"
      />
    </svg>
  );
}
