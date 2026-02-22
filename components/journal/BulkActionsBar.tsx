'use client';

interface BulkActionsBarProps {
  selectedCount: number;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

export default function BulkActionsBar({ selectedCount, onBulkDelete, onClearSelection }: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/20 animate-fadeIn">
      <span className="text-xs font-medium text-[var(--primary)]">
        {selectedCount} trade{selectedCount > 1 ? 's' : ''} selected
      </span>
      <div className="w-px h-4 bg-[var(--border)]" />
      <button
        onClick={onBulkDelete}
        className="text-xs font-medium text-[var(--error)] px-2 py-1 rounded transition-all hover:bg-[var(--error)]/10 active:scale-95"
      >
        Delete selected
      </button>
      <button
        onClick={onClearSelection}
        className="text-xs text-[var(--text-muted)] px-2 py-1 rounded transition-all hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] active:scale-95"
      >
        Clear selection
      </button>
    </div>
  );
}
