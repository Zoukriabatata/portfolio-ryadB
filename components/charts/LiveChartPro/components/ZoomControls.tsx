interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onScreenshot: () => void;
  theme: {
    colors: {
      surface: string;
      border: string;
      textSecondary: string;
    };
  };
}

export default function ZoomControls({ onZoomIn, onZoomOut, onResetView, onScreenshot, theme }: ZoomControlsProps) {
  return (
    <div
      className="absolute bottom-4 right-4 flex items-center gap-1 p-1 rounded-lg z-20"
      style={{
        backgroundColor: theme.colors.surface + 'dd',
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <button
        onClick={onZoomIn}
        className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ color: theme.colors.textSecondary }}
        data-tooltip="Zoom In  [+]" data-tooltip-pos="top"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button
        onClick={onZoomOut}
        className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ color: theme.colors.textSecondary }}
        data-tooltip="Zoom Out  [-]" data-tooltip-pos="top"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <div className="w-px h-5 bg-zinc-700" />
      <button
        onClick={onResetView}
        className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ color: theme.colors.textSecondary }}
        data-tooltip="Fit Content  [Ctrl+0]" data-tooltip-pos="top"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
      <div className="w-px h-5 bg-zinc-700" />
      <button
        onClick={onScreenshot}
        className="w-7 h-7 rounded flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{ color: theme.colors.textSecondary }}
        data-tooltip="Screenshot  [Ctrl+Shift+S]" data-tooltip-pos="top"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
    </div>
  );
}
