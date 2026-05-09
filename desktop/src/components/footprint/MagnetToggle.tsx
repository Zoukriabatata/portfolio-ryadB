// Phase B / M4.7b — magnet mode toggle button.
//
// Single button that cycles through the three magnet states:
//   none → OHLC → POC → none
//
// Crosshair Y snap behaviour lives in
// FootprintCanvasRenderer.computeMagnetSnap; this component is
// purely presentational + handles the click. The active mode is
// persisted in `useFootprintSettingsStore` (localStorage).

import { useFootprintSettingsStore } from "../../stores/useFootprintSettingsStore";
import "./MagnetToggle.css";

const MODE_TITLE: Record<"none" | "ohlc" | "poc", string> = {
  none: "Magnet: off (click to enable OHLC snap)",
  ohlc: "Magnet: OHLC (click to switch to POC)",
  poc: "Magnet: POC (click to disable)",
};

export function MagnetToggle() {
  const magnetMode = useFootprintSettingsStore((s) => s.magnetMode);
  const cycleMagnetMode = useFootprintSettingsStore((s) => s.cycleMagnetMode);

  const active = magnetMode !== "none";

  return (
    <button
      type="button"
      className={`mag-btn ${active ? "mag-btn-active" : ""}`}
      onClick={cycleMagnetMode}
      title={MODE_TITLE[magnetMode]}
      aria-label={MODE_TITLE[magnetMode]}
      aria-pressed={active}
    >
      <span className="mag-icon" aria-hidden>
        {/* SVG magnet glyph — emoji rendering varies across OS, this
         *  vector path is consistent on Win/Mac/Linux. */}
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
          <path d="M6 4v8a6 6 0 0 0 12 0V4h-3v8a3 3 0 0 1-6 0V4z" />
          <line x1="6" y1="4" x2="9" y2="4" />
          <line x1="15" y1="4" x2="18" y2="4" />
        </svg>
      </span>
      {active && (
        <span className="mag-mode">{magnetMode.toUpperCase()}</span>
      )}
    </button>
  );
}
