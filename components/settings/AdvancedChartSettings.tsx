'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';

interface AdvancedChartSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  // Current settings
  crosshairColor: string;
  crosshairWidth: number;
  crosshairStyle: 'solid' | 'dashed' | 'dotted';
  candleUpColor: string;
  candleDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  candleBorderUp: string;
  candleBorderDown: string;
  backgroundColor: string;
  showGrid: boolean;
  gridColor: string;
  // Callbacks
  onCrosshairChange: (settings: { color?: string; width?: number; style?: 'solid' | 'dashed' | 'dotted' }) => void;
  onCandleChange: (settings: {
    upColor?: string;
    downColor?: string;
    wickUp?: string;
    wickDown?: string;
    borderUp?: string;
    borderDown?: string;
  }) => void;
  onBackgroundChange: (settings: { color?: string; showGrid?: boolean; gridColor?: string }) => void;
}

type SettingsTab = 'style' | 'candles' | 'background' | 'scale' | 'templates';

const COLOR_PRESETS = {
  greens: ['#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#4ade80', '#86efac'],
  reds: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#f87171', '#fca5a5'],
  blues: ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#60a5fa', '#93c5fd'],
  purples: ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#a78bfa', '#c4b5fd'],
  yellows: ['#fbbf24', '#f59e0b', '#d97706', '#b45309', '#92400e', '#fcd34d', '#fde68a'],
  cyans: ['#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63', '#22d3ee', '#67e8f9'],
  pinks: ['#ec4899', '#db2777', '#be185d', '#9d174d', '#831843', '#f472b6', '#f9a8d4'],
  grays: ['#ffffff', '#e5e5e5', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a', '#000000'],
};

function ColorPicker({ label, value, onChange, palette }: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  palette: string[];
}) {
  return (
    <div>
      <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1">
        {palette.map(color => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-6 h-6 rounded-md transition-all hover:scale-110 ${
              value === color ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--surface)] scale-110' : ''
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-6 h-6 rounded-md cursor-pointer opacity-0 absolute inset-0"
          />
          <div className="w-6 h-6 rounded-md border border-dashed border-[var(--text-muted)] flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6" />
              <line x1="8" y1="5" x2="8" y2="11" />
              <line x1="5" y1="8" x2="11" y2="8" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ label, description, value, onChange }: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-[12px] font-medium text-[var(--text-primary)]">{label}</span>
        {description && <p className="text-[10px] text-[var(--text-muted)]">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-9 h-5 rounded-full transition-all flex items-center ${
          value ? 'bg-[var(--primary)] justify-end' : 'bg-[var(--surface-elevated)] justify-start'
        }`}
      >
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm mx-0.5 transition-transform`} />
      </button>
    </div>
  );
}

function SliderControl({ label, value, min, max, step, unit, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] text-[var(--text-muted)]">{label}</label>
        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{value}{unit || ''}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-[var(--surface-elevated)] rounded-full appearance-none cursor-pointer accent-[var(--primary)]"
      />
    </div>
  );
}

