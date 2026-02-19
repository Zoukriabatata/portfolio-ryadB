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
        className="text-xs font-medium text-[var(--error)] hover:text-[var(--error)] hover:underline transition-colors"
      >
        Delete selected
      </button>
      <button
        onClick={onClearSelection}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
      >
        Clear selection
      </button>
    </div>
  );
}
