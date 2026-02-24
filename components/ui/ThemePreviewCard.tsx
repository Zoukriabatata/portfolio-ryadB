'use client';

import { useMemo } from 'react';
import type { UIThemeColors } from '@/stores/useUIThemeStore';

interface ThemePreviewCardProps {
  themeId: string;
  name: string;
  description: string;
  colors: UIThemeColors;
  isActive: boolean;
  onClick: () => void;
}

const CANDLE_DATA = [
  { h: 24, up: true }, { h: 18, up: false }, { h: 30, up: true },
  { h: 14, up: false }, { h: 22, up: true }, { h: 28, up: true },
  { h: 16, up: false }, { h: 26, up: true }, { h: 20, up: false },
  { h: 32, up: true }, { h: 12, up: false }, { h: 24, up: true },
];

export default function ThemePreviewCard({ name, description, colors: c, isActive, onClick }: ThemePreviewCardProps) {
  const animDelay = useMemo(() => CANDLE_DATA.map((_, i) => `${i * 0.12}s`), []);

  return (
    <button
      onClick={onClick}
      className="relative p-3 rounded-xl transition-all text-left group overflow-hidden"
      style={{
        background: c.surface,
        border: `2px solid ${isActive ? c.primary : c.border}`,
        boxShadow: isActive ? `0 0 16px ${c.primaryGlow}` : 'none',
      }}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold z-10"
          style={{ background: c.primary, color: c.background }}>
          &#10003;
        </div>
      )}

      {/* Mini chart preview with animated candles */}
      <div className="h-14 rounded-lg mb-2 flex items-end gap-[3px] px-2 pb-1 overflow-hidden relative"
        style={{ background: c.chartBg, border: `1px solid ${c.chartGrid}` }}>

        {/* Animated price line */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <polyline
              points="0,28 15,24 30,30 45,18 60,22 75,14 90,20 105,26 120,16 135,10 150,22 165,18 180,12 200,20"
              fill="none"
              stroke={c.primary}
              strokeWidth="1.5"
              strokeDasharray="200"
              strokeDashoffset="200"
              opacity="0.3"
              className="group-hover:animate-[drawLine_1.5s_ease-out_forwards]"
            />
          </svg>
        </div>

        {/* Animated candles */}
        {CANDLE_DATA.map((bar, i) => (
          <div key={i} className="flex-1 min-w-[3px] relative flex flex-col items-center justify-end">
            {/* Wick */}
            <div
              className="w-[1px] rounded-full transition-all duration-500"
              style={{
                height: `${bar.h + 4}px`,
                background: bar.up ? c.candleUp : c.candleDown,
                opacity: 0.4,
                animationName: 'candleGrow',
                animationDuration: '0.5s',
                animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                animationDelay: animDelay[i],
                animationFillMode: 'both',
              }}
            />
            {/* Body */}
            <div
              className="w-full rounded-[1px] absolute bottom-0 transition-all duration-300 group-hover:brightness-125"
              style={{
                height: `${bar.h}px`,
                background: bar.up ? c.candleUp : c.candleDown,
                opacity: 0.85,
                animationName: 'candleGrow',
                animationDuration: '0.4s',
                animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                animationDelay: animDelay[i],
                animationFillMode: 'both',
              }}
            />
          </div>
        ))}

        {/* Grid lines (subtle) */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.15 }}>
          <div className="absolute left-0 right-0 top-1/3 h-px" style={{ background: c.chartGrid }} />
          <div className="absolute left-0 right-0 top-2/3 h-px" style={{ background: c.chartGrid }} />
        </div>
      </div>

      {/* Theme info row */}
      <div className="flex items-center gap-2">
        {/* Animated color dots: logo (pulses) + primary + accent */}
        <div className="flex gap-1.5 items-center">
          <div
            className="w-3.5 h-3.5 rounded-full group-hover:animate-pulse transition-transform group-hover:scale-110"
            style={{ background: c.logoBright, boxShadow: `0 0 6px ${c.logoBright}40` }}
          />
          <div
            className="w-3 h-3 rounded-full transition-transform group-hover:scale-110"
            style={{ background: c.primary }}
          />
          <div
            className="w-3 h-3 rounded-full transition-transform group-hover:scale-110"
            style={{ background: c.accent }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: c.textPrimary }}>{name}</div>
          <div className="text-[10px] truncate" style={{ color: c.textMuted }}>{description}</div>
        </div>
      </div>

      {/* Hover glow effect */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: `inset 0 0 30px ${c.primary}08` }}
      />
    </button>
  );
}
