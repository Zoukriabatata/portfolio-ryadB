'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useIndicatorStore } from '@/stores/useIndicatorStore';
import { DEFAULT_INDICATORS } from '@/types/charts';
import type { IndicatorConfig, IndicatorLineStyle, IndicatorSource } from '@/types/charts';

const COLOR_PRESETS = [
  '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6',
  '#a78bfa', '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#eab308', '#84cc16', '#22d3ee', '#ffffff',
  '#a3a3a3', '#737373', '#525252',
];

const SOURCE_OPTIONS: { value: IndicatorSource; label: string }[] = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'hl2', label: 'HL/2' },
  { value: 'hlc3', label: 'HLC/3' },
  { value: 'ohlc4', label: 'OHLC/4' },
];

const LINE_STYLES: { value: IndicatorLineStyle; label: string; preview: string }[] = [
  { value: 'solid', label: 'Solide', preview: '━━━━' },
  { value: 'dashed', label: 'Tirets', preview: '─ ─ ─' },
  { value: 'dotted', label: 'Points', preview: '· · · ·' },
];

interface IndicatorSettingsPanelProps {
  indicatorId: string;
  onClose: () => void;
  position?: { x: number; y: number };
}

export default function IndicatorSettingsPanel({ indicatorId, onClose, position }: IndicatorSettingsPanelProps) {
  const { indicators, updateIndicator, removeIndicator, toggleIndicator, addIndicator } = useIndicatorStore();
  const indicator = indicators.find(i => i.id === indicatorId);
  const panelRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState(position || { x: 200, y: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timeout = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(timeout); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  // Dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-content')) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 280, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 400, e.clientY - dragOffset.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, dragOffset]);

  if (!indicator) return null;

  const updateStyle = (updates: Partial<IndicatorConfig['style']>) => {
    updateIndicator(indicatorId, { style: { ...indicator.style, ...updates } });
  };

  const updateParams = (updates: Record<string, number>) => {
    updateIndicator(indicatorId, { params: { ...indicator.params, ...updates } });
  };

  const handleDuplicate = () => {
    const newId = `${indicator.type.toLowerCase()}_${Date.now()}`;
    addIndicator({
      ...indicator,
      id: newId,
      enabled: true,
    });
  };

  const handleReset = () => {
    const defaultInd = DEFAULT_INDICATORS.find(d => d.type === indicator.type);
    if (defaultInd) {
      updateIndicator(indicatorId, {
        params: { ...defaultInd.params },
        style: { ...defaultInd.style },
      });
    }
  };

  const label = indicator.type === 'SMA' || indicator.type === 'EMA'
    ? `${indicator.type} (${indicator.params.period || 20})`
    : indicator.type === 'BollingerBands' ? 'Bollinger Bands'
    : indicator.type;

  const hasSource = indicator.type === 'SMA' || indicator.type === 'EMA' || indicator.type === 'BollingerBands';
  const hasLineStyle = true;

  return (
    <div
      ref={panelRef}
      className="fixed z-[60] select-none"
      style={{ left: pos.x, top: pos.y, width: 272 }}
    >
      <div className="rounded-lg overflow-hidden shadow-2xl" style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-move"
          style={{ borderBottom: '1px solid var(--border)' }}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: indicator.style.color }} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleIndicator(indicatorId)}
              className="w-5 h-5 rounded flex items-center justify-center transition-colors"
              style={{ color: indicator.enabled ? 'var(--primary)' : 'var(--text-muted)' }}
              title={indicator.enabled ? 'Désactiver' : 'Activer'}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                {indicator.enabled ? (
                  <><path d="M1 8a7 7 0 1014 0A7 7 0 001 8z" /><path d="M5 8l2 2 4-4" /></>
                ) : (
                  <circle cx="8" cy="8" r="7" />
                )}
              </svg>
            </button>
            <button
              onClick={onClose}
              className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="panel-content p-3 space-y-3" style={{ maxHeight: 420, overflowY: 'auto', scrollbarWidth: 'thin' }}>
          {/* Color */}
          <Section label="Couleur">
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => updateStyle({ color: c })}
                  className={`w-5 h-5 rounded-md transition-all hover:scale-110 ${
                    indicator.style.color === c ? 'ring-2 ring-white/50 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <div className="relative">
                <input
                  type="color"
                  value={indicator.style.color}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                  className="w-5 h-5 rounded-md cursor-pointer opacity-0 absolute inset-0"
                />
                <div className="w-5 h-5 rounded-md border border-dashed flex items-center justify-center" style={{ borderColor: 'var(--text-muted)' }}>
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                    <circle cx="8" cy="8" r="5" />
                  </svg>
                </div>
              </div>
            </div>
          </Section>

          {/* Line Width */}
          {hasLineStyle && (
            <Slider
              label="Epaisseur"
              value={indicator.style.lineWidth}
              min={0.5}
              max={5}
              step={0.5}
              unit="px"
              onChange={(v) => updateStyle({ lineWidth: v })}
            />
          )}

          {/* Line Style */}
          {hasLineStyle && (
            <Section label="Style de ligne">
              <div className="flex gap-1">
                {LINE_STYLES.map(s => (
                  <button
                    key={s.value}
                    onClick={() => updateStyle({ lineStyle: s.value })}
                    className="flex-1 py-1 rounded text-center transition-all"
                    style={{
                      backgroundColor: (indicator.style.lineStyle || 'solid') === s.value ? 'var(--primary)' : 'var(--background)',
                      color: (indicator.style.lineStyle || 'solid') === s.value ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${(indicator.style.lineStyle || 'solid') === s.value ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="text-[8px] font-mono tracking-wider">{s.preview}</div>
                    <div className="text-[8px] mt-0.5">{s.label}</div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Opacity */}
          <Slider
            label="Opacité"
            value={Math.round((indicator.style.opacity ?? 0.85) * 100)}
            min={10}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => updateStyle({ opacity: v / 100 })}
          />

          {/* Source - for SMA/EMA/BB */}
          {hasSource && (
            <Section label="Source">
              <div className="grid grid-cols-4 gap-1">
                {SOURCE_OPTIONS.map(src => (
                  <button
                    key={src.value}
                    onClick={() => updateStyle({ source: src.value })}
                    className="py-1 rounded text-[9px] font-mono transition-all"
                    style={{
                      backgroundColor: (indicator.style.source || 'close') === src.value ? 'var(--primary)' : 'var(--background)',
                      color: (indicator.style.source || 'close') === src.value ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${(indicator.style.source || 'close') === src.value ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {src.label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Period - for SMA, EMA, BB */}
          {(indicator.type === 'SMA' || indicator.type === 'EMA' || indicator.type === 'BollingerBands') && (
            <>
              <Slider
                label="Periode"
                value={indicator.params.period || 20}
                min={2}
                max={500}
                step={1}
                onChange={(v) => updateParams({ period: v })}
              />
              <div className="flex gap-1">
                {(indicator.type === 'SMA' || indicator.type === 'EMA'
                  ? [5, 9, 14, 21, 50, 100, 200]
                  : [10, 15, 20, 25, 30]
                ).map(p => (
                  <button
                    key={p}
                    onClick={() => updateParams({ period: p })}
                    className="flex-1 py-0.5 rounded text-[9px] font-mono transition-colors"
                    style={{
                      backgroundColor: (indicator.params.period || 20) === p ? 'var(--primary)' : 'var(--background)',
                      color: (indicator.params.period || 20) === p ? '#fff' : 'var(--text-muted)',
                      border: `1px solid ${(indicator.params.period || 20) === p ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Bollinger StdDev + Fill */}
          {indicator.type === 'BollingerBands' && (
            <>
              <Slider
                label="Ecart type (σ)"
                value={indicator.params.stdDev || 2}
                min={0.5}
                max={4}
                step={0.5}
                onChange={(v) => updateParams({ stdDev: v })}
              />
              <Slider
                label="Remplissage bandes"
                value={Math.round((indicator.style.fillOpacity ?? 0.05) * 100)}
                min={0}
                max={30}
                step={1}
                unit="%"
                onChange={(v) => updateStyle({ fillOpacity: v / 100 })}
              />
            </>
          )}

          {/* VWAP bands */}
          {indicator.type === 'VWAP' && (
            <Section label="Bandes de déviation">
              <div className="space-y-1.5">
                {[
                  { key: 'showBand1', label: '±1σ', desc: 'Bande 1 écart-type' },
                  { key: 'showBand2', label: '±2σ', desc: 'Bande 2 écarts-types' },
                  { key: 'showBand3', label: '±3σ', desc: 'Bande 3 écarts-types' },
                ].map(band => (
                  <div key={band.key} className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>{band.label}</span>
                      <span className="text-[9px] ml-1.5" style={{ color: 'var(--text-muted)' }}>{band.desc}</span>
                    </div>
                    <button
                      onClick={() => updateParams({ [band.key]: indicator.params[band.key] === 1 ? 0 : 1 })}
                      className="w-8 h-4.5 rounded-full transition-all flex items-center"
                      style={{
                        backgroundColor: indicator.params[band.key] === 1 ? 'var(--primary)' : 'var(--surface-elevated)',
                        justifyContent: indicator.params[band.key] === 1 ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm mx-0.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Show Label Toggle */}
          <div className="flex items-center justify-between py-1">
            <span className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Afficher label</span>
            <button
              onClick={() => updateStyle({ showLabel: indicator.style.showLabel === false ? true : false })}
              className="w-8 h-4.5 rounded-full transition-all flex items-center"
              style={{
                backgroundColor: indicator.style.showLabel !== false ? 'var(--primary)' : 'var(--surface-elevated)',
                justifyContent: indicator.style.showLabel !== false ? 'flex-end' : 'flex-start',
              }}
            >
              <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm mx-0.5" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { removeIndicator(indicatorId); onClose(); }}
              className="text-[10px] transition-colors hover:opacity-80"
              style={{ color: '#ef4444' }}
            >
              Supprimer
            </button>
            <button
              onClick={handleDuplicate}
              className="text-[10px] transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              title="Dupliquer cet indicateur"
            >
              Dupliquer
            </button>
            <button
              onClick={handleReset}
              className="text-[10px] transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
              title="Réinitialiser les paramètres"
            >
              Reset
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded text-[10px] font-medium transition-colors"
            style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Reusable sub-components ---

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: {
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
        <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>
        <span className="text-[9px] font-mono" style={{ color: 'var(--text-secondary)' }}>{value}{unit || ''}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-[var(--primary)]"
        style={{ backgroundColor: 'var(--surface-elevated)' }}
      />
    </div>
  );
}
