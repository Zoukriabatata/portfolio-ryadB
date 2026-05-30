// Native port of `components/journal/BulkActionsBar.tsx` — verbatim
// except the Next.js "use client" pragma is removed (Vite is always
// client-side) and the `--error` token is mapped onto white per the
// Senzoukria noir/blanc/vert palette.

interface BulkActionsBarProps {
  selectedCount: number;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

export default function BulkActionsBar({
  selectedCount,
  onBulkDelete,
  onClearSelection,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#7ed321]/10 border border-[#7ed321]/25 animate-[fadeIn_180ms_ease]">
      <span className="text-xs font-medium text-[#7ed321]">
        {selectedCount} trade{selectedCount > 1 ? "s" : ""} selected
      </span>
      <div className="w-px h-4 bg-white/10" />
      <button
        onClick={onBulkDelete}
        className="text-xs font-medium text-white px-2 py-1 rounded transition-all hover:bg-white/10 active:scale-95"
      >
        Delete selected
      </button>
      <button
        onClick={onClearSelection}
        className="text-xs text-white/55 px-2 py-1 rounded transition-all hover:text-white hover:bg-white/5 active:scale-95"
      >
        Clear selection
      </button>
    </div>
  );
}
