import { CalendarIcon, RefreshIcon } from '@/components/ui/Icons';
import { ThemeSelector } from './ThemeSelector';
import type { EconomicEvent } from '@/types/news';

function formatCountdown(timeStr: string): string {
  const diff = new Date(timeStr).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function CalendarHeader({
  isLoading,
  lastUpdate,
  totalToday,
  nextHighImpact,
  onRefresh,
}: {
  isLoading: boolean;
  lastUpdate: Date | null;
  totalToday: number;
  nextHighImpact: EconomicEvent | null;
  onRefresh: () => void;
}) {
  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-[var(--primary-glow)]">
            <CalendarIcon size={20} color="#fff" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)] leading-tight">Economic Calendar</h1>
            <p className="text-[11px] text-[var(--text-muted)]">High-impact events & releases</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Event count */}
          {totalToday > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              {totalToday} event{totalToday > 1 ? 's' : ''}
            </span>
          )}

          {/* Next high-impact countdown */}
          {nextHighImpact && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Next in {formatCountdown(nextHighImpact.time)}
            </span>
          )}

          {/* Last update */}
          {lastUpdate && (
            <span className="text-[11px] text-[var(--text-dimmed)] hidden lg:block tabular-nums">
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}

          {/* Theme selector */}
          <ThemeSelector />

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)] transition-all duration-200 disabled:opacity-50 active:scale-95"
          >
            <RefreshIcon size={15} color="currentColor" className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
}
