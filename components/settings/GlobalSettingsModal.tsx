'use client';

import { useState, useEffect } from 'react';
import { usePreferencesStore, TRADE_COLOR_PRESETS, type UIDensity } from '@/stores/usePreferencesStore';
import { useUIThemeStore, UI_THEMES, type UIThemeId } from '@/stores/useUIThemeStore';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'trading' | 'chart';

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
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[520px] max-h-[80vh] rounded-xl overflow-hidden shadow-2xl flex"
        style={{
          backgroundColor: 'rgba(20, 20, 28, 0.98)',
          border: '1px solid rgba(255,255,255,0.08)',
          animation: 'settingsIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-[140px] flex flex-col border-r" style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <div className="px-3 py-3">
            <h2 className="text-xs font-semibold text-white/70 flex items-center gap-1.5">
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
                  backgroundColor: tab === t.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: tab === t.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
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
            className="absolute top-2.5 right-2.5 w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors z-10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'chart' && <ChartTab />}
          {tab === 'trading' && <TradingTab />}
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
      <h3 className="text-[10px] font-semibold text-white/30 uppercase tracking-wider mb-2.5 px-4">{title}</h3>
      <div className="space-y-2 px-4">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-xs text-white/70">{label}</div>
        {description && <div className="text-[10px] text-white/30 mt-0.5">{description}</div>}
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
      style={{ backgroundColor: checked ? 'var(--primary)' : 'rgba(255,255,255,0.1)' }}
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
  const { activeTheme, setTheme } = useUIThemeStore();
  const { density, setDensity, fontSize, setFontSize } = usePreferencesStore();

  return (
    <div className="py-4">
      <Section title="Theme">
        <div className="grid grid-cols-2 gap-2">
          {UI_THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left"
              style={{
                backgroundColor: activeTheme === theme.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${activeTheme === theme.id ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {/* Color preview dots */}
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.bg, border: '1px solid rgba(255,255,255,0.15)' }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.primary }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.preview.accent }} />
              </div>
              <div>
                <div className="text-[11px] font-medium text-white/80">{theme.name}</div>
                <div className="text-[9px] text-white/30">{theme.description}</div>
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
                backgroundColor: density === d ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                color: density === d ? '#fff' : 'rgba(255,255,255,0.5)',
                border: `1px solid ${density === d ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
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
            className="w-7 h-7 rounded flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors text-sm"
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
            className="w-7 h-7 rounded flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors text-base font-bold"
            disabled={fontSize >= 16}
          >
            A
          </button>
          <span className="text-[11px] font-mono text-white/40 w-8 text-center">{fontSize}px</span>
        </div>
      </Section>
    </div>
  );
}

// ─── CHART TAB ───────────────────────────────────────────────

function ChartTab() {
  const { showVolume, setShowVolume, showGrid, setShowGrid, showCrosshairTooltip, setShowCrosshairTooltip } = usePreferencesStore();
  const { tradeColorPreset, setTradeColorPreset } = usePreferencesStore();

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
                backgroundColor: tradeColorPreset === key ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${tradeColorPreset === key ? 'var(--primary)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.buy }} />
                <div className="w-4 h-4 rounded" style={{ backgroundColor: preset.sell }} />
              </div>
              <span className="text-[11px] text-white/60 capitalize">{key.replace('_', ' / ')}</span>
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
                  backgroundColor: defaultOrderType === t ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                  color: defaultOrderType === t ? '#fff' : 'rgba(255,255,255,0.5)',
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
              <span className="text-white/50">{desc}</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                {key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-white/25 mt-2">
          Trading shortcuts only work when the trade bar is open.
        </div>
      </Section>
    </div>
  );
}
