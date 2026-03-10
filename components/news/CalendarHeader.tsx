'use client';

import { useNewsSettingsStore } from '@/stores/useNewsSettingsStore';
import { useEventNotifications } from '@/hooks/useEventNotifications';
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
  dataSource,
  onRefresh,
  events,
}: {
  isLoading: boolean;
  lastUpdate: Date | null;
  totalToday: number;
  nextHighImpact: EconomicEvent | null;
  dataSource: 'forex-factory' | 'simulation' | null;
  onRefresh: () => void;
  events: EconomicEvent[];
}) {
  const isLive = dataSource === 'forex-factory';

  const notificationsEnabled = useNewsSettingsStore(s => s.notificationsEnabled);
  const notificationLeadMinutes = useNewsSettingsStore(s => s.notificationLeadMinutes);
  const toggleNotifications = useNewsSettingsStore(s => s.toggleNotifications);
  const setNotificationLead = useNewsSettingsStore(s => s.setNotificationLead);

  const { permission, requestPermission } = useEventNotifications(
    events,
    notificationsEnabled,
    notificationLeadMinutes,
  );

  const handleBellClick = async () => {
    if (notificationsEnabled) {
      toggleNotifications();
      return;
    }
    const perm = permission === 'default' ? await requestPermission() : permission;
    if (perm === 'granted') toggleNotifications();
  };

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-[var(--primary-glow)]">
            <CalendarIcon size={20} color="#fff" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[var(--text-primary)] leading-tight">Economic Calendar</h1>
              {isLive && (
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              {isLive ? 'Forex Factory — real-time economic data' : 'High-impact events & releases'}
            </p>
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

          {/* Notification bell */}
          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleBellClick}
              className="p-2 rounded-lg border transition-all duration-200 active:scale-95"
              style={{
                backgroundColor: notificationsEnabled ? 'var(--primary)' : 'var(--surface-elevated)',
                borderColor: notificationsEnabled ? 'var(--primary)' : 'var(--border)',
                color: notificationsEnabled ? '#fff' : 'var(--text-muted)',
              }}
              title={notificationsEnabled ? 'Disable notifications' : 'Enable notifications (high-impact events)'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={notificationsEnabled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
            {notificationsEnabled && (
              <select
                value={notificationLeadMinutes}
                onChange={e => setNotificationLead(Number(e.target.value))}
                className="h-7 px-1.5 rounded text-[10px] font-medium border appearance-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--surface-elevated)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                <option value={5}>5m</option>
                <option value={15}>15m</option>
                <option value={30}>30m</option>
              </select>
            )}
          </div>

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
