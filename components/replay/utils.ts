/**
 * Replay utility functions
 */

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(timestamp: number): string {
  if (!timestamp) return '--:--:--';
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Speed multipliers: real-time fractions, standard multiples, and time-skip modes
// Time-skip: e.g. 300 = 5 minutes of market time per 1 second of real time
export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 10, 15, 30, 60, 300, 900, 1800, 3600, 14400] as const;

// Human-readable labels for speed options
export function getSpeedLabel(speed: number): string {
  if (speed < 1) return `${speed}x`;
  if (speed <= 10) return `${speed}x`;
  if (speed === 15) return '15s';
  if (speed === 30) return '30s';
  if (speed === 60) return '1m';
  if (speed === 300) return '5m';
  if (speed === 900) return '15m';
  if (speed === 1800) return '30m';
  if (speed === 3600) return '1H';
  if (speed === 14400) return '4H';
  return `${speed}x`;
}
