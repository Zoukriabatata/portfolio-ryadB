'use client';

/**
 * FOOTPRINT ADVANCED SETTINGS — Professional Order Flow Platform UI
 *
 * Architecture: 6-tab modal matching ATAS / MotiveWave / Sierra Chart standards
 *
 *  CHART      — Theme, candles, background, grid, font, crosshair, price line
 *  FOOTPRINT  — Bid×Ask display, heatmap, cluster mode, volume filter, aggregation
 *  ORDERFLOW  — Imbalance, stacked imbalance, absorption, exhaustion, iceberg,
 *               cluster filters, large trades, CVD
 *  PROFILE    — Volume profile (with mode selector), POC, developing POC,
 *               naked POC, unfinished auctions, TPO / market profile
 *  AVERAGES   — VWAP (+ std dev bands), TWAP  — grouped as benchmark prices
 *  DISPLAY    — Layout, panels, passive liquidity, volume bubbles
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  useFootprintSettingsStore,
  COLOR_PRESETS,
  THEME_LABELS,
} from '@/stores/useFootprintSettingsStore';
import { useCrosshairStore, type CrosshairLineStyle, type MagnetMode } from '@/stores/useCrosshairStore';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface FootprintAdvancedSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

type Tab = 'chart' | 'footprint' | 'orderflow' | 'profile' | 'averages' | 'display';

// ─────────────────────────────────────────────────────────────────────────────
// INLINE PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/** Compact toggle switch */
function Toggle({
  value,
  onChange,
  accent = 'emerald',
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    emerald: 'bg-emerald-500',
    amber:   'bg-amber-500',
    blue:    'bg-blue-500',
    violet:  'bg-violet-500',
    rose:    'bg-rose-500',
    cyan:    'bg-cyan-500',
    indigo:  'bg-indigo-500',
    orange:  'bg-orange-500',
  };
  const bg = value ? (accentMap[accent] ?? 'bg-emerald-500') : 'bg-[var(--surface-elevated)]';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`w-9 h-[18px] rounded-full transition-colors flex-shrink-0 ${bg}`}
    >
      <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** Label + right-slot row */
function Row({
  label,
  sub,
  children,
  indent = false,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between min-h-[28px] ${indent ? 'pl-3' : ''}`}>
      <div>
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        {sub && <span className="block text-[10px] text-[var(--text-muted)]/50">{sub}</span>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/** Slider with label */
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt,
  accent = 'emerald',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    emerald: 'accent-emerald-500',
    amber:   'accent-amber-500',
    blue:    'accent-blue-500',
    violet:  'accent-violet-500',
    rose:    'accent-rose-500',
    indigo:  'accent-indigo-500',
    orange:  'accent-orange-500',
  };
  const cls = accentMap[accent] ?? 'accent-emerald-500';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-1.5 bg-[var(--surface-elevated)] rounded-full appearance-none cursor-pointer ${cls}`}
      />
    </div>
  );
}

/** Button group selector */
function BtnGroup<T extends string>({
  options,
  value,
  onChange,
  accent = 'emerald',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
}) {
  const active = `border-${accent}-500 bg-${accent}-500/20 text-${accent}-400`;
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 px-1 rounded-lg border text-[10px] font-medium transition-all
            ${value === o.value
              ? `border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary)]`
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-light)]'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Collapsible section with optional master toggle */
function Section({
  title,
  accent = '#22c55e',
  defaultOpen = true,
  enabled,
  onToggle,
  toggleAccent = 'emerald',
  children,
}: {
  title: string;
  accent?: string;
  defaultOpen?: boolean;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  toggleAccent?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-[var(--surface)] hover:bg-[var(--surface-elevated)] transition-colors"
        onClick={() => setOpen(p => !p)}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accent }} />
          <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {onToggle !== undefined && (
            <Toggle value={enabled ?? false} onChange={onToggle} accent={toggleAccent} />
          )}
          <svg
            width="12" height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {/* Body */}
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3 bg-[var(--surface)]/50">
          {children}
        </div>
      )}
    </div>
  );
}

/** Small separator label */
function SepLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]/60 pt-1">
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB ICONS
// ─────────────────────────────────────────────────────────────────────────────

