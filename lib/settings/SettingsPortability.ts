/**
 * SETTINGS PORTABILITY — Export/Import all app settings via JSON.
 *
 * Gathers all persisted Zustand stores from localStorage and packages
 * them into a portable JSON file. Import validates and restores them.
 */

// ============ STORE MANIFEST ============

export interface StoreEntry {
  key: string;
  label: string;
  category: 'appearance' | 'chart' | 'tools' | 'general';
}

export const EXPORTABLE_STORES: StoreEntry[] = [
  // Appearance
  { key: 'senzoukria-ui-theme', label: 'UI Theme', category: 'appearance' },
  { key: 'chart-theme-storage', label: 'Chart Theme', category: 'appearance' },
  { key: 'senzoukria-news-theme', label: 'News Theme', category: 'appearance' },
  // Chart
  { key: 'senzoukria-preferences', label: 'Preferences', category: 'chart' },
  { key: 'chart-templates-storage', label: 'Chart Templates', category: 'chart' },
  { key: 'footprint-settings', label: 'Footprint Settings', category: 'chart' },
  { key: 'heatmap-settings-storage', label: 'Heatmap Settings', category: 'chart' },
  { key: 'indicator-storage', label: 'Indicators', category: 'chart' },
  { key: 'crosshair-settings', label: 'Crosshair', category: 'chart' },
  { key: 'chart-sync-settings', label: 'Chart Sync', category: 'chart' },
  { key: 'chart-timezone', label: 'Timezone', category: 'chart' },
  { key: 'replay-ui-storage', label: 'Replay UI', category: 'chart' },
  // Tools
  { key: 'tool-settings-storage', label: 'Tool Settings & Presets', category: 'tools' },
  { key: 'toolDefaultStyles', label: 'Tool Default Styles', category: 'tools' },
  { key: 'chart-tools-storage', label: 'Chart Tools State', category: 'tools' },
  { key: 'drawing-storage', label: 'Drawings', category: 'tools' },
  { key: 'senzoukria-favorites-toolbar', label: 'Favorites Toolbar', category: 'tools' },
  // General
  { key: 'senzoukria-account-prefs', label: 'Account Preferences', category: 'general' },
  { key: 'senzoukria-alerts', label: 'Alerts', category: 'general' },
  { key: 'senzoukria-watchlist', label: 'Watchlist', category: 'general' },
  { key: 'senzoukria-datafeeds', label: 'Data Feeds', category: 'general' },
];

export const CATEGORIES = [
  { id: 'appearance' as const, label: 'Appearance' },
  { id: 'chart' as const, label: 'Chart' },
  { id: 'tools' as const, label: 'Tools' },
  { id: 'general' as const, label: 'General' },
];

// ============ TYPES ============

export interface SettingsExport {
  version: 1;
  exportedAt: string;
  stores: Record<string, unknown>;
}

export interface ImportResult {
  success: boolean;
  imported: string[];
  skipped: string[];
  errors: string[];
}

// ============ EXPORT ============

export function exportAllSettings(categories?: string[]): SettingsExport {
  const entries = categories
    ? EXPORTABLE_STORES.filter(s => categories.includes(s.category))
    : EXPORTABLE_STORES;

  const stores: Record<string, unknown> = {};
  for (const entry of entries) {
    const raw = localStorage.getItem(entry.key);
    if (raw) {
      try {
        stores[entry.key] = JSON.parse(raw);
      } catch { /* skip corrupt */ }
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

export function downloadSettings(data: SettingsExport, filename?: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `senzoukria-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============ IMPORT ============

export function validateSettingsFile(data: unknown): data is SettingsExport {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.version === 1 && typeof d.stores === 'object' && d.stores !== null;
}

export function importSettings(data: SettingsExport, categories?: string[]): ImportResult {
  const result: ImportResult = { success: true, imported: [], skipped: [], errors: [] };
  const validKeys = new Set(EXPORTABLE_STORES.map(s => s.key));
  const allowedKeys = categories
    ? new Set(EXPORTABLE_STORES.filter(s => categories.includes(s.category)).map(s => s.key))
    : validKeys;

  for (const [key, value] of Object.entries(data.stores)) {
    if (!validKeys.has(key)) {
      result.skipped.push(key);
      continue;
    }
    if (!allowedKeys.has(key)) {
      result.skipped.push(key);
      continue;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      result.imported.push(key);
    } catch (e) {
      result.errors.push(`${key}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  if (result.errors.length > 0) result.success = false;
  return result;
}

// ============ RESET ============

export function resetAllSettings(): void {
  for (const entry of EXPORTABLE_STORES) {
    localStorage.removeItem(entry.key);
  }
}
