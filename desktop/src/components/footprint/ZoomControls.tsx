// Phase B / M4.7a — floating zoom toolbar (TradingView-style).
//
// Sits absolutely positioned at the bottom-right of the canvas
// container. The parent (CryptoFootprint) is responsible for
// `position: relative` on the container so this widget anchors to
// the canvas viewport, not the page.

import "./ZoomControls.css";

type Props = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
};

export function ZoomControls({ onZoomIn, onZoomOut, onReset }: Props) {
  return (
    <div className="zc-stack" role="toolbar" aria-label="Chart zoom">
      <button
        type="button"
        className="zc-btn"
        onClick={onZoomIn}
        title="Zoom in (or wheel up)"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        className="zc-btn"
        onClick={onZoomOut}
        title="Zoom out (or wheel down)"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        className="zc-btn zc-reset"
        onClick={onReset}
        title="Reset view"
        aria-label="Reset view"
      >
        ⟲
      </button>
    </div>
  );
}