export default function AdvancedChartSettings({
  isOpen,
  onClose,
  initialPosition,
  crosshairColor,
  crosshairWidth,
  crosshairStyle,
  candleUpColor,
  candleDownColor,
  wickUpColor,
  wickDownColor,
  candleBorderUp,
  candleBorderDown,
  backgroundColor,
  showGrid,
  gridColor,
  onCrosshairChange,
  onCandleChange,
  onBackgroundChange,
}: AdvancedChartSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('style');
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Preferences store
  const { showVolume, showCrosshairTooltip, setShowVolume, setShowCrosshairTooltip } = usePreferencesStore();

  // Templates store
  const { templates, deleteTemplate, renameTemplate } = useChartTemplatesStore();
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Dragging logic
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.settings-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 420, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 500, e.clientY - dragOffset.y)),
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleStartRename = (template: ChartTemplate) => {
    setEditingTemplateId(template.id);
    setEditingName(template.name);
  };

  const handleSaveRename = () => {
    if (editingTemplateId && editingName.trim()) {
      renameTemplate(editingTemplateId, editingName.trim());
    }
    setEditingTemplateId(null);
    setEditingName('');
  };

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'style',
      label: 'Style',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      ),
    },
    {
      id: 'candles',
      label: 'Bougies',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="7" y1="2" x2="7" y2="6" />
          <rect x="4" y="6" width="6" height="8" rx="1" fill="currentColor" fillOpacity="0.15" />
          <line x1="7" y1="14" x2="7" y2="18" />
          <line x1="17" y1="6" x2="17" y2="10" />
          <rect x="14" y="10" width="6" height="8" rx="1" />
          <line x1="17" y1="18" x2="17" y2="22" />
        </svg>
      ),
    },
    {
      id: 'background',
      label: 'Fond',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18" strokeOpacity="0.4" />
          <path d="M3 15h18" strokeOpacity="0.2" />
          <path d="M9 3v18" strokeOpacity="0.4" />
          <path d="M15 3v18" strokeOpacity="0.2" />
        </svg>
      ),
    },
    {
      id: 'scale',
      label: 'Echelle',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="21" y1="3" x2="21" y2="21" />
          <line x1="18" y1="6" x2="21" y2="6" />
          <line x1="19" y1="10" x2="21" y2="10" />
          <line x1="18" y1="14" x2="21" y2="14" />
          <line x1="19" y1="18" x2="21" y2="18" />
          <line x1="3" y1="21" x2="21" y2="21" />
          <polyline points="4,16 8,10 12,13 16,7" />
        </svg>
      ),
    },
    {
      id: 'templates',
      label: 'Presets',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M9 9h6" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      ),
    },
  ];

  return (
    <div
      ref={modalRef}
      className="fixed z-[50] select-none"
      style={{ left: position.x, top: position.y, width: 400 }}
    >
      <div className="rounded-xl overflow-hidden shadow-2xl" style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        backdropFilter: 'blur(20px)',
      }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 cursor-move"
          style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface)' }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Chart Settings</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs — vertical icon strip on left side */}
        <div className="flex">
          <div className="flex flex-col w-[52px] py-1" style={{ borderRight: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all"
                style={{
                  color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                  backgroundColor: activeTab === tab.id ? 'var(--surface)' : 'transparent',
                  borderLeft: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              >
                {tab.icon}
                <span className="text-[8px] font-medium mt-0.5">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="settings-content flex-1 p-4 max-h-[440px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {/* === STYLE TAB === */}
            {activeTab === 'style' && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Crosshair</h3>

                <ColorPicker
                  label="Couleur"
                  value={crosshairColor}
                  onChange={(color) => onCrosshairChange({ color })}
                  palette={[...COLOR_PRESETS.grays.slice(0, 6), ...COLOR_PRESETS.blues.slice(0, 3), ...COLOR_PRESETS.greens.slice(0, 3)]}
                />

                <SliderControl
                  label="Epaisseur"
                  value={crosshairWidth}
                  min={1}
                  max={5}
                  unit="px"
                  onChange={(v) => onCrosshairChange({ width: v })}
                />

                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Style</label>
                  <div className="flex gap-1.5">
                    {[
                      { id: 'solid' as const, label: 'Solide', preview: '━━━━' },
                      { id: 'dashed' as const, label: 'Tirets', preview: '─ ─ ─' },
                      { id: 'dotted' as const, label: 'Points', preview: '· · · ·' },
                    ].map(s => (
                      <button
                        key={s.id}
                        onClick={() => onCrosshairChange({ style: s.id })}
                        className="flex-1 py-1.5 px-2 rounded-md text-[10px] font-medium transition-all"
                        style={{
                          backgroundColor: crosshairStyle === s.id ? 'var(--primary)' : 'var(--background)',
                          color: crosshairStyle === s.id ? '#fff' : 'var(--text-muted)',
                          border: `1px solid ${crosshairStyle === s.id ? 'var(--primary)' : 'var(--border)'}`,
                        }}
                      >
                        <div className="font-mono text-[9px] tracking-wider mb-0.5">{s.preview}</div>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ToggleSwitch
                  label="Tooltip crosshair"
                  description="Afficher OHLCV au survol"
                  value={showCrosshairTooltip}
                  onChange={setShowCrosshairTooltip}
                />

                {/* Preview */}
                <div className="h-16 rounded-lg relative overflow-hidden" style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}>
                  <div
                    className="absolute left-1/2 top-0 bottom-0 w-0"
                    style={{ borderLeft: `${crosshairWidth}px ${crosshairStyle} ${crosshairColor}` }}
                  />
                  <div
                    className="absolute top-1/2 left-0 right-0 h-0"
                    style={{ borderTop: `${crosshairWidth}px ${crosshairStyle} ${crosshairColor}` }}
                  />
                </div>
              </div>
            )}

            {/* === CANDLES TAB === */}
            {activeTab === 'candles' && (
              <div className="space-y-4">
                {/* Bullish */}
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)' }}>
                  <h4 className="text-[11px] font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#4ade80' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: candleUpColor }} />
                    Bougie Haussiere
                  </h4>
                  <div className="space-y-3">
                    <ColorPicker label="Corps" value={candleUpColor} onChange={(c) => onCandleChange({ upColor: c })} palette={COLOR_PRESETS.greens} />
                    <ColorPicker label="Meche" value={wickUpColor} onChange={(c) => onCandleChange({ wickUp: c })} palette={COLOR_PRESETS.greens} />
                    <ColorPicker label="Bordure" value={candleBorderUp} onChange={(c) => onCandleChange({ borderUp: c })} palette={[...COLOR_PRESETS.greens, ...COLOR_PRESETS.grays.slice(0, 3)]} />
                  </div>
                </div>

                {/* Bearish */}
                <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <h4 className="text-[11px] font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#f87171' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: candleDownColor }} />
                    Bougie Baissiere
                  </h4>
                  <div className="space-y-3">
                    <ColorPicker label="Corps" value={candleDownColor} onChange={(c) => onCandleChange({ downColor: c })} palette={COLOR_PRESETS.reds} />
                    <ColorPicker label="Meche" value={wickDownColor} onChange={(c) => onCandleChange({ wickDown: c })} palette={COLOR_PRESETS.reds} />
                    <ColorPicker label="Bordure" value={candleBorderDown} onChange={(c) => onCandleChange({ borderDown: c })} palette={[...COLOR_PRESETS.reds, ...COLOR_PRESETS.grays.slice(0, 3)]} />
                  </div>
                </div>

                {/* Preview */}
                <div className="h-20 rounded-lg flex items-end justify-center gap-6 p-3" style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}>
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-3" style={{ backgroundColor: wickUpColor }} />
                    <div className="w-5 h-10 rounded-sm" style={{ backgroundColor: candleUpColor, border: `1px solid ${candleBorderUp}` }} />
                    <div className="w-0.5 h-2" style={{ backgroundColor: wickUpColor }} />
                    <span className="text-[8px] mt-1" style={{ color: 'var(--text-muted)' }}>Bull</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="w-0.5 h-2" style={{ backgroundColor: wickDownColor }} />
                    <div className="w-5 h-8 rounded-sm" style={{ backgroundColor: candleDownColor, border: `1px solid ${candleBorderDown}` }} />
                    <div className="w-0.5 h-4" style={{ backgroundColor: wickDownColor }} />
                    <span className="text-[8px] mt-1" style={{ color: 'var(--text-muted)' }}>Bear</span>
                  </div>
                </div>
              </div>
            )}

            {/* === BACKGROUND TAB === */}
            {activeTab === 'background' && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Fond du chart</h3>

                <ColorPicker
                  label="Couleur de fond"
                  value={backgroundColor}
                  onChange={(c) => onBackgroundChange({ color: c })}
                  palette={COLOR_PRESETS.grays}
                />

                <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <ToggleSwitch
                    label="Grille"
                    description="Lignes horizontales et verticales"
                    value={showGrid}
                    onChange={(v) => onBackgroundChange({ showGrid: v })}
                  />
                </div>

                {showGrid && (
                  <ColorPicker
                    label="Couleur grille"
                    value={gridColor}
                    onChange={(c) => onBackgroundChange({ gridColor: c })}
                    palette={['#0d0d0d', '#141414', '#1a1a1a', '#222222', '#2a2a2a', '#333333', '#1a2a1a', '#1a1a2a', '#2a1a2a']}
                  />
                )}

                {/* Preview */}
                <div className="h-24 rounded-lg relative overflow-hidden" style={{ backgroundColor, border: '1px solid var(--border)' }}>
                  {showGrid && (
                    <>
                      {[0.25, 0.5, 0.75].map(p => (
                        <div key={`h-${p}`} className="absolute left-0 right-0 h-px" style={{ top: `${p * 100}%`, backgroundColor: gridColor }} />
                      ))}
                      {[0.25, 0.5, 0.75].map(p => (
                        <div key={`v-${p}`} className="absolute top-0 bottom-0 w-px" style={{ left: `${p * 100}%`, backgroundColor: gridColor }} />
                      ))}
                    </>
                  )}
                  <div className="absolute bottom-3 left-[20%] w-2.5 h-7 rounded-sm" style={{ backgroundColor: candleUpColor }} />
                  <div className="absolute bottom-3 left-[40%] w-2.5 h-5 rounded-sm" style={{ backgroundColor: candleDownColor }} />
                  <div className="absolute bottom-3 left-[60%] w-2.5 h-9 rounded-sm" style={{ backgroundColor: candleUpColor }} />
                  <div className="absolute bottom-3 left-[80%] w-2.5 h-4 rounded-sm" style={{ backgroundColor: candleDownColor }} />
                </div>
              </div>
            )}

            {/* === SCALE TAB === */}
            {activeTab === 'scale' && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Affichage</h3>

                <ToggleSwitch
                  label="Volume"
                  description="Barres de volume en bas du chart"
                  value={showVolume}
                  onChange={setShowVolume}
                />

                <ToggleSwitch
                  label="Grille"
                  description="Lignes de la grille"
                  value={showGrid}
                  onChange={(v) => onBackgroundChange({ showGrid: v })}
                />

                <ToggleSwitch
                  label="Tooltip OHLCV"
                  description="Informations au survol de la souris"
                  value={showCrosshairTooltip}
                  onChange={setShowCrosshairTooltip}
                />

                <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Ligne de prix</h3>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: '#22c55e' }} />
                      <span>Vert quand le prix monte</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <div className="w-3 h-[2px] rounded-full" style={{ backgroundColor: '#ef4444' }} />
                      <span>Rouge quand le prix baisse</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                        <circle cx="8" cy="8" r="5" />
                        <line x1="8" y1="5" x2="8" y2="8" />
                        <line x1="8" y1="8" x2="10" y2="10" />
                      </svg>
                      <span>Countdown integre dans le rectangle</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* === TEMPLATES TAB === */}
            {activeTab === 'templates' && (
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Templates sauvegardés</h3>

                {templates.length === 0 ? (
                  <div className="text-center py-6">
                    <svg className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Aucun template</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Clic droit sur le chart pour sauvegarder</p>
                  </div>
                ) : (
                  templates.map(template => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-2.5 rounded-lg group"
                      style={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex-1 min-w-0">
                        {editingTemplateId === template.id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={handleSaveRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename();
                              if (e.key === 'Escape') { setEditingTemplateId(null); setEditingName(''); }
                            }}
                            autoFocus
                            className="w-full bg-transparent border-b text-[12px] focus:outline-none px-0 py-0.5"
                            style={{ borderColor: 'var(--primary)', color: 'var(--text-primary)' }}
                          />
                        ) : (
                          <>
                            <h4 className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{template.name}</h4>
                            <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                              {new Date(template.createdAt).toLocaleDateString('fr-FR')}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartRename(template)}
                          className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-white/10"
                          style={{ color: 'var(--text-muted)' }}
                          title="Renommer"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-red-500/20"
                          style={{ color: 'var(--text-muted)' }}
                          title="Supprimer"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--background)' }}>
          <button
            onClick={() => {
              onCrosshairChange({ color: '#6b7280', width: 1, style: 'dashed' });
              onCandleChange({ upColor: '#22c55e', downColor: '#ef4444', wickUp: '#22c55e', wickDown: '#ef4444', borderUp: '#22c55e', borderDown: '#ef4444' });
              onBackgroundChange({ color: '#0a0a0a', showGrid: true, gridColor: '#1a1a1a' });
            }}
            className="text-[10px] transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            Reset defaults
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md text-[11px] font-medium transition-colors"
            style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
