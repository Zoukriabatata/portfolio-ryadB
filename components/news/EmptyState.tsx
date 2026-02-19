import { CalendarIcon } from '@/components/ui/Icons';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-80 animate-fadeIn">
      <div className="w-20 h-20 rounded-2xl bg-[var(--surface-elevated)] flex items-center justify-center mb-5 border border-[var(--border)] shadow-lg">
        <CalendarIcon size={36} color="var(--text-dimmed)" />
      </div>
      <p className="text-[var(--text-secondary)] font-semibold text-lg mb-1.5">No events found</p>
      <p className="text-[var(--text-muted)] text-sm max-w-xs text-center leading-relaxed">
        Try changing the time period, selecting different currencies, or adjusting the impact filter.
      </p>
    </div>
  );
}
