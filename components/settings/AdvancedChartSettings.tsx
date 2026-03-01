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
  const [hexInput, setHexInput] = useState(value);

  // Sync hex input when value changes externally
  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexSubmit = () => {
    const hex = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onChange(hex);
    } else {
      setHexInput(value); // revert
    }
  };

  return (
    <div>
      <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap gap-1 flex-1">
          {palette.map(color => (
            <button
              key={color}
              onClick={() => onChange(color)}
              className={`w-5 h-5 rounded transition-all hover:scale-110 ${
                value.toLowerCase() === color.toLowerCase() ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--surface)] scale-110' : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        {/* HEX input + swatch */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-5 h-5 rounded border border-[var(--border)]" style={{ backgroundColor: value }} />
          <input
            type="text"
            value={hexInput.toUpperCase()}
            onChange={(e) => {
              let v = e.target.value;
              if (!v.startsWith('#')) v = '#' + v;
              if (v.length <= 7) setHexInput(v);
            }}
            onBlur={handleHexSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleHexSubmit(); }}
            className="w-[72px] h-5 text-[10px] font-mono text-center rounded px-1
              bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]
              focus:border-[var(--primary)] focus:outline-none"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

/** Inline HEX color input with HSV popover picker */
function HexInput({ value, onChange, size = 'sm' }: {
  value: string;
  onChange: (color: string) => void;
  size?: 'sm' | 'md';
}) {
  const [hex, setHex] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setHex(value); }, [value]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const commit = () => {
    const h = hex.startsWith('#') ? hex : `#${hex}`;
    if (/^#[0-9a-fA-F]{6}$/.test(h)) onChange(h);
    else setHex(value);
  };
  const w = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const inputW = size === 'sm' ? 'w-[58px] h-4 text-[9px]' : 'w-[68px] h-5 text-[10px]';
  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          className={`${w} rounded-sm cursor-pointer hover:ring-1 hover:ring-[var(--primary)] transition-all`}
          style={{ backgroundColor: value, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
        />
        <input
          type="text"
          value={hex.toUpperCase()}
          onChange={(e) => { let v = e.target.value; if (!v.startsWith('#')) v = '#' + v; if (v.length <= 7) setHex(v); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className={`${inputW} font-mono text-center rounded px-1
            bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]
            focus:border-[var(--primary)] focus:outline-none`}
          spellCheck={false}
        />
      </div>
      {pickerOpen && (
        <div className="absolute z-50 mt-1 right-0" style={{
          width: 220,
          padding: 10,
          borderRadius: 10,
          backgroundColor: '#1c1f26',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <InlineHSVPicker value={value} onChange={(c) => { onChange(c); setHex(c); }} />
        </div>
      )}
    </div>
  );
}

/** Minimal inline HSV picker — SV square + hue bar + presets */
function InlineHSVPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [bright, setBright] = useState(100);
  const svRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const isSvDrag = useRef(false);
  const isHueDrag = useRef(false);
  const skipSync = useRef(false);

  const hsvToHex = (h: number, s: number, v: number): string => {
    const s1 = s / 100, v1 = v / 100;
    const c = v1 * s1, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v1 - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    const toH = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toH(r)}${toH(g)}${toH(b)}`;
  };

  const hexToHSV = (hex: string) => {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!res) return { h: 0, s: 0, v: 100 };
    const r = parseInt(res[1], 16) / 255, g = parseInt(res[2], 16) / 255, b = parseInt(res[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) { if (max === r) h = ((g - b) / d + 6) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
    return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
  };

  useEffect(() => {
    if (skipSync.current) { skipSync.current = false; return; }
    const { h, s, v } = hexToHSV(value);
    setHue(h); setSat(s); setBright(v);
  }, [value]);

  // Draw SV gradient
  useEffect(() => {
    const canvas = svRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const gradH = ctx.createLinearGradient(0, 0, w, 0);
    gradH.addColorStop(0, '#ffffff');
    gradH.addColorStop(1, hsvToHex(hue, 100, 100));
    ctx.fillStyle = gradH; ctx.fillRect(0, 0, w, h);
    const gradV = ctx.createLinearGradient(0, 0, 0, h);
    gradV.addColorStop(0, 'rgba(0,0,0,0)');
    gradV.addColorStop(1, '#000000');
    ctx.fillStyle = gradV; ctx.fillRect(0, 0, w, h);
  }, [hue]);

  // Draw hue bar
  useEffect(() => {
    const canvas = hueRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, hsvToHex(i * 60, 100, 100));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const emit = (h: number, s: number, v: number) => {
    skipSync.current = true;
    onChange(hsvToHex(h, s, v));
  };

  const handleSV = (e: React.PointerEvent, start = false) => {
    if (start) { isSvDrag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }
    if (!isSvDrag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const s = x * 100, v = (1 - y) * 100;
    setSat(s); setBright(v); emit(hue, s, v);
  };

  const handleHue = (e: React.PointerEvent, start = false) => {
    if (start) { isHueDrag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }
    if (!isHueDrag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, (e.clientX - rect.left) / rect.width * 360));
    setHue(h); emit(h, sat, bright);
  };

  const stopDrag = () => { isSvDrag.current = false; isHueDrag.current = false; };

  const PRESETS = ['#22c55e', '#ef4444', '#3b82f6', '#fbbf24', '#a855f7', '#06b6d4', '#ec4899', '#f97316', '#ffffff', '#525252'];

  return (
    <div>
      {/* SV square */}
      <div className="relative mb-1.5 rounded overflow-hidden" style={{ height: 100, border: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas ref={svRef} width={200} height={100} className="w-full h-full cursor-crosshair"
          onPointerDown={(e) => handleSV(e, true)} onPointerMove={handleSV} onPointerUp={stopDrag} />
        <div className="absolute pointer-events-none" style={{
          left: `${(sat / 100) * 100}%`, top: `${(1 - bright / 100) * 100}%`,
          width: 8, height: 8, transform: 'translate(-50%, -50%)',
          borderRadius: '50%', border: '1.5px solid #fff', boxShadow: '0 0 2px rgba(0,0,0,0.8)',
        }} />
      </div>
      {/* Hue bar */}
      <div className="relative mb-2 rounded overflow-hidden" style={{ height: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
        <canvas ref={hueRef} width={200} height={12} className="w-full h-full cursor-ew-resize"
          onPointerDown={(e) => handleHue(e, true)} onPointerMove={handleHue} onPointerUp={stopDrag} />
        <div className="absolute top-0 pointer-events-none" style={{
          left: `${(hue / 360) * 100}%`, width: 3, height: '100%',
          transform: 'translateX(-50%)', backgroundColor: '#fff', borderRadius: 1,
          boxShadow: '0 0 2px rgba(0,0,0,0.6)',
        }} />
      </div>
      {/* Presets */}
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(c => (
          <button key={c} onClick={() => onChange(c)}
            className={`w-4 h-4 rounded-sm transition-all hover:scale-110 ${value.toLowerCase() === c.toLowerCase() ? 'ring-1 ring-[var(--primary)]' : ''}`}
            style={{ backgroundColor: c, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }} />
        ))}
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

function VPLineRow({ label, enabled, color, width, lineStyle, showLabel, onToggle, onColor, onWidth, onStyle, onLabel }: {
  label: string;
  enabled: boolean;
  color: string;
  width: number;
  lineStyle: 'solid' | 'dashed';
  showLabel: boolean;
  onToggle: (v: boolean) => void;
  onColor: (v: string) => void;
  onWidth: (v: number) => void;
  onStyle: (v: 'solid' | 'dashed') => void;
  onLabel: (v: boolean) => void;
}) {
  return (
    <div className="mb-3 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(!enabled)}
            className="w-7 h-4 rounded-full transition-all flex items-center"
            style={{ backgroundColor: enabled ? 'var(--primary)' : 'var(--surface-elevated)', justifyContent: enabled ? 'flex-end' : 'flex-start' }}
          >
            <div className="w-3 h-3 rounded-full bg-white shadow-sm mx-0.5" />
          </button>
          <span className="text-[11px] font-semibold" style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
        </div>
        {enabled && (
          <div className="flex items-center gap-1.5">
            {/* Color dots */}
            {['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#ffffff'].map(c => (
              <button key={c} onClick={() => onColor(c)}
                className="w-3.5 h-3.5 rounded-full transition-transform hover:scale-125"
                style={{ backgroundColor: c, border: `1.5px solid ${color === c ? 'var(--primary)' : 'var(--border)'}` }}
              />
            ))}
          </div>
        )}
      </div>
      {enabled && (
        <div className="flex items-center gap-3 pl-9">
          {/* Width */}
          <div className="flex items-center gap-1">
            <input type="range" min={0.5} max={3} step={0.5} value={width}
              onChange={(e) => onWidth(parseFloat(e.target.value))}
              className="w-12 h-1 accent-[var(--primary)]"
            />
            <span className="text-[9px] font-mono w-5" style={{ color: 'var(--text-muted)' }}>{width}px</span>
          </div>
          {/* Style */}
          <div className="flex gap-0.5">
            {(['solid', 'dashed'] as const).map(s => (
              <button key={s} onClick={() => onStyle(s)}
                className="flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] transition-colors"
                style={{ backgroundColor: lineStyle === s ? 'var(--primary)' : 'var(--surface)', color: lineStyle === s ? '#fff' : 'var(--text-muted)' }}
              >
                <svg width="16" height="4" viewBox="0 0 16 4">
                  <line x1="0" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray={s === 'dashed' ? '3 2' : 'none'} />
                </svg>
              </button>
            ))}
          </div>
          {/* Label toggle */}
          <button onClick={() => onLabel(!showLabel)}
            className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
            style={{ backgroundColor: showLabel ? 'var(--primary)' : 'var(--surface)', color: showLabel ? '#fff' : 'var(--text-muted)' }}
          >Label</button>
        </div>
      )}
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
  const {
    showVolume, showCrosshairTooltip, setShowVolume, setShowCrosshairTooltip,
    showCurrentPriceLine, priceLineStyle, priceLineWidth, priceLineColor,
    priceLineOpacity, priceLabelBgColor, priceLabelTextColor, priceLabelOpacity,
    priceLabelBorderRadius,
    setShowCurrentPriceLine, setPriceLineStyle, setPriceLineWidth, setPriceLineColor,
    setPriceLineOpacity, setPriceLabelBgColor, setPriceLabelTextColor, setPriceLabelOpacity,
    setPriceLabelBorderRadius,
    // Volume bar appearance
    volumeBarBullColor, volumeBarBearColor, volumeBarOpacity,
    // VP settings
    vpPocEnabled, vpPocColor, vpPocWidth, vpPocStyle, vpPocLabel,
    vpVahEnabled, vpVahColor, vpVahWidth, vpVahStyle, vpVahLabel,
    vpValEnabled, vpValColor, vpValWidth, vpValStyle, vpValLabel,
    vpBidColor, vpAskColor, vpBarOpacity,
    vpShowBackground, vpBackgroundColor, vpBackgroundOpacity,
    // Position tool settings
    posTpColor, posSlColor, posEntryColor,
    posZoneOpacity, posShowZoneFill, posShowLabels, posDefaultCompact,
    posSmartArrow, posDynamicOpacity, posOpacityCurve, posOpacityIntensity,
    posArrowExponent, posArrowIntensity, posArrowThickness, posArrowFill,
    posProgressTrail, posTrailIntensity, posHeatFill, posHeatIntensity, posTimeWeight, posGradientMode,
    // VP Engine settings
    vpHistoryDepth, vpProfileMode, vpCustomRangeMinutes,
    vpGradientEnabled, vpAskGradientEnd, vpBidGradientEnd,
    // Volume Bubble orderflow settings
    showVolumeBubbles, setShowVolumeBubbles,
    volumeBubbleMode, volumeBubbleScaling, volumeBubbleMaxSize,
    volumeBubbleMinFilter, volumeBubbleOpacity,
    volumeBubblePositiveColor, volumeBubbleNegativeColor,
    volumeBubbleNormalization, volumeBubbleShowPieChart,
    // Cluster overlay settings
    showClusterOverlay, clusterOverlayOpacity,
    setVPSetting,
  } = usePreferencesStore();

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

                {showVolume && (
                  <div className="ml-2 space-y-2 pb-2" style={{ borderLeft: '2px solid var(--border)', paddingLeft: '10px' }}>
                    {/* Bull color */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur haussière</span>
                      <div className="flex items-center gap-1.5">
                        {['#22c55e', '#34d399', '#3b82f6', '#06b6d4', '#a3e635'].map(c => (
                          <button
                            key={c}
                            onClick={() => setVPSetting('volumeBarBullColor', c)}
                            className="w-4 h-4 rounded-sm border transition-transform hover:scale-110"
                            style={{
                              backgroundColor: c,
                              borderColor: volumeBarBullColor === c ? 'var(--primary)' : 'var(--border)',
                              boxShadow: volumeBarBullColor === c ? '0 0 0 1px var(--primary)' : 'none',
                            }}
                          />
                        ))}
                        <HexInput value={volumeBarBullColor} onChange={(c) => setVPSetting('volumeBarBullColor', c)} />
                      </div>
                    </div>
                    {/* Bear color */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur baissière</span>
                      <div className="flex items-center gap-1.5">
                        {['#ef4444', '#f87171', '#f97316', '#ec4899', '#fbbf24'].map(c => (
                          <button
                            key={c}
                            onClick={() => setVPSetting('volumeBarBearColor', c)}
                            className="w-4 h-4 rounded-sm border transition-transform hover:scale-110"
                            style={{
                              backgroundColor: c,
                              borderColor: volumeBarBearColor === c ? 'var(--primary)' : 'var(--border)',
                              boxShadow: volumeBarBearColor === c ? '0 0 0 1px var(--primary)' : 'none',
                            }}
                          />
                        ))}
                        <HexInput value={volumeBarBearColor} onChange={(c) => setVPSetting('volumeBarBearColor', c)} />
                      </div>
                    </div>
                    {/* Opacity */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Opacité</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={10}
                          max={80}
                          step={5}
                          value={Math.round(volumeBarOpacity * 100)}
                          onChange={(e) => setVPSetting('volumeBarOpacity', parseInt(e.target.value) / 100)}
                          className="w-16 h-1 accent-[var(--primary)]"
                        />
                        <span className="text-[10px] font-mono w-7 text-right" style={{ color: 'var(--text-muted)' }}>{Math.round(volumeBarOpacity * 100)}%</span>
                      </div>
                    </div>
                  </div>
                )}

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

                  <div className="space-y-3">
                    {/* Toggle visibility */}
                    <ToggleSwitch
                      label="Afficher"
                      description="Ligne du prix actuel sur le chart"
                      value={showCurrentPriceLine}
                      onChange={setShowCurrentPriceLine}
                    />

                    {showCurrentPriceLine && (
                      <>
                        {/* Line style: dashed / solid / dotted */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Style</span>
                          <div className="flex gap-1">
                            {(['dashed', 'solid', 'dotted'] as const).map(s => (
                              <button
                                key={s}
                                onClick={() => setPriceLineStyle(s)}
                                className="flex items-center justify-center px-2 py-1 rounded text-[10px] transition-colors"
                                style={{
                                  backgroundColor: priceLineStyle === s ? 'var(--primary)' : 'var(--surface)',
                                  color: priceLineStyle === s ? '#fff' : 'var(--text-secondary)',
                                  opacity: priceLineStyle === s ? 1 : 0.7,
                                }}
                              >
                                <svg width="24" height="6" viewBox="0 0 24 6">
                                  <line x1="0" y1="3" x2="24" y2="3" stroke="currentColor" strokeWidth="2"
                                    strokeDasharray={s === 'dashed' ? '4 3' : s === 'dotted' ? '2 2' : 'none'} />
                                </svg>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Line width */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Épaisseur</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={1}
                              max={4}
                              step={1}
                              value={priceLineWidth}
                              onChange={(e) => setPriceLineWidth(parseInt(e.target.value))}
                              className="w-16 h-1 accent-[var(--primary)]"
                            />
                            <span className="text-[10px] font-mono w-5 text-right" style={{ color: 'var(--text-muted)' }}>{priceLineWidth}px</span>
                          </div>
                        </div>

                        {/* Line opacity */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Opacité ligne</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={10}
                              max={100}
                              step={5}
                              value={Math.round(priceLineOpacity * 100)}
                              onChange={(e) => setPriceLineOpacity(parseInt(e.target.value) / 100)}
                              className="w-16 h-1 accent-[var(--primary)]"
                            />
                            <span className="text-[10px] font-mono w-7 text-right" style={{ color: 'var(--text-muted)' }}>{Math.round(priceLineOpacity * 100)}%</span>
                          </div>
                        </div>

                        {/* Line color */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur ligne</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPriceLineColor('')}
                              className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                              style={{
                                backgroundColor: !priceLineColor ? 'var(--primary)' : 'var(--surface)',
                                color: !priceLineColor ? '#fff' : 'var(--text-muted)',
                              }}
                            >Auto</button>
                            {['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ffffff'].map(c => (
                              <button
                                key={c}
                                onClick={() => setPriceLineColor(c)}
                                className="w-4 h-4 rounded-sm border transition-transform hover:scale-110"
                                style={{
                                  backgroundColor: c,
                                  borderColor: priceLineColor === c ? 'var(--primary)' : 'var(--border)',
                                  boxShadow: priceLineColor === c ? '0 0 0 1px var(--primary)' : 'none',
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dimmed)' }}>Label</span>
                        </div>

                        {/* Label bg color */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Fond label</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPriceLabelBgColor('')}
                              className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                              style={{
                                backgroundColor: !priceLabelBgColor ? 'var(--primary)' : 'var(--surface)',
                                color: !priceLabelBgColor ? '#fff' : 'var(--text-muted)',
                              }}
                            >Auto</button>
                            {['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#374151'].map(c => (
                              <button
                                key={c}
                                onClick={() => setPriceLabelBgColor(c)}
                                className="w-4 h-4 rounded-sm border transition-transform hover:scale-110"
                                style={{
                                  backgroundColor: c,
                                  borderColor: priceLabelBgColor === c ? 'var(--primary)' : 'var(--border)',
                                  boxShadow: priceLabelBgColor === c ? '0 0 0 1px var(--primary)' : 'none',
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Label text color */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Texte label</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPriceLabelTextColor('auto')}
                              className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                              style={{
                                backgroundColor: priceLabelTextColor === 'auto' ? 'var(--primary)' : 'var(--surface)',
                                color: priceLabelTextColor === 'auto' ? '#fff' : 'var(--text-muted)',
                              }}
                            >Auto</button>
                            {['#ffffff', '#000000', '#e5e7eb', '#fbbf24'].map(c => (
                              <button
                                key={c}
                                onClick={() => setPriceLabelTextColor(c)}
                                className="w-4 h-4 rounded-sm border transition-transform hover:scale-110"
                                style={{
                                  backgroundColor: c,
                                  borderColor: priceLabelTextColor === c ? 'var(--primary)' : 'var(--border)',
                                  boxShadow: priceLabelTextColor === c ? '0 0 0 1px var(--primary)' : 'none',
                                }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Label opacity */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Opacité label</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={50}
                              max={100}
                              step={5}
                              value={Math.round(priceLabelOpacity * 100)}
                              onChange={(e) => setPriceLabelOpacity(parseInt(e.target.value) / 100)}
                              className="w-16 h-1 accent-[var(--primary)]"
                            />
                            <span className="text-[10px] font-mono w-7 text-right" style={{ color: 'var(--text-muted)' }}>{Math.round(priceLabelOpacity * 100)}%</span>
                          </div>
                        </div>

                        {/* Label border radius */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Arrondi label</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0}
                              max={8}
                              step={1}
                              value={priceLabelBorderRadius}
                              onChange={(e) => setPriceLabelBorderRadius(parseInt(e.target.value))}
                              className="w-16 h-1 accent-[var(--primary)]"
                            />
                            <span className="text-[10px] font-mono w-5 text-right" style={{ color: 'var(--text-muted)' }}>{priceLabelBorderRadius}px</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ═══ VOLUME PROFILE SECTION ═══ */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Volume Profile</h3>

                  {/* Profile Mode */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Mode</span>
                    <div className="flex gap-1">
                      {(['session', 'visible', 'custom'] as const).map(mode => (
                        <button key={mode} onClick={() => setVPSetting('vpProfileMode', mode)}
                          className="px-2 py-0.5 rounded text-[10px] transition-colors"
                          style={{
                            backgroundColor: vpProfileMode === mode ? 'var(--primary)' : 'var(--surface-elevated)',
                            color: vpProfileMode === mode ? '#fff' : 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {mode === 'session' ? 'Session' : mode === 'visible' ? 'Visible' : 'Custom'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* History Depth */}
                  {vpProfileMode !== 'visible' && (
                    <SliderControl
                      label={vpProfileMode === 'custom' ? 'Profondeur personnalisée' : 'Profondeur historique'}
                      value={vpProfileMode === 'custom' ? vpCustomRangeMinutes : vpHistoryDepth}
                      min={30} max={480} step={30} unit="min"
                      onChange={(v) => setVPSetting(vpProfileMode === 'custom' ? 'vpCustomRangeMinutes' : 'vpHistoryDepth', v)}
                    />
                  )}

                  <div className="my-2" style={{ borderTop: '1px solid var(--border)' }} />

                  {/* POC Line */}
                  <VPLineRow
                    label="POC" enabled={vpPocEnabled} color={vpPocColor} width={vpPocWidth}
                    lineStyle={vpPocStyle} showLabel={vpPocLabel}
                    onToggle={(v) => setVPSetting('vpPocEnabled', v)}
                    onColor={(v) => setVPSetting('vpPocColor', v)}
                    onWidth={(v) => setVPSetting('vpPocWidth', v)}
                    onStyle={(v) => setVPSetting('vpPocStyle', v)}
                    onLabel={(v) => setVPSetting('vpPocLabel', v)}
                  />

                  {/* VAH Line */}
                  <VPLineRow
                    label="VAH" enabled={vpVahEnabled} color={vpVahColor} width={vpVahWidth}
                    lineStyle={vpVahStyle} showLabel={vpVahLabel}
                    onToggle={(v) => setVPSetting('vpVahEnabled', v)}
                    onColor={(v) => setVPSetting('vpVahColor', v)}
                    onWidth={(v) => setVPSetting('vpVahWidth', v)}
                    onStyle={(v) => setVPSetting('vpVahStyle', v)}
                    onLabel={(v) => setVPSetting('vpVahLabel', v)}
                  />

                  {/* VAL Line */}
                  <VPLineRow
                    label="VAL" enabled={vpValEnabled} color={vpValColor} width={vpValWidth}
                    lineStyle={vpValStyle} showLabel={vpValLabel}
                    onToggle={(v) => setVPSetting('vpValEnabled', v)}
                    onColor={(v) => setVPSetting('vpValColor', v)}
                    onWidth={(v) => setVPSetting('vpValWidth', v)}
                    onStyle={(v) => setVPSetting('vpValStyle', v)}
                    onLabel={(v) => setVPSetting('vpValLabel', v)}
                  />
                </div>

                {/* ═══ VP BARS ═══ */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Barres VP</h3>

                  <div className="space-y-3">
                    {/* Ask (Buy) color */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Ask (Buy)</span>
                        <HexInput value={vpAskColor} onChange={(c) => setVPSetting('vpAskColor', c)} />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {['#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fbbf24', '#f59e0b', '#84cc16', '#ffffff'].map(c => (
                          <button key={c} onClick={() => setVPSetting('vpAskColor', c)}
                            className="w-[18px] h-[18px] rounded-sm transition-all hover:scale-110"
                            style={{ backgroundColor: c, border: `1.5px solid ${vpAskColor === c ? 'var(--primary)' : 'transparent'}`, boxShadow: vpAskColor === c ? '0 0 0 1px var(--primary)' : 'inset 0 0 0 0.5px rgba(255,255,255,0.1)' }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Bid (Sell) color */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Bid (Sell)</span>
                        <HexInput value={vpBidColor} onChange={(c) => setVPSetting('vpBidColor', c)} />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {['#ef4444', '#f43f5e', '#e11d48', '#ec4899', '#d946ef', '#c084fc', '#a855f7', '#f97316', '#fb923c', '#fbbf24', '#facc15', '#f59e0b', '#06b6d4', '#3b82f6', '#84cc16', '#ffffff'].map(c => (
                          <button key={c} onClick={() => setVPSetting('vpBidColor', c)}
                            className="w-[18px] h-[18px] rounded-sm transition-all hover:scale-110"
                            style={{ backgroundColor: c, border: `1.5px solid ${vpBidColor === c ? 'var(--primary)' : 'transparent'}`, boxShadow: vpBidColor === c ? '0 0 0 1px var(--primary)' : 'inset 0 0 0 0.5px rgba(255,255,255,0.1)' }}
                          />
                        ))}
                      </div>
                    </div>

                    <SliderControl label="Opacité barres" value={Math.round(vpBarOpacity * 100)} min={10} max={100} step={5} unit="%" onChange={(v) => setVPSetting('vpBarOpacity', v / 100)} />

                    {/* Gradient intensity */}
                    <ToggleSwitch label="Gradient intensité" description="Couleur varie selon le volume" value={vpGradientEnabled} onChange={(v) => setVPSetting('vpGradientEnabled', v)} />

                    {vpGradientEnabled && (
                      <div className="space-y-2 mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ask (min)</span>
                          <div className="flex items-center gap-1.5">
                            {['#0a3d1a', '#1a2e1a', '#0a2d3d', '#1a1a2e', '#0a0a0a', '#0d2818', '#0a1a2e'].map(c => (
                              <button key={c} onClick={() => setVPSetting('vpAskGradientEnd', c)}
                                className="w-3.5 h-3.5 rounded-sm transition-transform hover:scale-110"
                                style={{ backgroundColor: c, border: `1px solid ${vpAskGradientEnd === c ? 'var(--primary)' : 'var(--border)'}` }}
                              />
                            ))}
                            <HexInput value={vpAskGradientEnd} onChange={(c) => setVPSetting('vpAskGradientEnd', c)} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Bid (min)</span>
                          <div className="flex items-center gap-1.5">
                            {['#3d0a0a', '#2e1a1a', '#3d1a0a', '#2e1a2e', '#0a0a0a', '#281008', '#2e0a1a'].map(c => (
                              <button key={c} onClick={() => setVPSetting('vpBidGradientEnd', c)}
                                className="w-3.5 h-3.5 rounded-sm transition-transform hover:scale-110"
                                style={{ backgroundColor: c, border: `1px solid ${vpBidGradientEnd === c ? 'var(--primary)' : 'var(--border)'}` }}
                              />
                            ))}
                            <HexInput value={vpBidGradientEnd} onChange={(c) => setVPSetting('vpBidGradientEnd', c)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ VP BACKGROUND ═══ */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <ToggleSwitch label="Background VP" description="Fond de couleur derrière le volume profile" value={vpShowBackground} onChange={(v) => setVPSetting('vpShowBackground', v)} />

                  {vpShowBackground && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur</span>
                        <div className="flex items-center gap-1.5">
                          {['#3b82f6', '#22c55e', '#8b5cf6', '#525252', '#171717', '#0ea5e9', '#f59e0b', '#ec4899'].map(c => (
                            <button key={c} onClick={() => setVPSetting('vpBackgroundColor', c)}
                              className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
                              style={{ backgroundColor: c, border: `1px solid ${vpBackgroundColor === c ? 'var(--primary)' : 'var(--border)'}`, boxShadow: vpBackgroundColor === c ? '0 0 0 1px var(--primary)' : 'none' }}
                            />
                          ))}
                          <HexInput value={vpBackgroundColor} onChange={(c) => setVPSetting('vpBackgroundColor', c)} />
                        </div>
                      </div>
                      <SliderControl label="Opacité fond" value={Math.round(vpBackgroundOpacity * 100)} min={1} max={30} step={1} unit="%" onChange={(v) => setVPSetting('vpBackgroundOpacity', v / 100)} />
                    </div>
                  )}
                </div>

                {/* ═══ LONG/SHORT POSITION TOOL ═══ */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Position (Long/Short)</h3>

                  <div className="space-y-2">
                    {/* TP Color */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur TP</span>
                      <div className="flex items-center gap-1.5">
                        {['#22c55e', '#3b82f6', '#06b6d4', '#fbbf24', '#a855f7', '#10b981', '#14b8a6', '#0ea5e9', '#6366f1', '#d946ef'].map(c => (
                          <button key={c} onClick={() => setVPSetting('posTpColor', c)}
                            className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: c, border: `1px solid ${posTpColor === c ? 'var(--primary)' : 'var(--border)'}`, boxShadow: posTpColor === c ? '0 0 0 1px var(--primary)' : 'none' }}
                          />
                        ))}
                        <HexInput value={posTpColor} onChange={(c) => setVPSetting('posTpColor', c)} />
                      </div>
                    </div>

                    {/* SL Color */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur SL</span>
                      <div className="flex items-center gap-1.5">
                        {['#ef4444', '#f97316', '#ec4899', '#fbbf24', '#a855f7', '#f43f5e', '#e11d48', '#fb923c', '#facc15', '#c084fc'].map(c => (
                          <button key={c} onClick={() => setVPSetting('posSlColor', c)}
                            className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: c, border: `1px solid ${posSlColor === c ? 'var(--primary)' : 'var(--border)'}`, boxShadow: posSlColor === c ? '0 0 0 1px var(--primary)' : 'none' }}
                          />
                        ))}
                        <HexInput value={posSlColor} onChange={(c) => setVPSetting('posSlColor', c)} />
                      </div>
                    </div>

                    {/* Entry Color */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur Entry</span>
                      <div className="flex items-center gap-1.5">
                        {['#a3a3a3', '#e5e5e5', '#737373', '#fbbf24', '#3b82f6', '#525252', '#d4d4d4', '#78716c', '#0ea5e9', '#8b5cf6'].map(c => (
                          <button key={c} onClick={() => setVPSetting('posEntryColor', c)}
                            className="w-4 h-4 rounded-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: c, border: `1px solid ${posEntryColor === c ? 'var(--primary)' : 'var(--border)'}`, boxShadow: posEntryColor === c ? '0 0 0 1px var(--primary)' : 'none' }}
                          />
                        ))}
                        <HexInput value={posEntryColor} onChange={(c) => setVPSetting('posEntryColor', c)} />
                      </div>
                    </div>

                    {/* Zone Opacity */}
                    <SliderControl label="Opacité base" value={Math.round(posZoneOpacity * 100)} min={2} max={40} step={1} unit="%" onChange={(v) => setVPSetting('posZoneOpacity', v / 100)} />

                    {/* Toggle: Zone Fill */}
                    <ToggleSwitch label="Remplissage zones" description="Afficher les zones TP/SL colorées" value={posShowZoneFill} onChange={(v) => setVPSetting('posShowZoneFill', v)} />

                    {/* Toggle: Show Labels */}
                    <ToggleSwitch label="Afficher labels" description="Labels Entry, TP, SL avec prix et R:R" value={posShowLabels} onChange={(v) => setVPSetting('posShowLabels', v)} />

                    {/* Toggle: Compact Mode */}
                    <ToggleSwitch label="Mode minimal" description="Lignes pures sans labels ni informations" value={posDefaultCompact} onChange={(v) => setVPSetting('posDefaultCompact', v)} />

                    {/* Toggle: Smart Arrow */}
                    <ToggleSwitch label="Smart Arrow" description="Flèche interne suivant le prix en temps réel" value={posSmartArrow} onChange={(v) => setVPSetting('posSmartArrow', v)} />

                    {posSmartArrow && (
                      <div className="space-y-2 mt-1 pl-2" style={{ borderLeft: '2px solid var(--border)' }}>
                        <SliderControl label="Exposant" value={posArrowExponent} min={1} max={3} step={0.1} onChange={(v) => setVPSetting('posArrowExponent', v)} />
                        <SliderControl label="Intensité" value={posArrowIntensity} min={0} max={100} step={5} unit="%" onChange={(v) => setVPSetting('posArrowIntensity', v)} />
                        <SliderControl label="Épaisseur" value={posArrowThickness} min={1} max={3} step={0.2} unit="px" onChange={(v) => setVPSetting('posArrowThickness', v)} />
                        <SliderControl label="Poids temps/prix" value={posTimeWeight} min={10} max={90} step={5} unit="%" onChange={(v) => setVPSetting('posTimeWeight', v)} />

                        <ToggleSwitch label="Traînée" description="Trail subtil derrière la flèche" value={posProgressTrail} onChange={(v) => setVPSetting('posProgressTrail', v)} />
                        {posProgressTrail && (
                          <SliderControl label="Intensité trail" value={posTrailIntensity} min={5} max={50} step={5} unit="%" onChange={(v) => setVPSetting('posTrailIntensity', v)} />
                        )}

                      </div>
                    )}

                    {/* Toggle: Dynamic Opacity */}
                    <ToggleSwitch label="Opacité dynamique" description="Progression exponentielle dans les zones parcourues" value={posDynamicOpacity} onChange={(v) => setVPSetting('posDynamicOpacity', v)} />

                    {posDynamicOpacity && (
                      <div className="space-y-2 mt-1 pl-2" style={{ borderLeft: '2px solid var(--border)' }}>
                        {/* Gradient Mode */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Mode gradient</span>
                          <div className="flex gap-1">
                            {(['static', 'dynamic', 'heat'] as const).map(mode => (
                              <button key={mode} onClick={() => setVPSetting('posGradientMode', mode)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                                style={{
                                  backgroundColor: posGradientMode === mode ? 'var(--primary)' : 'var(--bg-secondary)',
                                  color: posGradientMode === mode ? '#fff' : 'var(--text-secondary)',
                                  border: `1px solid ${posGradientMode === mode ? 'var(--primary)' : 'var(--border)'}`,
                                }}>
                                {mode === 'static' ? 'Static' : mode === 'dynamic' ? 'Dynamic' : 'Heat'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Opacity Curve */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Courbe</span>
                          <div className="flex gap-1">
                            {(['linear', 'exponential', 'aggressive'] as const).map(curve => (
                              <button key={curve} onClick={() => setVPSetting('posOpacityCurve', curve)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                                style={{
                                  backgroundColor: posOpacityCurve === curve ? 'var(--primary)' : 'var(--bg-secondary)',
                                  color: posOpacityCurve === curve ? '#fff' : 'var(--text-secondary)',
                                  border: `1px solid ${posOpacityCurve === curve ? 'var(--primary)' : 'var(--border)'}`,
                                }}>
                                {curve === 'linear' ? 'Linear' : curve === 'exponential' ? 'Expo' : 'Aggressif'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Intensity slider */}
                        <SliderControl label="Intensité" value={posOpacityIntensity} min={10} max={100} step={5} unit="%" onChange={(v) => setVPSetting('posOpacityIntensity', v)} />
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ VOLUME BUBBLES ═══ */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Volume Bubbles</h3>

                  <ToggleSwitch label="Activer" description="Bulles de volume sur les bougies" value={showVolumeBubbles} onChange={setShowVolumeBubbles} />

                  {showVolumeBubbles && (
                    <div className="space-y-3 mt-3">
                      {/* Mode */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Mode</span>
                        <div className="flex gap-1">
                          {([['total', 'Total'], ['delta', 'Delta'], ['bid', 'Bid'], ['ask', 'Ask']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setVPSetting('volumeBubbleMode', val)}
                              className="px-2 py-0.5 rounded text-[10px] transition-colors"
                              style={{
                                backgroundColor: volumeBubbleMode === val ? 'var(--primary)' : 'var(--surface-elevated)',
                                color: volumeBubbleMode === val ? '#fff' : 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                              }}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {/* Scaling */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Scaling</span>
                        <div className="flex gap-1">
                          {([['sqrt', 'Sqrt'], ['linear', 'Linear'], ['log', 'Log']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setVPSetting('volumeBubbleScaling', val)}
                              className="px-2 py-0.5 rounded text-[10px] transition-colors"
                              style={{
                                backgroundColor: volumeBubbleScaling === val ? 'var(--primary)' : 'var(--surface-elevated)',
                                color: volumeBubbleScaling === val ? '#fff' : 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                              }}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {/* Normalization */}
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Normalisation</span>
                        <div className="flex gap-1">
                          {([['visible', 'Visible'], ['session', 'Session'], ['rolling', 'Rolling']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setVPSetting('volumeBubbleNormalization', val)}
                              className="px-2 py-0.5 rounded text-[10px] transition-colors"
                              style={{
                                backgroundColor: volumeBubbleNormalization === val ? 'var(--primary)' : 'var(--surface-elevated)',
                                color: volumeBubbleNormalization === val ? '#fff' : 'var(--text-secondary)',
                                border: '1px solid var(--border)',
                              }}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {/* Max Size */}
                      <SliderControl label="Taille max" value={volumeBubbleMaxSize} min={10} max={60} step={2} unit="px" onChange={(v) => setVPSetting('volumeBubbleMaxSize', v)} />

                      {/* Opacity */}
                      <SliderControl label="Opacité" value={Math.round(volumeBubbleOpacity * 100)} min={10} max={100} step={5} unit="%" onChange={(v) => setVPSetting('volumeBubbleOpacity', v / 100)} />

                      {/* Min Volume Filter */}
                      <SliderControl label="Volume min" value={volumeBubbleMinFilter} min={0} max={1000} step={10} unit="" onChange={(v) => setVPSetting('volumeBubbleMinFilter', v)} />

                      {/* Pie Chart */}
                      <ToggleSwitch label="Pie Chart" description="Afficher la répartition buy/sell en camembert" value={volumeBubbleShowPieChart} onChange={(v) => setVPSetting('volumeBubbleShowPieChart', v)} />

                      {/* Positive Color */}
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur positive</span>
                          <HexInput value={volumeBubblePositiveColor} onChange={(c) => setVPSetting('volumeBubblePositiveColor', c)} />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fbbf24', '#f59e0b', '#84cc16', '#ffffff'].map(c => (
                            <button key={c} onClick={() => setVPSetting('volumeBubblePositiveColor', c)}
                              className="w-[18px] h-[18px] rounded-sm transition-all hover:scale-110"
                              style={{ backgroundColor: c, border: `1.5px solid ${volumeBubblePositiveColor === c ? 'var(--primary)' : 'transparent'}`, boxShadow: volumeBubblePositiveColor === c ? '0 0 0 1px var(--primary)' : 'inset 0 0 0 0.5px rgba(255,255,255,0.1)' }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Negative Color */}
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Couleur negative</span>
                          <HexInput value={volumeBubbleNegativeColor} onChange={(c) => setVPSetting('volumeBubbleNegativeColor', c)} />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['#ef4444', '#f43f5e', '#e11d48', '#ec4899', '#d946ef', '#c084fc', '#a855f7', '#f97316', '#fb923c', '#fbbf24', '#facc15', '#f59e0b', '#06b6d4', '#3b82f6', '#84cc16', '#ffffff'].map(c => (
                            <button key={c} onClick={() => setVPSetting('volumeBubbleNegativeColor', c)}
                              className="w-[18px] h-[18px] rounded-sm transition-all hover:scale-110"
                              style={{ backgroundColor: c, border: `1.5px solid ${volumeBubbleNegativeColor === c ? 'var(--primary)' : 'transparent'}`, boxShadow: volumeBubbleNegativeColor === c ? '0 0 0 1px var(--primary)' : 'inset 0 0 0 0.5px rgba(255,255,255,0.1)' }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ═══ CLUSTER OVERLAY ═══ */}
                <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Cluster Overlay</h3>

                  <ToggleSwitch label="Activer" description="Overlay footprint bid/ask sur les bougies" value={showClusterOverlay} onChange={(v) => setVPSetting('showClusterOverlay', v)} />

                  {showClusterOverlay && (
                    <div className="space-y-3 mt-3">
                      <SliderControl label="Opacité" value={Math.round(clusterOverlayOpacity * 100)} min={10} max={100} step={5} unit="%" onChange={(v) => setVPSetting('clusterOverlayOpacity', v / 100)} />
                    </div>
                  )}
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