const TAB_CONFIG: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'chart',
    label: 'Chart',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="7" y1="2" x2="7" y2="6" /><rect x="4" y="6" width="6" height="8" rx="1" fill="currentColor" fillOpacity="0.2" />
        <line x1="7" y1="14" x2="7" y2="18" />
      </svg>
    ),
  },
  {
    id: 'footprint',
    label: 'Footprint',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="7" height="16" rx="1" />
        <rect x="14" y="8" width="7" height="12" rx="1" />
        <line x1="6.5" y1="8" x2="6.5" y2="16" /><line x1="17.5" y1="12" x2="17.5" y2="18" />
      </svg>
    ),
  },
  {
    id: 'orderflow',
    label: 'Orderflow',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 17l6-6 4 4 8-8" />
        <circle cx="21" cy="7" r="2" fill="currentColor" fillOpacity="0.4" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="4" height="18" rx="1" />
        <rect x="10" y="8" width="4" height="13" rx="1" />
        <rect x="17" y="5" width="4" height="16" rx="1" />
      </svg>
    ),
  },
  {
    id: 'averages',
    label: 'Averages',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="3,18 8,12 12,14 16,8 21,10" />
        <line x1="3" y1="14" x2="21" y2="14" strokeDasharray="3 2" strokeOpacity="0.4" />
      </svg>
    ),
  },
  {
    id: 'display',
    label: 'Display',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="10" y1="10" x2="10" y2="21" />
      </svg>
    ),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function FootprintAdvancedSettings({
  isOpen,
  onClose,
  initialPosition,
}: FootprintAdvancedSettingsProps) {
  const s = useFootprintSettingsStore();
  const crosshair = useCrosshairStore();
  const [tab, setTab] = useState<Tab>('chart');
  const [position, setPosition] = useState(initialPosition || { x: 80, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.settings-body')) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 440, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 600, e.clientY - dragOffset.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    if (isDragging) { window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, dragOffset]);

  if (!isOpen) return null;

  // Convenience shortcuts
  const f = s.features;
  const sf = (patch: Parameters<typeof s.setFeatures>[0]) => s.setFeatures(patch);
  const sc = (patch: Parameters<typeof s.setColors>[0]) => s.setColors(patch);
  const sl = (patch: Parameters<typeof s.setLayout>[0]) => s.setLayout(patch);

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label="Footprint Settings"
      className="fixed z-[50] select-none"
      style={{ left: position.x, top: position.y, width: 440 }}
    >
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '88vh' }}>

        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] cursor-move bg-[var(--surface)] shrink-0"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 .33 1.65 1.65 0 0 0 10.51 0H11a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 6a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Footprint Settings</span>
            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded font-mono">PRO</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { s.resetToDefaults(); toast.success('Settings reset'); }}
              className="px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => {
                const json = s.exportSettings();
                navigator.clipboard.writeText(json).then(() => toast.success('Copied to clipboard'));
              }}
              className="px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Export
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b border-[var(--border)] shrink-0 overflow-x-auto">
          {TAB_CONFIG.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-medium transition-all whitespace-nowrap min-w-[60px]
                ${tab === t.id
                  ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
            >
              <span className={tab === t.id ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── BODY ── */}
        <div className="settings-body flex-1 overflow-y-auto p-3 space-y-2.5">

          {/* ═══════════════════════════════════════════════════════════
              TAB: CHART
          ══════════════════════════════════════════════════════════════ */}
          {tab === 'chart' && (
            <>
              {/* Theme Presets */}
              <Section title="Theme" accent="#6366f1" defaultOpen>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(COLOR_PRESETS).map(preset => {
                    const c = COLOR_PRESETS[preset as keyof typeof COLOR_PRESETS];
                    const active = s.colors.background === c.background;
                    return (
                      <button
                        key={preset}
                        onClick={() => s.setColors(c)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] border transition-colors
                          ${active ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-light)]'}`}
                      >
                        <div className="flex gap-0.5">
                          {[c.background, c.candleUpBody, c.askColor].map((col, i) => (
                            <div key={i} className="w-2 h-2 rounded-full border border-white/10" style={{ backgroundColor: col }} />
                          ))}
                        </div>
                        {THEME_LABELS[preset] || preset}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Candle Colors */}
              <Section title="Candle Colors" accent="#22c55e" defaultOpen>
                <SepLabel>Bullish</SepLabel>
                <Row label="Body"><InlineColorSwatch value={s.colors.candleUpBody} onChange={c => sc({ candleUpBody: c })} /></Row>
                <Row label="Border"><InlineColorSwatch value={s.colors.candleUpBorder} onChange={c => sc({ candleUpBorder: c })} /></Row>
                <Row label="Wick"><InlineColorSwatch value={s.colors.candleUpWick} onChange={c => sc({ candleUpWick: c })} /></Row>
                <SepLabel>Bearish</SepLabel>
                <Row label="Body"><InlineColorSwatch value={s.colors.candleDownBody} onChange={c => sc({ candleDownBody: c })} /></Row>
                <Row label="Border"><InlineColorSwatch value={s.colors.candleDownBorder} onChange={c => sc({ candleDownBorder: c })} /></Row>
                <Row label="Wick"><InlineColorSwatch value={s.colors.candleDownWick} onChange={c => sc({ candleDownWick: c })} /></Row>
              </Section>

              {/* Background & Grid */}
              <Section title="Background & Grid" accent="#374151" defaultOpen>
                <Row label="Background"><InlineColorSwatch value={s.colors.background} onChange={c => sc({ background: c })} /></Row>
                <Row label="Grid"><InlineColorSwatch value={s.colors.gridColor} onChange={c => sc({ gridColor: c })} /></Row>
                <Slider label="Grid Opacity" value={Math.round(s.colors.gridOpacity * 100)} min={0} max={100} onChange={v => sc({ gridOpacity: v / 100 })} fmt={v => `${v}%`} accent="indigo" />
              </Section>

              {/* Font */}
              <Section title="Font" accent="#8b5cf6" defaultOpen={false}>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: 'consolas', label: 'Consolas', value: '"Consolas", "Monaco", "Courier New", monospace' },
                    { id: 'monaco',   label: 'Monaco',   value: '"Monaco", "Consolas", monospace' },
                    { id: 'menlo',    label: 'Menlo',     value: '"Menlo", "Consolas", monospace' },
                    { id: 'system',   label: 'System',    value: 'ui-monospace, monospace' },
                  ].map(font => {
                    const active = s.fonts.volumeFont.includes(font.id === 'system' ? 'ui-monospace' : font.label);
                    return (
                      <button
                        key={font.id}
                        onClick={() => s.setFonts({ volumeFont: font.value, deltaFont: font.value, priceFont: font.value })}
                        style={{ fontFamily: font.value }}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all
                          ${active ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)]'}`}
                      >
                        {font.label}
                      </button>
                    );
                  })}
                </div>
                <Slider label="Font Size" value={s.fonts.volumeFontSize} min={8} max={14} onChange={v => s.setFonts({ volumeFontSize: v })} fmt={v => `${v}px`} accent="violet" />
                <Row label="Bold Text">
                  <Toggle value={s.fonts.volumeFontBold} onChange={v => s.setFonts({ volumeFontBold: v })} accent="violet" />
                </Row>
              </Section>

              {/* Current Price Line */}
              <Section title="Price Line" accent="#3b82f6" defaultOpen={false}>
                <Row label="Color"><InlineColorSwatch value={s.colors.currentPriceColor} onChange={c => sc({ currentPriceColor: c, currentPriceLabelBg: c })} /></Row>
                <Slider label="Width" value={s.colors.currentPriceLineWidth ?? 1} min={1} max={5} onChange={v => sc({ currentPriceLineWidth: v })} fmt={v => `${v}px`} accent="blue" />
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Style</span>
                  <BtnGroup
                    options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]}
                    value={s.colors.currentPriceLineStyle ?? 'dashed'}
                    onChange={v => sc({ currentPriceLineStyle: v as 'solid' | 'dashed' | 'dotted' })}
                    accent="blue"
                  />
                </div>
                <Row label="Show Label">
                  <Toggle value={s.colors.currentPriceShowLabel !== false} onChange={v => sc({ currentPriceShowLabel: v })} accent="blue" />
                </Row>
                {s.colors.currentPriceShowLabel !== false && (
                  <Row label="Label Background" indent>
                    <InlineColorSwatch value={s.colors.currentPriceLabelBg ?? s.colors.currentPriceColor} onChange={c => sc({ currentPriceLabelBg: c })} />
                  </Row>
                )}
              </Section>

              {/* Crosshair */}
              <Section title="Crosshair" accent="#06b6d4" defaultOpen={false}>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Style</span>
                  <BtnGroup
                    options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]}
                    value={crosshair.lineStyle as string}
                    onChange={v => crosshair.setLineStyle(v as CrosshairLineStyle)}
                    accent="cyan"
                  />
                </div>
                <Row label="Color"><InlineColorSwatch value={crosshair.color} onChange={v => crosshair.setColor(v)} /></Row>
                <Slider label="Line Width" value={crosshair.lineWidth} min={1} max={4} onChange={v => crosshair.setLineWidth(v)} fmt={v => `${v}px`} accent="cyan" />
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Magnet Mode</span>
                  <BtnGroup
                    options={[{ value: 'off', label: 'Off' }, { value: 'normal', label: 'Normal' }, { value: 'strong', label: 'Strong' }]}
                    value={crosshair.magnetMode as string}
                    onChange={v => crosshair.setMagnetMode(v as MagnetMode)}
                    accent="cyan"
                  />
                </div>
              </Section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: FOOTPRINT
          ══════════════════════════════════════════════════════════════ */}
          {tab === 'footprint' && (
            <>
              {/* Cluster Display Mode */}
              <Section title="Cell Display Mode" accent="#22c55e" defaultOpen>
                <BtnGroup
                  options={[
                    { value: 'bid-ask',       label: 'Bid×Ask' },
                    { value: 'delta',         label: 'Delta' },
                    { value: 'volume',        label: 'Volume' },
                    { value: 'bid-ask-split', label: 'Split' },
                  ]}
                  value={f.clusterDisplayMode ?? 'bid-ask'}
                  onChange={v => sf({ clusterDisplayMode: v as typeof f.clusterDisplayMode })}
                />
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  {f.clusterDisplayMode === 'bid-ask' && 'Market sell × market buy per price level'}
                  {f.clusterDisplayMode === 'delta' && 'Net ask−bid delta per level (signed)'}
                  {f.clusterDisplayMode === 'volume' && 'Total volume per level'}
                  {f.clusterDisplayMode === 'bid-ask-split' && 'Bid left / ask right split view'}
                </span>
              </Section>

              {/* Bid × Ask Colors */}
              <Section title="Bid × Ask" accent="#ef4444" defaultOpen>
                <Row label="Bid (Sell Aggressor)"><InlineColorSwatch value={s.colors.bidColor} onChange={c => sc({ bidColor: c })} /></Row>
                <Row label="Ask (Buy Aggressor)"><InlineColorSwatch value={s.colors.askColor} onChange={c => sc({ askColor: c })} /></Row>
                <Row label="Bid Text"><InlineColorSwatch value={s.colors.bidTextColor} onChange={c => sc({ bidTextColor: c })} /></Row>
                <Row label="Ask Text"><InlineColorSwatch value={s.colors.askTextColor} onChange={c => sc({ askTextColor: c })} /></Row>
                <Slider label="Container Opacity" value={Math.round((s.colors.footprintContainerOpacity ?? 0.03) * 100)} min={0} max={20} onChange={v => sc({ footprintContainerOpacity: v / 100 })} fmt={v => `${v}%`} accent="rose" />
              </Section>

              {/* Delta Colors */}
              <Section title="Delta Colors" accent="#22c55e" defaultOpen={false}>
                <Row label="Positive"><InlineColorSwatch value={s.colors.deltaPositive} onChange={c => sc({ deltaPositive: c })} /></Row>
                <Row label="Negative"><InlineColorSwatch value={s.colors.deltaNegative} onChange={c => sc({ deltaNegative: c })} /></Row>
                <Row label="Panel Positive"><InlineColorSwatch value={s.colors.clusterDeltaPositive} onChange={c => sc({ clusterDeltaPositive: c })} /></Row>
                <Row label="Panel Negative"><InlineColorSwatch value={s.colors.clusterDeltaNegative} onChange={c => sc({ clusterDeltaNegative: c })} /></Row>
                <Slider label="Panel Opacity" value={Math.round(s.colors.clusterDeltaOpacity * 100)} min={0} max={80} onChange={v => sc({ clusterDeltaOpacity: v / 100 })} fmt={v => `${v}%`} accent="emerald" />
              </Section>

              {/* Heatmap */}
              <Section title="Heatmap" accent="#f59e0b" defaultOpen={false}
                enabled={f.showHeatmapCells} onToggle={v => sf({ showHeatmapCells: v })} toggleAccent="amber"
              >
                <Slider label="Intensity" value={Math.round((f.heatmapIntensity ?? 0.4) * 100)} min={10} max={100} onChange={v => sf({ heatmapIntensity: v / 100 })} fmt={v => `${v}%`} accent="amber" />
              </Section>

              {/* Volume Filter */}
              <Section title="Volume Filter" accent="#6366f1" defaultOpen={false}>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Filter Mode</span>
                  <BtnGroup
                    options={[{ value: 'relative', label: 'Relative' }, { value: 'absolute', label: 'Absolute' }]}
                    value={f.volumeFilterMode ?? 'relative'}
                    onChange={v => sf({ volumeFilterMode: v as 'relative' | 'absolute' })}
                  />
                </div>
                <Slider
                  label={f.volumeFilterMode === 'absolute' ? 'Min Volume (contracts)' : 'Min Volume (% of max)'}
                  value={f.volumeFilterThreshold ?? 0}
                  min={0}
                  max={f.volumeFilterMode === 'absolute' ? 500 : 100}
                  onChange={v => sf({ volumeFilterThreshold: v })}
                  fmt={v => f.volumeFilterMode === 'absolute' ? `${v}` : `${v}%`}
                  accent="indigo"
                />
              </Section>

              {/* Aggregation Mode */}
              <Section title="Bar Aggregation" accent="#8b5cf6" defaultOpen={false}>
                <BtnGroup
                  options={[{ value: 'time', label: 'Time' }, { value: 'tick', label: 'Tick' }, { value: 'volume', label: 'Volume' }]}
                  value={f.aggregationMode ?? 'time'}
                  onChange={v => sf({ aggregationMode: v as 'time' | 'tick' | 'volume' })}
                  accent="violet"
                />
                {f.aggregationMode === 'tick' && (
                  <Slider label="Ticks per Bar" value={f.tickBarSize ?? 500} min={50} max={5000} step={50} onChange={v => sf({ tickBarSize: v })} accent="violet" />
                )}
                {f.aggregationMode === 'volume' && (
                  <Slider label="Volume per Bar" value={f.volumeBarSize ?? 100} min={10} max={2000} step={10} onChange={v => sf({ volumeBarSize: v })} accent="violet" />
                )}
              </Section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: ORDERFLOW
          ══════════════════════════════════════════════════════════════ */}
          {tab === 'orderflow' && (
            <>
              {/* Imbalance */}
              <Section title="Imbalance" accent="#f59e0b" defaultOpen
                enabled={f.showImbalances} onToggle={v => sf({ showImbalances: v })} toggleAccent="amber"
              >
                <Slider label="Detection Ratio" value={s.imbalance.ratio} min={1.5} max={6} step={0.5} onChange={v => s.setImbalance({ ratio: v })} fmt={v => `${v}×`} accent="amber" />
                <Slider label="Min Volume" value={s.imbalance.minVolume} min={0} max={10} step={0.5} onChange={v => s.setImbalance({ minVolume: v })} accent="amber" />
                <Slider label="Highlight Strength" value={Math.round(s.imbalance.highlightStrength * 100)} min={5} max={100} onChange={v => s.setImbalance({ highlightStrength: v / 100 })} fmt={v => `${v}%`} accent="amber" />
                <div className="grid grid-cols-2 gap-2">
                  <Row label="Buy Imbalance"><InlineColorSwatch value={s.colors.imbalanceBuyBg} onChange={c => sc({ imbalanceBuyBg: c })} /></Row>
                  <Row label="Sell Imbalance"><InlineColorSwatch value={s.colors.imbalanceSellBg} onChange={c => sc({ imbalanceSellBg: c })} /></Row>
                </div>
              </Section>

              {/* Stacked Imbalance */}
              <Section title="Stacked Imbalance" accent="#f97316" defaultOpen={false}
                enabled={f.showStackedImbalances} onToggle={v => sf({ showStackedImbalances: v })} toggleAccent="orange"
              >
                <Slider label="Min Consecutive Levels" value={f.stackedImbalanceMin ?? 3} min={2} max={8} onChange={v => sf({ stackedImbalanceMin: v })} accent="orange" />
              </Section>

              {/* Absorption */}
              <Section title="Absorption" accent="#06b6d4" defaultOpen={false}
                enabled={f.absorptionEnabled ?? false} onToggle={v => sf({ absorptionEnabled: v })} toggleAccent="cyan"
              >
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Detects large passive orders absorbing aggressive flow without price movement.
                </span>
                <Slider label="Volume Threshold (×avg)" value={f.absorptionThreshold ?? 2.0} min={1.0} max={5.0} step={0.5} onChange={v => sf({ absorptionThreshold: v })} fmt={v => `${v}×`} accent="cyan" />
                <Row label="Highlight Color"><InlineColorSwatch value={f.absorptionHighlightColor ?? '#ff9800'} onChange={c => sf({ absorptionHighlightColor: c })} /></Row>
              </Section>

              {/* Exhaustion */}
              <Section title="Exhaustion" accent="#a855f7" defaultOpen={false}
                enabled={f.exhaustionEnabled ?? false} onToggle={v => sf({ exhaustionEnabled: v })} toggleAccent="violet"
              >
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Flags low-volume clusters at price extremes — potential reversal signals.
                </span>
                <Slider label="Sensitivity" value={f.exhaustionSensitivity ?? 3} min={1} max={5} onChange={v => sf({ exhaustionSensitivity: v })} fmt={v => ['Very Low', 'Low', 'Medium', 'High', 'Very High'][v - 1]} accent="violet" />
                <Row label="Signal Color"><InlineColorSwatch value={f.exhaustionColor ?? '#9c27b0'} onChange={c => sf({ exhaustionColor: c })} /></Row>
              </Section>

              {/* Iceberg Detection */}
              <Section title="Iceberg Detection" accent="#14b8a6" defaultOpen={false}
                enabled={f.icebergEnabled ?? false} onToggle={v => sf({ icebergEnabled: v })} toggleAccent="cyan"
              >
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Repeated prints at the same price level suggest hidden passive orders refilling.
                </span>
                <Slider label="Min Repeated Prints" value={f.icebergRepeatedPrints ?? 3} min={2} max={8} onChange={v => sf({ icebergRepeatedPrints: v })} accent="cyan" />
              </Section>

              {/* Cluster Filters */}
              <Section title="Cluster Filters" accent="#64748b" defaultOpen={false}>
                <Slider label="Min Volume (hide below)" value={f.clusterMinVolume ?? 0} min={0} max={500} step={5} onChange={v => sf({ clusterMinVolume: v })} fmt={v => v === 0 ? 'Off' : `${v}`} accent="indigo" />
                <Slider label="Min Trades (hide below)" value={f.clusterMinTrades ?? 0} min={0} max={100} step={1} onChange={v => sf({ clusterMinTrades: v })} fmt={v => v === 0 ? 'Off' : `${v}`} accent="indigo" />
              </Section>

              {/* Large Trades */}
              <Section title="Large Trade Highlight" accent="#ffd700" defaultOpen={false}
                enabled={f.showLargeTradeHighlight} onToggle={v => sf({ showLargeTradeHighlight: v })} toggleAccent="amber"
              >
                <Slider label="Threshold (×avg level volume)" value={f.largeTradeMultiplier ?? 2.0} min={1.5} max={10} step={0.5} onChange={v => sf({ largeTradeMultiplier: v })} fmt={v => `${v}×`} accent="amber" />
                <Row label="Highlight Color"><InlineColorSwatch value={f.largeTradeColor ?? '#ffd700'} onChange={c => sf({ largeTradeColor: c })} /></Row>
              </Section>

              {/* CVD Panel */}
              <Section title="Cumulative Delta (CVD)" accent="#22c55e" defaultOpen={false}
                enabled={f.showCVDPanel} onToggle={v => sf({ showCVDPanel: v })} toggleAccent="emerald"
              >
                <Slider label="Panel Height" value={f.cvdPanelHeight ?? 70} min={40} max={150} onChange={v => sf({ cvdPanelHeight: v })} fmt={v => `${v}px`} accent="emerald" />
                <Row label="Line Color"><InlineColorSwatch value={f.cvdLineColor ?? '#22c55e'} onChange={c => sf({ cvdLineColor: c })} /></Row>
              </Section>

              {/* Absorption Events (legacy toggle) */}
              <Section title="Absorption Events (Live)" accent="#f43f5e" defaultOpen={false}>
                <Row label="Show Markers">
                  <Toggle value={f.showAbsorptionEvents ?? false} onChange={v => sf({ showAbsorptionEvents: v })} accent="rose" />
                </Row>
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Requires live WebSocket orderbook. Marked on closing candles.
                </span>
              </Section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: PROFILE
          ══════════════════════════════════════════════════════════════ */}
          {tab === 'profile' && (
            <>
              {/* Volume Profile */}
              <Section title="Volume Profile" accent="#6366f1" defaultOpen
                enabled={f.showVolumeProfile} onToggle={v => sf({ showVolumeProfile: v })} toggleAccent="indigo"
              >
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Visualization Mode</span>
                  <BtnGroup
                    options={[
                      { value: 'volume', label: 'Volume' },
                      { value: 'bidask', label: 'Bid×Ask' },
                      { value: 'delta',  label: 'Delta' },
                      { value: 'trades', label: 'Trades' },
                      { value: 'time',   label: 'Time' },
                    ]}
                    value={f.volumeProfileMode ?? 'volume'}
                    onChange={v => sf({ volumeProfileMode: v as typeof f.volumeProfileMode })}
                    accent="indigo"
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <Row label="Value Area"><InlineColorSwatch value={f.volumeProfileColor ?? '#5e7ce2'} onChange={c => sf({ volumeProfileColor: c })} /></Row>
                  <Row label="Outside VA"><InlineColorSwatch value={f.volumeProfileOutsideColor ?? '#3a3f4b'} onChange={c => sf({ volumeProfileOutsideColor: c })} /></Row>
                  <Row label="POC Bar"><InlineColorSwatch value={f.volumeProfilePocColor ?? '#e2b93b'} onChange={c => sf({ volumeProfilePocColor: c })} /></Row>
                  <Row label="VAH/VAL"><InlineColorSwatch value={f.volumeProfileVahValColor ?? '#7c85f6'} onChange={c => sf({ volumeProfileVahValColor: c })} /></Row>
                </div>
                <Slider label="Opacity" value={Math.round((f.volumeProfileOpacity ?? 0.7) * 100)} min={10} max={100} onChange={v => sf({ volumeProfileOpacity: v / 100 })} fmt={v => `${v}%`} accent="indigo" />
              </Section>

              {/* Delta Profile — now a sub-toggle, not standalone */}
              <Section title="Delta Profile" accent="#22c55e" defaultOpen={false}
                enabled={f.showDeltaProfile} onToggle={v => sf({ showDeltaProfile: v })} toggleAccent="emerald"
              >
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Displays net delta bars alongside the volume profile. Set Volume Profile mode to "Delta" for the full delta view.
                </span>
                <Row label="Positive"><InlineColorSwatch value={f.deltaProfilePositiveColor ?? '#22c55e'} onChange={c => sf({ deltaProfilePositiveColor: c })} /></Row>
                <Row label="Negative"><InlineColorSwatch value={f.deltaProfileNegativeColor ?? '#ef4444'} onChange={c => sf({ deltaProfileNegativeColor: c })} /></Row>
                <Slider label="Opacity" value={Math.round((f.deltaProfileOpacity ?? 0.7) * 100)} min={10} max={100} onChange={v => sf({ deltaProfileOpacity: v / 100 })} fmt={v => `${v}%`} accent="emerald" />
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Position</span>
                  <BtnGroup
                    options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
                    value={s.deltaProfilePosition}
                    onChange={v => sl({ deltaProfilePosition: v as 'left' | 'right' })}
                  />
                </div>
              </Section>

              {/* POC */}
              <Section title="Point of Control (POC)" accent="#ffc107" defaultOpen={false}
                enabled={f.showPOC} onToggle={v => sf({ showPOC: v })} toggleAccent="amber"
              >
                <Row label="POC Color"><InlineColorSwatch value={s.colors.pocColor} onChange={c => sc({ pocColor: c })} /></Row>
                <Slider label="Opacity" value={Math.round(s.colors.pocOpacity * 100)} min={5} max={60} onChange={v => sc({ pocOpacity: v / 100 })} fmt={v => `${v}%`} accent="amber" />
              </Section>

              {/* Developing POC */}
              <Section title="Developing POC" accent="#fbbf24" defaultOpen={false}
                enabled={f.showDevelopingPOC} onToggle={v => sf({ showDevelopingPOC: v })} toggleAccent="amber"
              >
                <Row label="Line Color"><InlineColorSwatch value={f.developingPOCColor ?? '#fbbf24'} onChange={c => sf({ developingPOCColor: c })} /></Row>
              </Section>

              {/* Naked POC */}
              <Section title="Naked POC" accent="#f59e0b" defaultOpen={false}
                enabled={f.showNakedPOC} onToggle={v => sf({ showNakedPOC: v })} toggleAccent="amber"
              >
                <Row label="Line Color"><InlineColorSwatch value={f.nakedPOCColor ?? '#fbbf24'} onChange={c => sf({ nakedPOCColor: c })} /></Row>
              </Section>

              {/* Unfinished Auctions */}
              <Section title="Unfinished Auctions" accent="#f97316" defaultOpen={false}
                enabled={f.showUnfinishedAuctions} onToggle={v => sf({ showUnfinishedAuctions: v })} toggleAccent="orange"
              >
                <span className="text-[10px] text-[var(--text-muted)]/70">
                  Marks highs/lows with one-sided imbalance — potential areas of re-test.
                </span>
              </Section>

              {/* TPO / Market Profile */}
              <Section title="TPO / Market Profile" accent="#8b5cf6" defaultOpen={false}
                enabled={f.showTPO} onToggle={v => sf({ showTPO: v })} toggleAccent="violet"
              >
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">TPO Period</span>
                  <BtnGroup
                    options={[{ value: '30', label: '30 min' }, { value: '60', label: '60 min' }]}
                    value={String(f.tpoPeriod ?? 30)}
                    onChange={v => sf({ tpoPeriod: Number(v) as 30 | 60 })}
                    accent="violet"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Display Mode</span>
                  <BtnGroup
                    options={[{ value: 'letters', label: 'Letters' }, { value: 'histogram', label: 'Histogram' }]}
                    value={f.tpoMode ?? 'letters'}
                    onChange={v => sf({ tpoMode: v as 'letters' | 'histogram' })}
                    accent="violet"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Position</span>
                  <BtnGroup
                    options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
                    value={f.tpoPosition ?? 'right'}
                    onChange={v => sf({ tpoPosition: v as 'left' | 'right' })}
                    accent="violet"
                  />
                </div>
              </Section>

              {/* Session Separators */}
              <Section title="Session Separators" accent="#64748b" defaultOpen={false}>
                <Row label="Show Separators">
                  <Toggle value={f.showSessionSeparators ?? true} onChange={v => sf({ showSessionSeparators: v })} />
                </Row>
              </Section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: AVERAGES  (VWAP + TWAP grouped as benchmark prices)
          ══════════════════════════════════════════════════════════════ */}
          {tab === 'averages' && (
            <>
              <div className="text-[10px] text-[var(--text-muted)]/70 px-1 pb-1">
                Session benchmark prices — VWAP and TWAP anchored to the current trading session.
              </div>

              {/* VWAP */}
              <Section title="VWAP — Volume Weighted Avg Price" accent="#f59e0b" defaultOpen
                enabled={f.showVWAP !== false} onToggle={v => sf({ showVWAP: v })} toggleAccent="amber"
              >
                <Row label="Color"><InlineColorSwatch value={f.vwapColor ?? '#e2b93b'} onChange={c => sf({ vwapColor: c })} /></Row>
                <Slider label="Line Width" value={f.vwapLineWidth ?? 2.5} min={1} max={5} step={0.5} onChange={v => sf({ vwapLineWidth: v })} fmt={v => `${v}px`} accent="amber" />
                <Row label="Show Label">
                  <Toggle value={f.vwapShowLabel !== false} onChange={v => sf({ vwapShowLabel: v })} accent="amber" />
                </Row>

                {/* Std Dev Bands */}
                <div className="border-t border-[var(--border)] pt-2 mt-1">
                  <Row label="Std Dev Bands">
                    <Toggle value={f.showVWAPBands ?? false} onChange={v => sf({ showVWAPBands: v })} accent="amber" />
                  </Row>
                  {f.showVWAPBands && (
                    <div className="space-y-2.5 pt-2">
                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Active Bands</span>
                        <div className="flex gap-1.5">
                          {[1, 2, 3].map(n => {
                            const mults = f.vwapBandMultipliers ?? [1, 2];
                            const active = mults.includes(n);
                            return (
                              <button
                                key={n}
                                onClick={() => {
                                  const next = active
                                    ? mults.filter((m: number) => m !== n)
                                    : [...mults, n].sort((a: number, b: number) => a - b);
                                  sf({ vwapBandMultipliers: next });
                                }}
                                className={`flex-1 py-1.5 rounded-lg border text-[10px] font-semibold transition-all
                                  ${active
                                    ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                                    : 'border-[var(--border)] text-[var(--text-muted)]'
                                  }`}
                              >
                                {n}σ
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <Slider label="Fill Opacity" value={Math.round((f.vwapBandOpacity ?? 0.06) * 100)} min={0} max={30} onChange={v => sf({ vwapBandOpacity: v / 100 })} fmt={v => `${v}%`} accent="amber" />
                      <Row label="Band Color"><InlineColorSwatch value={f.vwapBandColor ?? f.vwapColor ?? '#e2b93b'} onChange={c => sf({ vwapBandColor: c })} /></Row>
                    </div>
                  )}
                </div>
              </Section>

              {/* TWAP */}
              <Section title="TWAP — Time Weighted Avg Price" accent="#3b82f6" defaultOpen
                enabled={f.showTWAP !== false} onToggle={v => sf({ showTWAP: v })} toggleAccent="blue"
              >
                <Row label="Color"><InlineColorSwatch value={f.twapColor ?? '#5eaeff'} onChange={c => sf({ twapColor: c })} /></Row>
                <Slider label="Line Width" value={f.twapLineWidth ?? 2} min={1} max={5} step={0.5} onChange={v => sf({ twapLineWidth: v })} fmt={v => `${v}px`} accent="blue" />
                <Row label="Show Label">
                  <Toggle value={f.twapShowLabel !== false} onChange={v => sf({ twapShowLabel: v })} accent="blue" />
                </Row>
              </Section>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
              TAB: DISPLAY
          ══════════════════════════════════════════════════════════════ */}
          {tab === 'display' && (
            <>
              {/* Layout */}
              <Section title="Layout" accent="#22c55e" defaultOpen>
                <Slider label="Row Height" value={s.rowHeight} min={12} max={28} onChange={v => sl({ rowHeight: v })} fmt={v => `${v}px`} accent="emerald" />
                <Slider label="Footprint Width" value={s.footprintWidth} min={80} max={200} onChange={v => sl({ footprintWidth: v })} fmt={v => `${v}px`} accent="emerald" />
                <Slider label="Visible Candles" value={s.maxVisibleFootprints} min={10} max={60} onChange={v => sl({ maxVisibleFootprints: v })} accent="emerald" />
                <Slider label="Candle Gap" value={s.candleGap ?? 3} min={0} max={12} onChange={v => sl({ candleGap: v })} fmt={v => `${v}px`} accent="emerald" />
              </Section>

              {/* Panels */}
              <Section title="Panels & Labels" accent="#6366f1" defaultOpen>
                <Row label="Cluster Panel (Ask/Bid/Δ/Vol)">
                  <Toggle value={f.showClusterStatic} onChange={v => sf({ showClusterStatic: v })} accent="indigo" />
                </Row>
                <Row label="OHLC Candle Bar">
                  <Toggle value={f.showOHLC} onChange={v => sf({ showOHLC: v })} accent="indigo" />
                </Row>
                <Row label="Hour Markers">
                  <Toggle value={f.showHourMarkers} onChange={v => sf({ showHourMarkers: v })} accent="indigo" />
                </Row>
                <Row label="Bid/Ask Spread">
                  <Toggle value={f.showSpread ?? false} onChange={v => sf({ showSpread: v })} accent="indigo" />
                </Row>
                <Row label="Grid">
                  <Toggle value={f.showGrid} onChange={v => sf({ showGrid: v })} accent="indigo" />
                </Row>
                <Row label="Per-Level Delta">
                  <Toggle value={f.showDeltaPerLevel} onChange={v => sf({ showDeltaPerLevel: v })} accent="indigo" />
                </Row>
                <Row label="Total Delta Label">
                  <Toggle value={f.showTotalDelta} onChange={v => sf({ showTotalDelta: v })} accent="indigo" />
                </Row>
              </Section>

              {/* Passive Liquidity */}
              <Section title="Passive Liquidity (Orderbook)" accent="#06b6d4" defaultOpen={false}
                enabled={s.passiveLiquidity.enabled} onToggle={v => s.setPassiveLiquidity({ enabled: v })} toggleAccent="cyan"
              >
                <Row label="Use Real Orderbook">
                  <Toggle value={s.passiveLiquidity.useRealOrderbook} onChange={v => s.setPassiveLiquidity({ useRealOrderbook: v })} accent="cyan" />
                </Row>
                <Slider label="Intensity" value={Math.round(s.passiveLiquidity.intensity * 100)} min={10} max={100} onChange={v => s.setPassiveLiquidity({ intensity: v / 100 })} fmt={v => `${v}%`} accent="cyan" />
                <Slider label="Opacity" value={Math.round(s.passiveLiquidity.opacity * 100)} min={10} max={80} onChange={v => s.setPassiveLiquidity({ opacity: v / 100 })} fmt={v => `${v}%`} accent="cyan" />
                <Slider label="Focus (±ticks from price)" value={s.passiveLiquidity.focusTicks} min={0} max={50} onChange={v => s.setPassiveLiquidity({ focusTicks: v })} fmt={v => v === 0 ? 'All' : `±${v}`} accent="cyan" />
                <Slider label="Max Bar Width" value={s.passiveLiquidity.maxBarWidth} min={30} max={200} step={5} onChange={v => s.setPassiveLiquidity({ maxBarWidth: v })} fmt={v => `${v}px`} accent="cyan" />
                <div className="grid grid-cols-2 gap-2">
                  <Row label="Bid Color"><InlineColorSwatch value={s.passiveLiquidity.bidColor} onChange={c => s.setPassiveLiquidity({ bidColor: c })} /></Row>
                  <Row label="Ask Color"><InlineColorSwatch value={s.passiveLiquidity.askColor} onChange={c => s.setPassiveLiquidity({ askColor: c })} /></Row>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Stability Filter</span>
                  <BtnGroup
                    options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]}
                    value={s.passiveLiquidity.stabilityLevel}
                    onChange={v => s.setPassiveLiquidity({ stabilityLevel: v as 'low' | 'medium' | 'high' })}
                    accent="cyan"
                  />
                </div>
                <Row label="Only Persistent Orders">
                  <Toggle value={s.passiveLiquidity.showOnlyPersistent} onChange={v => s.setPassiveLiquidity({ showOnlyPersistent: v })} accent="cyan" />
                </Row>
                <Row label="Show Stats Panel">
                  <Toggle value={s.passiveLiquidity.showStats} onChange={v => s.setPassiveLiquidity({ showStats: v })} accent="cyan" />
                </Row>
              </Section>

              {/* Volume Bubbles */}
              <Section title="Volume Bubbles" accent="#ec4899" defaultOpen={false}
                enabled={f.showVolumeBubbles ?? false} onToggle={v => sf({ showVolumeBubbles: v })} toggleAccent="rose"
              >
                <Slider label="Opacity" value={Math.round((f.volumeBubbleOpacity ?? 0.6) * 100)} min={10} max={100} onChange={v => sf({ volumeBubbleOpacity: v / 100 })} fmt={v => `${v}%`} accent="rose" />
                <Slider label="Max Radius" value={f.volumeBubbleMaxSize ?? 30} min={5} max={80} onChange={v => sf({ volumeBubbleMaxSize: v })} fmt={v => `${v}px`} accent="rose" />
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Scaling</span>
                  <BtnGroup
                    options={[{ value: 'sqrt', label: '√ Sqrt' }, { value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]}
                    value={f.volumeBubbleScaling ?? 'sqrt'}
                    onChange={v => sf({ volumeBubbleScaling: v as 'sqrt' | 'linear' | 'log' })}
                    accent="rose"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] block mb-1.5">Position</span>
                  <BtnGroup
                    options={[{ value: 'overlay', label: 'Overlay' }, { value: 'bottom', label: 'Bottom' }]}
                    value={f.volumeBubblePosition ?? 'overlay'}
                    onChange={v => sf({ volumeBubblePosition: v as 'overlay' | 'bottom' })}
                    accent="rose"
                  />
                </div>
              </Section>
            </>
          )}

        </div>{/* /settings-body */}
      </div>
    </div>
  );
}
