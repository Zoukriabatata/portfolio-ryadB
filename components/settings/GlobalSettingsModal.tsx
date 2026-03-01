'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePreferencesStore, TRADE_COLOR_PRESETS, type UIDensity } from '@/stores/usePreferencesStore';
import { useUIThemeStore, UI_THEMES, type UIThemeId } from '@/stores/useUIThemeStore';
import { syncFootprintWithUITheme } from '@/stores/useFootprintSettingsStore';
import {
  CATEGORIES,
  exportAllSettings,
  downloadSettings,
  validateSettingsFile,
  importSettings,
  resetAllSettings,
} from '@/lib/settings/SettingsPortability';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'trading' | 'chart' | 'data';

export default function GlobalSettingsModal({ isOpen, onClose }: GlobalSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('appearance');

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'appearance',
      label: 'Appearance',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ),
    },
    {
      id: 'chart',
      label: 'Chart',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 3v18h18" />
          <path d="M7 16l4-8 4 4 4-6" />
        </svg>
      ),
    },
    {
      id: 'trading',
      label: 'Trading',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      id: 'data',
      label: 'Data',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" />
      <div
        className="relative w-[520px] max-h-[80vh] rounded-xl overflow-hidden shadow-2xl flex animate-scaleIn"
        style={{
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-light)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-[140px] flex flex-col border-r" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}>
          <div className="px-3 py-3">
            <h2 className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              Settings
            </h2>
          </div>
          <div className="flex flex-col gap-0.5 px-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors text-left"
                style={{
                  backgroundColor: tab === t.id ? 'var(--surface-elevated)' : 'transparent',
                  color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 w-6 h-6 rounded flex items-center justify-center transition-colors z-10"
            style={{ color: 'var(--text-dimmed)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'chart' && <ChartTab />}
          {tab === 'trading' && <TradingTab />}
          {tab === 'data' && <DataTab />}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes settingsIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      ` }} />
    </div>
  );
}

// ─── Section helper ──────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[10px] font-semibold text-[var(--text-dimmed)] uppercase tracking-wider mb-2.5 px-4">{title}</h3>
      <div className="space-y-2 px-4">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-xs text-[var(--text-secondary)]">{label}</div>
        {description && <div className="text-[10px] text-[var(--text-dimmed)] mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-8 h-[18px] rounded-full relative transition-colors"
      style={{ backgroundColor: checked ? 'var(--primary)' : 'var(--border)' }}
    >
      <div
        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform"
        style={{ left: checked ? 14 : 2 }}
      />
    </button>
  );
}

// ─── APPEARANCE TAB ──────────────────────────────────────────

function AppearanceTab() {
  const { activeTheme, setTheme, autoMode, setAutoMode } = useUIThemeStore();
  const { density, setDensity, fontSize, setFontSize } = usePreferencesStore();

  return (
    <div className="py-4">
      <Section title="Theme">
        <SettingRow label="Auto (follow system)" description="Switch theme based on OS dark/light mode">
          <Toggle checked={autoMode} onChange={setAutoMode} />
        </SettingRow>
        <div className={`grid grid-cols-2 gap-2 mt-2 ${autoMode ? 'opacity-50 pointer-events-none' : ''}`}>
          {UI_THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => { setTheme(theme.id); syncFootprintWithUITheme(theme.id); }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left"
              style={{
                backgroundColor: activeTheme === theme.id ? 'var(--surface-elevated)' : 'var(--surface)',
                border: `1px solid ${activeTheme === theme.id ? 'var(--primary)' : 'var(--surface-elevated)'}`,
              }}
            >
              {/* Color preview dots */}
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.bg, border: '1px solid var(--border-light)' }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
              </div>
              <div>
                <div className="text-[11px] font-medium text-[var(--text-primary)]">{theme.name}</div>
                <div className="text-[9px] text-[var(--text-dimmed)]">{theme.description}</div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="UI Density">
        <div className="flex gap-1.5">
          {(['compact', 'normal', 'comfortable'] as UIDensity[]).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium capitalize transition-colors"
              style={{
                backgroundColor: density === d ? 'var(--primary)' : 'var(--surface)',
                color: density === d ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${density === d ? 'var(--primary)' : 'var(--surface-elevated)'}`,
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Font Size">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setFontSize(fontSize - 1)}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-dimmed)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors text-sm"
            disabled={fontSize <= 10}
          >
            A
          </button>
          <div className="flex-1 relative">
            <input
              type="range"
              min={10}
              max={16}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-full accent-[var(--primary)]"
              style={{ height: 4 }}
            />
          </div>
          <button
            onClick={() => setFontSize(fontSize + 1)}
            className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-dimmed)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors text-base font-bold"
            disabled={fontSize >= 16}
          >
            A
          </button>
          <span className="text-[11px] font-mono text-[var(--text-dimmed)] w-8 text-center">{fontSize}px</span>
        </div>
      </Section>
    </div>
  );
}

// ─── CHART TAB ───────────────────────────────────────────────

function ChartTab() {
  const { showVolume, setShowVolume, showGrid, setShowGrid, showCrosshairTooltip, setShowCrosshairTooltip, tradeColorPreset, setTradeColorPreset } = usePreferencesStore();

  return (
    <div className="py-4">
      <Section title="Display">
        <SettingRow label="Show Volume" description="Volume histogram below candles">
          <Toggle checked={showVolume} onChange={setShowVolume} />
        </SettingRow>
        <SettingRow label="Show Grid" description="Background grid lines">
          <Toggle checked={showGrid} onChange={setShowGrid} />
        </SettingRow>
        <SettingRow label="Crosshair Tooltip" description="OHLCV data on hover">
          <Toggle checked={showCrosshairTooltip} onChange={setShowCrosshairTooltip} />
        </SettingRow>
      </Section>

      <Section title="Trade Colors">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(TRADE_COLOR_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setTradeColorPreset(key)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left"
              style={{
                backgroundColor: tradeColorPreset === key ? 'var(--surface-elevated)' : 'var(--surface)',
                border: `1px solid ${tradeColorPreset === key ? 'var(--primary)' : 'var(--surface-elevated)'}`,
              }}
            >
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.buy }} />
                <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.sell }} />
              </div>
              <span className="text-[11px] text-[var(--text-muted)] capitalize">{key.replace('_', ' / ')}</span>
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── TRADING TAB ─────────────────────────────────────────────

function TradingTab() {
  const { confirmOrders, setConfirmOrders, defaultOrderType, setDefaultOrderType } = usePreferencesStore();

  return (
    <div className="py-4">
      <Section title="Order Defaults">
        <SettingRow label="Confirm Orders" description="Show confirmation before placing">
          <Toggle checked={confirmOrders} onChange={setConfirmOrders} />
        </SettingRow>
        <SettingRow label="Default Order Type">
          <div className="flex gap-1">
            {(['market', 'limit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDefaultOrderType(t)}
                className="px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-colors"
                style={{
                  backgroundColor: defaultOrderType === t ? 'var(--primary)' : 'var(--surface)',
                  color: defaultOrderType === t ? '#fff' : 'var(--text-muted)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      <Section title="Keyboard Shortcuts">
        <div className="space-y-1 text-[11px]">
          {[
            ['B', 'Quick Buy (market)'],
            ['S', 'Quick Sell (market)'],
            ['X', 'Close position'],
            ['F', 'Flatten all'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between py-1">
              <span className="text-[var(--text-dimmed)]">{desc}</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--surface-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-[var(--text-dimmed)] mt-2">
          Trading shortcuts only work when the trade bar is open.
        </div>
      </Section>
    </div>
  );
}

// ─── DATA TAB ─────────────────────────────────────────────────

function DataTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    CATEGORIES.map(c => c.id)
  );
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  }, []);

  const handleExport = useCallback(() => {
    const data = exportAllSettings(selectedCategories);
    downloadSettings(data);
  }, [selectedCategories]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!validateSettingsFile(data)) {
          setImportResult({ imported: 0, errors: 1 });
          return;
        }
        const result = importSettings(data, selectedCategories);
        setImportResult({ imported: result.imported.length, errors: result.errors.length });

        if (result.imported.length > 0) {
          setTimeout(() => window.location.reload(), 1500);
        }
      } catch {
        setImportResult({ imported: 0, errors: 1 });
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  }, [selectedCategories]);

  const handleReset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    resetAllSettings();
    window.location.reload();
  }, [confirmReset]);

  return (
    <div className="py-4">
      <Section title="Categories">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
              style={{
                backgroundColor: selectedCategories.includes(cat.id) ? 'var(--primary)' : 'var(--surface)',
                color: selectedCategories.includes(cat.id) ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${selectedCategories.includes(cat.id) ? 'var(--primary)' : 'var(--surface-elevated)'}`,
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Export / Import">
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            disabled={selectedCategories.length === 0}
            className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            Export Settings
          </button>
          <button
            onClick={handleImportClick}
            disabled={selectedCategories.length === 0}
            className="flex-1 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            Import Settings
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {importResult && (
          <div className="mt-2 px-3 py-2 rounded text-[11px]" style={{
            backgroundColor: importResult.errors > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            color: importResult.errors > 0 ? '#ef4444' : '#22c55e',
            border: `1px solid ${importResult.errors > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`,
          }}>
            {importResult.errors > 0
              ? `Import failed — invalid file format`
              : `Imported ${importResult.imported} settings. Reloading...`
            }
          </div>
        )}

        <div className="text-[10px] text-[var(--text-dimmed)] mt-2">
          Export downloads a JSON file with selected categories. Import restores settings and reloads the page.
        </div>
      </Section>

      <Section title="Danger Zone">
        <button
          onClick={handleReset}
          className="w-full px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: confirmReset ? '#ef4444' : 'var(--surface)',
            color: confirmReset ? '#fff' : '#ef4444',
            border: `1px solid ${confirmReset ? '#ef4444' : 'rgba(239,68,68,0.3)'}`,
          }}
        >
          {confirmReset ? 'Click again to confirm reset' : 'Reset All Settings'}
        </button>
        <div className="text-[10px] text-[var(--text-dimmed)] mt-1">
          This clears all saved preferences, themes, tool settings, and templates. Cannot be undone.
        </div>
      </Section>
    </div>
  );
}
