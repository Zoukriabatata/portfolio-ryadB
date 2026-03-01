'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { COLOR_PRESETS } from '../constants/colors';
import type { CustomColors, EffectiveColors } from '../hooks/types';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import { DEFAULT_CUSTOM_COLORS } from '../hooks/types';
import { ColorPicker } from '@/components/tools/ColorPicker';

interface CustomizeColorsPanelProps {
  customColors: CustomColors;
  setCustomColors: React.Dispatch<React.SetStateAction<CustomColors>>;
  effectiveColors: EffectiveColors;
  theme: ChartTheme;
  onClose: () => void;
}

/** Single color row: label + presets + swatch with HSV picker + HEX input */
function ColorRow({ label, value, fallback, presets, onChange }: {
  label: string;
  value: string;
  fallback: string;
  presets: string[];
  onChange: (color: string) => void;
}) {
  const effective = value || fallback;
  const [hex, setHex] = useState(effective);
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHex(effective);
  }, [effective]);

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

  const commitHex = useCallback(() => {
    const h = hex.startsWith('#') ? hex : `#${hex}`;
    if (/^#[0-9a-fA-F]{6}$/.test(h)) {
      onChange(h);
    } else {
      setHex(effective);
    }
  }, [hex, effective, onChange]);

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap gap-1 flex-1">
          {presets.map(color => (
            <button
              key={color}
              onClick={() => onChange(color)}
              className="w-5 h-5 rounded transition-all hover:scale-110"
              style={{
                backgroundColor: color,
                boxShadow: effective.toLowerCase() === color.toLowerCase()
                  ? '0 0 0 1.5px var(--primary), 0 0 0 3px var(--surface)'
                  : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            />
          ))}
        </div>
        <div className="relative flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="w-5 h-5 rounded cursor-pointer hover:ring-1 hover:ring-[var(--primary)] transition-all"
            style={{ backgroundColor: effective, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
          />
          <input
            type="text"
            value={hex.toUpperCase()}
            onChange={(e) => {
              let v = e.target.value;
              if (!v.startsWith('#')) v = '#' + v;
              if (v.length <= 7) setHex(v);
            }}
            onBlur={commitHex}
            onKeyDown={(e) => { if (e.key === 'Enter') commitHex(); }}
            className="w-[68px] h-5 text-[10px] font-mono text-center rounded px-1
              bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]
              focus:border-[var(--primary)] focus:outline-none"
            spellCheck={false}
          />
          {pickerOpen && (
            <div className="absolute z-50 mt-1 right-0 top-full" style={{
              width: 230,
              borderRadius: 10,
              backgroundColor: '#1c1f26',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              <div className="p-2">
                <ColorPicker value={effective} onChange={(c) => { onChange(c); setHex(c); }} compact={false} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomizeColorsPanel({
  customColors,
  setCustomColors,
  effectiveColors,
  theme,
  onClose,
}: CustomizeColorsPanelProps) {
  const PRICE_LINE_PRESETS = ['#7ed321', '#3b82f6', '#f59e0b', '#22d3ee', '#a855f7', '#ef4444'];

  return (
    <div
      className="absolute top-2 right-2 w-[280px] rounded-[10px] shadow-2xl z-20 overflow-hidden"
      style={{ backgroundColor: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: theme.colors.border }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.colors.textMuted }}>Colors</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--surface-elevated)] transition-colors"
          style={{ color: theme.colors.textMuted }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-3 max-h-[360px] overflow-y-auto">
        <ColorRow
          label="Background"
          value={customColors.background}
          fallback={effectiveColors.background}
          presets={COLOR_PRESETS.background}
          onChange={(c) => setCustomColors(prev => ({ ...prev, background: c }))}
        />

        <div className="h-px" style={{ backgroundColor: theme.colors.border }} />

        <ColorRow
          label="Bullish candle"
          value={customColors.candleUp}
          fallback={effectiveColors.candleUp}
          presets={COLOR_PRESETS.candles.bullish}
          onChange={(c) => setCustomColors(prev => ({ ...prev, candleUp: c, wickUp: c }))}
        />

        <ColorRow
          label="Bearish candle"
          value={customColors.candleDown}
          fallback={effectiveColors.candleDown}
          presets={COLOR_PRESETS.candles.bearish}
          onChange={(c) => setCustomColors(prev => ({ ...prev, candleDown: c, wickDown: c }))}
        />

        <div className="h-px" style={{ backgroundColor: theme.colors.border }} />

        <ColorRow
          label="Price line"
          value={customColors.priceLineColor}
          fallback={effectiveColors.priceLineColor}
          presets={PRICE_LINE_PRESETS}
          onChange={(c) => setCustomColors(prev => ({ ...prev, priceLineColor: c }))}
        />

        {/* Reset */}
        <button
          onClick={() => setCustomColors(DEFAULT_CUSTOM_COLORS)}
          className="w-full py-1.5 rounded text-[10px] font-medium transition-colors hover:brightness-110"
          style={{ backgroundColor: theme.colors.background, color: theme.colors.textMuted, border: `1px solid ${theme.colors.border}` }}
        >
          Reset to Theme Defaults
        </button>
      </div>
    </div>
  );
}
