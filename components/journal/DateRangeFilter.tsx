'use client';

import { useJournalStore } from '@/stores/useJournalStore';

export default function DateRangeFilter() {
  const { dashboardDateRange, setDashboardDateRange } = useJournalStore();

  const presets = [
    { label: 'All Time', from: null, to: null },
    { label: '7D', from: daysAgo(7), to: null },
    { label: '30D', from: daysAgo(30), to: null },
    { label: '90D', from: daysAgo(90), to: null },
    { label: 'YTD', from: `${new Date().getFullYear()}-01-01`, to: null },
  ];

  const isActive = (p: typeof presets[0]) =>
    dashboardDateRange.from === p.from && dashboardDateRange.to === p.to;

  const inputStyle = 'px-2.5 py-1 rounded-lg text-xs bg-[var(--surface)] border border-[var(--border-light)] text-[var(--text-primary)] focus:border-[var(--border-focus)] focus:outline-none transition-colors';

  return (
    <div className="flex items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => setDashboardDateRange({ from: p.from, to: p.to })}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            isActive(p)
              ? 'bg-[var(--primary)] text-[var(--background)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          {p.label}
        </button>
      ))}

      <div className="w-px h-4 bg-[var(--border)] mx-1" />

      <input
        type="date"
        value={dashboardDateRange.from || ''}
        onChange={(e) => setDashboardDateRange({ ...dashboardDateRange, from: e.target.value || null })}
        className={inputStyle}
      />
      <span className="text-[var(--text-dimmed)] text-xs">to</span>
      <input
        type="date"
        value={dashboardDateRange.to || ''}
        onChange={(e) => setDashboardDateRange({ ...dashboardDateRange, to: e.target.value || null })}
        className={inputStyle}
      />
    </div>
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
