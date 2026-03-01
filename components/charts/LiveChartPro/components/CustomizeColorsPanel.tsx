'use client';

import type { CustomColors, EffectiveColors } from '../hooks/types';
import type { ChartTheme } from '@/lib/themes/ThemeSystem';
import { DEFAULT_CUSTOM_COLORS } from '../hooks/types';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

interface CustomizeColorsPanelProps {
  customColors: CustomColors;
  setCustomColors: React.Dispatch<React.SetStateAction<CustomColors>>;
  effectiveColors: EffectiveColors;
  theme: ChartTheme;
  onClose: () => void;
}

/** Single color row: label + portal-based full ColorPicker swatch */
function ColorRow({ label, value, fallback, onChange }: {
  label: string;
  value: string;
  fallback: string;
  onChange: (color: string) => void;
}) {
  const effective = value || fallback;

  return (
    <div className="flex items-center justify-between">
      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <InlineColorSwatch value={effective} onChange={onChange} size={5} />
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
          onChange={(c) => setCustomColors(prev => ({ ...prev, background: c }))}
        />

        <div className="h-px" style={{ backgroundColor: theme.colors.border }} />

        <ColorRow
          label="Bullish candle"
          value={customColors.candleUp}
          fallback={effectiveColors.candleUp}
          onChange={(c) => setCustomColors(prev => ({ ...prev, candleUp: c, wickUp: c }))}
        />

        <ColorRow
          label="Bearish candle"
          value={customColors.candleDown}
          fallback={effectiveColors.candleDown}
          onChange={(c) => setCustomColors(prev => ({ ...prev, candleDown: c, wickDown: c }))}
        />

        <div className="h-px" style={{ backgroundColor: theme.colors.border }} />

        <ColorRow
          label="Price line"
          value={customColors.priceLineColor}
          fallback={effectiveColors.priceLineColor}
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
