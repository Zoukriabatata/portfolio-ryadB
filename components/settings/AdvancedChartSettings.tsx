'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCrosshairStore, type CrosshairLineStyle, type MagnetMode } from '@/stores/useCrosshairStore';
import { useChartTemplatesStore, type ChartTemplate } from '@/stores/useChartTemplatesStore';

// Find the closest preset color to a custom color
function findClosestPresetColor(customColor: string, allPresets: string[]): string {
  const hex = customColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;

  let closest = allPresets[0];
  let minDist = Infinity;

  allPresets.forEach(color => {
    const h = color.replace('#', '');
    const cr = parseInt(h.substring(0, 2), 16);
    const cg = parseInt(h.substring(2, 4), 16);
    const cb = parseInt(h.substring(4, 6), 16);
    const dist = Math.sqrt((r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2);
    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  });

  return closest;
}

/**
 * ADVANCED CHART SETTINGS MODAL
 * Floating draggable window for chart customization
 * - Crosshair settings (color, width, style)
 * - Candle settings (body, wick, border colors)
 * - Background settings (color, grid)
 * - Saved templates management
 */

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

type SettingsTab = 'crosshair' | 'candles' | 'background' | 'templates';

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
  const [activeTab, setActiveTab] = useState<SettingsTab>('crosshair');
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Templates store
  const { templates, deleteTemplate, renameTemplate } = useChartTemplatesStore();
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Fixed palettes - no dynamic gradients
  const bullishPalette = COLOR_PRESETS.greens;
  const bearishPalette = COLOR_PRESETS.reds;

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
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 500, e.clientY - dragOffset.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Handle template rename
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
      id: 'crosshair',
      label: 'Crosshair',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="5" y="5" width="16" height="16" rx="2" opacity="0.3" />
          <rect x="3" y="3" width="16" height="16" rx="2" fill="currentColor" fillOpacity="0.08" />
          <path d="M3 10h16" strokeOpacity="0.4" />
          <path d="M3 15h16" strokeOpacity="0.2" />
          <path d="M10 3v16" strokeOpacity="0.4" />
        </svg>
      ),
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="6" y="2" width="14" height="18" rx="2" opacity="0.3" />
          <rect x="4" y="4" width="14" height="18" rx="2" />
          <path d="M11 11l1.5-3 1.5 3 3 .5-2 2 .5 3-3-1.5-3 1.5.5-3-2-2z" fill="currentColor" fillOpacity="0.2" />
        </svg>
      ),
    },
  ];

  return (
    <div
      ref={modalRef}
      className="fixed z-[1000] select-none"
      style={{
        left: position.x,
        top: position.y,
        width: 380,
      }}
    >
      {/* Modal Container */}
      <div className="bg-[var(--surface)]/95 backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
        {/* Header - Draggable */}
        <div
          className="flex items-center justify-between px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)] cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span className="text-sm font-semibold text-[var(--text-primary)]">Chart Settings</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all
                ${activeTab === tab.id
                  ? 'text-[var(--primary-light)] bg-[var(--primary)]/10 border-b-2 border-[var(--primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)]/50'
                }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content p-4 max-h-[400px] overflow-y-auto">
          {/* Crosshair Settings */}
          {activeTab === 'crosshair' && (
            <div className="space-y-5">
              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Couleur</label>
                <div className="flex flex-wrap gap-1.5">
                  {[...COLOR_PRESETS.grays, ...COLOR_PRESETS.greens.slice(0, 3), ...COLOR_PRESETS.blues.slice(0, 3)].map(color => (
                    <button
                      key={color}
                      onClick={() => onCrosshairChange({ color })}
                      className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
                        crosshairColor === color ? 'border-[var(--primary)] scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={crosshairColor}
                    onChange={(e) => onCrosshairChange({ color: e.target.value })}
                    className="w-7 h-7 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Width */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                  Épaisseur: {crosshairWidth}px
                </label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={crosshairWidth}
                  onChange={(e) => onCrosshairChange({ width: parseInt(e.target.value) })}
                  className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                />
              </div>

              {/* Style */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Style</label>
                <div className="flex gap-2">
                  {[
                    { id: 'solid' as const, label: 'Solide', preview: '━━━━━━' },
                    { id: 'dashed' as const, label: 'Tirets', preview: '─ ─ ─ ─' },
                    { id: 'dotted' as const, label: 'Pointillé', preview: '· · · · ·' },
                  ].map(style => (
                    <button
                      key={style.id}
                      onClick={() => onCrosshairChange({ style: style.id })}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all
                        ${crosshairStyle === style.id
                          ? 'border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary-light)]'
                          : 'border-[var(--border)] bg-[var(--surface)]/50 text-[var(--text-muted)] hover:border-[var(--surface-hover)]'
                        }`}
                    >
                      <div className="text-center">
                        <div className="mb-1 font-mono text-[10px] tracking-widest">{style.preview}</div>
                        <div>{style.label}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Aperçu</label>
                <div className="h-20 bg-[var(--surface)] rounded-lg relative overflow-hidden">
                  <div
                    className="absolute left-1/2 top-0 bottom-0 w-0"
                    style={{
                      borderLeft: `${crosshairWidth}px ${crosshairStyle} ${crosshairColor}`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 left-0 right-0 h-0"
                    style={{
                      borderTop: `${crosshairWidth}px ${crosshairStyle} ${crosshairColor}`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Candles Settings */}
          {activeTab === 'candles' && (
            <div className="space-y-5">
              {/* Bullish Candle */}
              <div className="p-3 rounded-lg bg-[var(--surface)]/50 border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--primary-light)] mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-[var(--primary)]" />
                  Bougie Haussière
                </h4>

                {/* Body Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Corps</label>
                  <div className="flex flex-wrap gap-1">
                    {bullishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => onCandleChange({ upColor: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          candleUpColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={candleUpColor}
                      onChange={(e) => onCandleChange({ upColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Wick Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Meche</label>
                  <div className="flex flex-wrap gap-1">
                    {bullishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => onCandleChange({ wickUp: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          wickUpColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={wickUpColor}
                      onChange={(e) => onCandleChange({ wickUp: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Border Color */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Bordure</label>
                  <div className="flex flex-wrap gap-1">
                    {[...bullishPalette, ...COLOR_PRESETS.grays.slice(0, 3)].map(color => (
                      <button
                        key={color}
                        onClick={() => onCandleChange({ borderUp: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          candleBorderUp === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={candleBorderUp}
                      onChange={(e) => onCandleChange({ borderUp: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Bearish Candle */}
              <div className="p-3 rounded-lg bg-[var(--surface)]/50 border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-red-500" />
                  Bougie Baissière
                </h4>

                {/* Body Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Corps</label>
                  <div className="flex flex-wrap gap-1">
                    {bearishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => onCandleChange({ downColor: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          candleDownColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={candleDownColor}
                      onChange={(e) => onCandleChange({ downColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Wick Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Meche</label>
                  <div className="flex flex-wrap gap-1">
                    {bearishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => onCandleChange({ wickDown: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          wickDownColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={wickDownColor}
                      onChange={(e) => onCandleChange({ wickDown: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Border Color */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Bordure</label>
                  <div className="flex flex-wrap gap-1">
                    {[...bearishPalette, ...COLOR_PRESETS.grays.slice(0, 3)].map(color => (
                      <button
                        key={color}
                        onClick={() => onCandleChange({ borderDown: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          candleBorderDown === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={candleBorderDown}
                      onChange={(e) => onCandleChange({ borderDown: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Candle Preview */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Aperçu</label>
                <div className="h-24 bg-[var(--surface)] rounded-lg flex items-end justify-center gap-4 p-3">
                  {/* Bullish candle */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-0.5 h-4"
                      style={{ backgroundColor: wickUpColor }}
                    />
                    <div
                      className="w-6 h-12 rounded-sm"
                      style={{
                        backgroundColor: candleUpColor,
                        border: `1px solid ${candleBorderUp}`,
                      }}
                    />
                    <div
                      className="w-0.5 h-3"
                      style={{ backgroundColor: wickUpColor }}
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1">Hausse</span>
                  </div>
                  {/* Bearish candle */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-0.5 h-3"
                      style={{ backgroundColor: wickDownColor }}
                    />
                    <div
                      className="w-6 h-10 rounded-sm"
                      style={{
                        backgroundColor: candleDownColor,
                        border: `1px solid ${candleBorderDown}`,
                      }}
                    />
                    <div
                      className="w-0.5 h-5"
                      style={{ backgroundColor: wickDownColor }}
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1">Baisse</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Background Settings */}
          {activeTab === 'background' && (
            <div className="space-y-5">
              {/* Background Color */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Couleur de fond</label>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_PRESETS.grays.map(color => (
                    <button
                      key={color}
                      onClick={() => onBackgroundChange({ color })}
                      className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
                        backgroundColor === color ? 'border-[var(--primary)] scale-110' : 'border-[var(--border)]'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => onBackgroundChange({ color: e.target.value })}
                    className="w-7 h-7 rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Grid Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface)]/50 border border-[var(--border)]">
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">Grille</h4>
                  <p className="text-xs text-[var(--text-muted)]">Afficher les lignes de la grille</p>
                </div>
                <button
                  onClick={() => onBackgroundChange({ showGrid: !showGrid })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    showGrid ? 'bg-[var(--primary)]' : 'bg-[var(--surface-elevated)]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      showGrid ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Grid Color */}
              {showGrid && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Couleur de la grille</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['#1a1a1a', '#252525', '#303030', '#404040', '#1a2a1a', '#1a1a2a', '#2a1a2a'].map(color => (
                      <button
                        key={color}
                        onClick={() => onBackgroundChange({ gridColor: color })}
                        className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
                          gridColor === color ? 'border-[var(--primary)] scale-110' : 'border-[var(--border)]'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={gridColor}
                      onChange={(e) => onBackgroundChange({ gridColor: e.target.value })}
                      className="w-7 h-7 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Preview */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Aperçu</label>
                <div
                  className="h-28 rounded-lg relative overflow-hidden"
                  style={{ backgroundColor }}
                >
                  {showGrid && (
                    <>
                      {[0.25, 0.5, 0.75].map(pos => (
                        <div
                          key={`h-${pos}`}
                          className="absolute left-0 right-0 h-px"
                          style={{ top: `${pos * 100}%`, backgroundColor: gridColor }}
                        />
                      ))}
                      {[0.25, 0.5, 0.75].map(pos => (
                        <div
                          key={`v-${pos}`}
                          className="absolute top-0 bottom-0 w-px"
                          style={{ left: `${pos * 100}%`, backgroundColor: gridColor }}
                        />
                      ))}
                    </>
                  )}
                  {/* Mini candles */}
                  <div className="absolute bottom-4 left-1/4 w-3 h-8 rounded-sm" style={{ backgroundColor: candleUpColor }} />
                  <div className="absolute bottom-4 left-1/2 w-3 h-6 rounded-sm" style={{ backgroundColor: candleDownColor }} />
                  <div className="absolute bottom-4 right-1/4 w-3 h-10 rounded-sm" style={{ backgroundColor: candleUpColor }} />
                </div>
              </div>
            </div>
          )}

          {/* Templates Management */}
          {activeTab === 'templates' && (
            <div className="space-y-3">
              {templates.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-[var(--text-muted)]">Aucun template sauvegardé</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">Clic droit → Save Template</p>
                </div>
              ) : (
                templates.map(template => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface)]/50 border border-[var(--border)] group"
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
                            if (e.key === 'Escape') {
                              setEditingTemplateId(null);
                              setEditingName('');
                            }
                          }}
                          autoFocus
                          className="w-full bg-[var(--surface-elevated)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                        />
                      ) : (
                        <>
                          <h4 className="text-sm font-medium text-white truncate">{template.name}</h4>
                          <p className="text-xs text-[var(--text-muted)]">
                            {new Date(template.createdAt).toLocaleDateString('fr-FR')}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Rename Button */}
                      <button
                        onClick={() => handleStartRename(template)}
                        className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-500/20 transition-colors"
                        title="Renommer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/20 transition-colors"
                        title="Supprimer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={() => {
              // Reset to defaults
              onCrosshairChange({ color: '#6b7280', width: 1, style: 'dashed' });
              onCandleChange({
                upColor: '#22c55e',
                downColor: '#ef4444',
                wickUp: '#22c55e',
                wickDown: '#ef4444',
                borderUp: '#22c55e',
                borderDown: '#ef4444',
              });
              onBackgroundChange({ color: '#0a0a0a', showGrid: true, gridColor: '#1a1a1a' });
            }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Réinitialiser
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
