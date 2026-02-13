/**
 * Trading Session Configuration
 * Defines Asia, London, New York sessions with UTC times and colors
 */

export interface TradingSession {
  id: string;
  label: string;
  startUTC: number;  // Hour in UTC (0-23)
  endUTC: number;    // Hour in UTC (0-23)
  color: string;
  enabled: boolean;
}

export const DEFAULT_SESSIONS: TradingSession[] = [
  { id: 'asia',   label: 'Asia',     startUTC: 0,  endUTC: 8,  color: '#f59e0b', enabled: true },
  { id: 'london', label: 'London',   startUTC: 8,  endUTC: 16, color: '#3b82f6', enabled: true },
  { id: 'ny',     label: 'New York', startUTC: 13, endUTC: 21, color: '#22c55e', enabled: true },
];

/**
 * Check if a UTC hour falls within a session
 * Handles sessions that cross midnight (e.g., startUTC: 22, endUTC: 6)
 */
export function isInSession(hourUTC: number, session: TradingSession): boolean {
  if (session.startUTC <= session.endUTC) {
    return hourUTC >= session.startUTC && hourUTC < session.endUTC;
  }
  // Crosses midnight
  return hourUTC >= session.startUTC || hourUTC < session.endUTC;
}

/**
 * Get the active session(s) for a given UTC hour
 */
export function getActiveSessions(hourUTC: number, sessions: TradingSession[]): TradingSession[] {
  return sessions.filter(s => s.enabled && isInSession(hourUTC, s));
}
