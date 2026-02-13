'use client';

import { useState, useRef } from 'react';

const PRESET_COLORS_BY_CATEGORY = {
  trading: ['#22c55e', '#ef4444', '#fbbf24', '#3b82f6'],
  extended: ['#06b6d4', '#a855f7', '#ec4899', '#f97316'],
  neutral: ['#ffffff', '#a1a1aa', '#525252', '#171717'],
};

const PRESET_COLORS = [
  ...PRESET_COLORS_BY_CATEGORY.trading,
  ...PRESET_COLORS_BY_CATEGORY.extended,
  ...PRESET_COLORS_BY_CATEGORY.neutral,
];

// Compact version - only essential colors
const COMPACT_COLORS = [
  '#22c55e', '#ef4444', '#3b82f6', '#fbbf24',
  '#a855f7', '#06b6d4', '#ffffff', '#525252',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  className?: string;
  compact?: boolean; // New prop for compact mode
}

export function ColorPicker({ value, onChange, label = 'Color', className = '', compact = false }: ColorPickerProps) {
  const [customColor, setCustomColor] = useState(value);
  const colors = compact ? COMPACT_COLORS : PRESET_COLORS;
  const colorInputRef = useRef<HTMLInputElement>(null);

  if (compact) {
    return (
      <div className={className}>
        <label className="block text-[10px] text-white/60 mb-1">{label}</label>

        {/* Compact view: small preview + grid */}
        <div className="flex items-center gap-1.5">
          <div
            onClick={() => colorInputRef.current?.click()}
            className="w-6 h-6 rounded border border-white/20 flex-shrink-0 cursor-pointer hover:border-blue-500 transition-colors"
            style={{ backgroundColor: value }}
            title="Click to choose custom color"
          />
          {/* Hidden native color picker */}
          <input
            ref={colorInputRef}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="hidden"
          />
          <div className="flex-1 grid grid-cols-4 gap-1">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => onChange(color)}
                className={`w-full aspect-square rounded border transition-all hover:scale-110 ${
                  value.toLowerCase() === color.toLowerCase()
                    ? 'border-blue-500'
                    : 'border-white/20 hover:border-white/40'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <label className="block text-xs text-white/60 mb-1.5">{label}</label>

      {/* Current color preview */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded border border-white/20"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setCustomColor(e.target.value);
            if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
              onChange(e.target.value);
            }
          }}
          placeholder="#000000"
          className="flex-1 px-2 py-1 bg-black/20 border border-white/10 rounded text-xs text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Preset colors grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-full aspect-square rounded border-2 transition-all hover:scale-110 ${
              value.toLowerCase() === color.toLowerCase()
                ? 'border-blue-500 shadow-lg shadow-blue-500/50'
                : 'border-white/20 hover:border-white/40'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      {/* Native color picker */}
      <div className="mt-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 rounded cursor-pointer"
        />
      </div>
    </div>
  );
}
