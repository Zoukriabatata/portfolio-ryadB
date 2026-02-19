const LEGEND = [
  { label: 'High', color: 'bg-red-500', glow: 'shadow-red-500/50' },
  { label: 'Medium', color: 'bg-orange-500', glow: 'shadow-orange-500/50' },
  { label: 'Low', color: 'bg-yellow-500', glow: 'shadow-yellow-500/50' },
];

export function CalendarFooter({ simulationMode }: { simulationMode: boolean }) {
  return (
    <div className="flex-shrink-0 px-4 py-2 border-t border-[var(--border)]">
      <div className="flex items-center justify-center gap-5 text-[11px] text-[var(--text-muted)]">
        {LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded shadow-sm ${item.glow} ${item.color}`} />
            <span>{item.label}</span>
          </div>
        ))}
        {simulationMode && (
          <>
            <span className="text-[var(--border-light)]">|</span>
            <span className="text-[var(--primary)] font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
              Simulation active
            </span>
          </>
        )}
        <span className="text-[var(--border-light)]">|</span>
        <span className="text-[var(--text-dimmed)]">Data simulated for demo</span>
      </div>
    </div>
  );
}
