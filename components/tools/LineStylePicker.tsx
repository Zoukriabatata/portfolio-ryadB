'use client';

import { type LineStyle } from '@/lib/tools/ToolsEngine';

const LINE_STYLES: { value: LineStyle; label: string; icon: string }[] = [
  { value: 'solid', label: 'Solid', icon: '───' },
  { value: 'dashed', label: 'Dashed', icon: '- - -' },
  { value: 'dotted', label: 'Dotted', icon: '···' },
];

interface LineStylePickerProps {
  value: LineStyle;
  onChange: (style: LineStyle) => void;
  label?: string;
  className?: string;
}

export function LineStylePicker({
  value,
  onChange,
  label = 'Line Style',
  className = '',
}: LineStylePickerProps) {
  return (
    <div className={className}>
      <label className="block text-xs text-white/60 mb-1.5">{label}</label>

      <div className="flex items-center gap-2">
        {LINE_STYLES.map((style) => (
          <button
            key={style.value}
            onClick={() => onChange(style.value)}
            className={`flex-1 h-8 rounded flex items-center justify-center transition-all font-mono text-sm ${
              value === style.value
                ? 'bg-blue-500 text-white'
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
            title={style.label}
          >
            {style.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
