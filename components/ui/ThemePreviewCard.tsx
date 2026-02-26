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
  const animDelay = useMemo(() => CANDLE_DATA.map((_, i) => `${i * 0.08}s`), []);

  return (
    <button
      onClick={onClick}
      className="relative p-3 rounded-xl text-left group overflow-hidden"
      style={{
        background: c.surface,
        border: `2px solid ${isActive ? c.primary : c.border}`,
        boxShadow: isActive ? `0 0 20px ${c.primaryGlow}, 0 0 0 1px ${c.primary}40` : 'none',
        transition: 'border-color 0.4s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s ease',
        transform: isActive ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Active indicator — animated check */}
      {isActive && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold z-10 animate-popIn"
          style={{ background: c.primary, color: c.background, boxShadow: `0 2px 8px ${c.primary}60` }}>
          &#10003;
        </div>
      )}

      {/* Mini chart preview with animated candles */}
      <div className="h-16 rounded-lg mb-2.5 flex items-end gap-[3px] px-2 pb-1.5 overflow-hidden relative"
        style={{ background: c.chartBg, border: `1px solid ${c.chartGrid}` }}>

        {/* Live animated price line (draws on hover) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            {/* Area fill under line */}
            <polygon
              points="0,56 0,28 15,24 30,30 45,18 60,22 75,14 90,20 105,26 120,16 135,10 150,22 165,18 180,12 200,20 200,56"
              fill={c.primary}
              opacity="0"
              className="group-hover:!opacity-[0.06]"
              style={{ transition: 'opacity 0.5s ease' }}
            />
            <polyline
              points="0,28 15,24 30,30 45,18 60,22 75,14 90,20 105,26 120,16 135,10 150,22 165,18 180,12 200,20"
              fill="none"
              stroke={c.primary}
              strokeWidth="1.5"
              strokeDasharray="200"
              strokeDashoffset="200"
              opacity="0.4"
              className="group-hover:animate-[drawLine_1.2s_ease-out_forwards]"
            />
          </svg>
        </div>

        {/* Animated candles */}
        {CANDLE_DATA.map((bar, i) => (
          <div key={i} className="flex-1 min-w-[3px] relative flex flex-col items-center justify-end">
            {/* Wick */}
            <div
              className="w-[1px] rounded-full"
              style={{
                height: `${bar.h + 4}px`,
                background: bar.up ? c.candleUp : c.candleDown,
                opacity: 0.4,
                animationName: 'candleGrow',
                animationDuration: '0.45s',
                animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                animationDelay: animDelay[i],
                animationFillMode: 'both',
              }}
            />
            {/* Body */}
            <div
              className="w-full rounded-[1px] absolute bottom-0"
              style={{
                height: `${bar.h}px`,
                background: bar.up ? c.candleUp : c.candleDown,
                opacity: 0.85,
                animationName: 'candleGrow',
                animationDuration: '0.35s',
                animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                animationDelay: animDelay[i],
                animationFillMode: 'both',
                transition: 'filter 0.3s ease',
                filter: 'brightness(1)',
              }}
              onMouseEnter={undefined}
            />
          </div>
        ))}

        {/* Volume bars (subtle, at bottom) */}
        <div className="absolute bottom-0 left-2 right-2 h-3 flex items-end gap-[3px] pointer-events-none opacity-0 group-hover:opacity-100"
          style={{ transition: 'opacity 0.4s ease 0.2s' }}>
          {CANDLE_DATA.map((bar, i) => (
            <div key={i} className="flex-1 rounded-t-[1px]"
              style={{
                height: `${bar.h * 0.3}px`,
                background: bar.up ? c.candleUp : c.candleDown,
                opacity: 0.2,
              }}
            />
          ))}
        </div>

        {/* Grid lines (subtle) */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.12 }}>
          <div className="absolute left-0 right-0 top-1/4 h-px" style={{ background: c.chartGrid }} />
          <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: c.chartGrid }} />
          <div className="absolute left-0 right-0 top-3/4 h-px" style={{ background: c.chartGrid }} />
        </div>
      </div>

      {/* Theme info row */}
      <div className="flex items-center gap-2.5">
        {/* Color palette dots with staggered hover animation */}
        <div className="flex gap-1 items-center">
          <div
            className="w-4 h-4 rounded-full"
            style={{
              background: c.logoBright,
              boxShadow: `0 0 8px ${c.logoBright}50, 0 0 0 2px ${c.surface}, 0 0 0 3.5px ${c.logoBright}30`,
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease',
            }}
          />
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: c.primary,
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s',
            }}
          />
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: c.accent,
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s',
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold tracking-tight truncate" style={{ color: c.textPrimary }}>{name}</div>
          <div className="text-[10px] truncate" style={{ color: c.textMuted }}>{description}</div>
        </div>
      </div>

      {/* Hover glow + gradient sweep */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${c.primary}08 0%, transparent 50%, ${c.accent}05 100%)`,
          boxShadow: `inset 0 0 30px ${c.primary}10`,
          transition: 'opacity 0.35s ease',
        }}
      />
    </button>
  );
}
