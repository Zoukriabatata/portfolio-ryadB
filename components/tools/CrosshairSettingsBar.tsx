'use client';

/**
 * CROSSHAIR SETTINGS BAR
 *
 * Barre d'outils pour configurer le crosshair
 * Professional style
 */

import { useState, useRef, useEffect } from 'react';
import { useCrosshairStore, type CrosshairLineStyle, type MagnetMode } from '@/stores/useCrosshairStore';
import { ColorPicker } from '@/components/tools/ColorPicker';

interface CrosshairSettingsBarProps {
  colors: {
    surface: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    gridColor: string;
    deltaPositive: string;
    deltaNegative: string;
  };
  onClose?: () => void;
}


// Line widths
const LINE_WIDTHS = [1, 2, 3];

// Line styles
const LINE_STYLES: { value: CrosshairLineStyle; label: string; icon: string }[] = [
  { value: 'solid', label: 'Solid', icon: '━━━━━━' },
  { value: 'dashed', label: 'Dashed', icon: '━ ━ ━ ━' },
  { value: 'dotted', label: 'Dotted', icon: '• • • • • •' },
];

// Magnet modes
const MAGNET_MODES: { value: MagnetMode; label: string; description: string }[] = [
  { value: 'none', label: 'Off', description: 'Free movement' },
  { value: 'ohlc', label: 'OHLC', description: 'Snap to Open/High/Low/Close' },
  { value: 'close', label: 'Close', description: 'Snap to Close price' },
];

export default function CrosshairSettingsBar({ colors, onClose }: CrosshairSettingsBarProps) {
  const crosshair = useCrosshairStore();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showMagnetPicker, setShowMagnetPicker] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowWidthPicker(false);
        setShowStylePicker(false);
        setShowMagnetPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={barRef}
      className="flex items-center gap-2 px-3 py-2 rounded-xl shadow-2xl"
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.gridColor}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Title */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{ backgroundColor: colors.background }}
      >
        <span className="text-base">+</span>
        <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
          Crosshair
        </span>
      </div>

      <Divider color={colors.gridColor} />

      {/* Color Picker */}
      <div className="relative">
        <button
          onClick={() => {
            setShowColorPicker(!showColorPicker);
            setShowWidthPicker(false);
            setShowStylePicker(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Color"
        >
          <div
            className="w-6 h-6 rounded-md border-2 shadow-inner"
            style={{
              backgroundColor: crosshair.color,
              borderColor: 'rgba(255,255,255,0.3)',
            }}
          />
          <span className="text-xs" style={{ color: colors.textSecondary }}>Color</span>
          <Arrow color={colors.textMuted} />
        </button>

        {showColorPicker && (
          <div
            className="absolute top-full left-0 mt-2 p-3 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
            style={{
              backgroundColor: 'rgba(20, 20, 28, 0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              minWidth: 220,
            }}
          >
            <ColorPicker
              value={crosshair.color}
              onChange={(c) => crosshair.setColor(c)}
              label=""
            />
          </div>
        )}
      </div>

      {/* Line Width */}
      <div className="relative">
        <button
          onClick={() => {
            setShowWidthPicker(!showWidthPicker);
            setShowColorPicker(false);
            setShowStylePicker(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Line Width"
        >
          <div className="flex items-center justify-center w-6 h-6">
            <div
              className="rounded-full"
              style={{
                width: Math.min(crosshair.lineWidth * 4, 12),
                height: Math.min(crosshair.lineWidth * 4, 12),
                backgroundColor: colors.textPrimary,
              }}
            />
          </div>
          <span className="text-xs" style={{ color: colors.textSecondary }}>{crosshair.lineWidth}px</span>
          <Arrow color={colors.textMuted} />
        </button>

        {showWidthPicker && (
          <div
            className="absolute top-full left-0 mt-2 p-2 rounded-xl shadow-2xl z-50"
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.gridColor}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex gap-1">
              {LINE_WIDTHS.map(width => (
                <button
                  key={width}
                  onClick={() => {
                    crosshair.setLineWidth(width);
                    setShowWidthPicker(false);
                  }}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/10 transition-colors min-w-[40px]"
                  style={{
                    backgroundColor: crosshair.lineWidth === width ? colors.background : 'transparent',
                  }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: width * 4,
                      height: width * 4,
                      backgroundColor: colors.textPrimary,
                    }}
                  />
                  <span className="text-[10px]" style={{ color: colors.textSecondary }}>{width}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Line Style */}
      <div className="relative">
        <button
          onClick={() => {
            setShowStylePicker(!showStylePicker);
            setShowColorPicker(false);
            setShowWidthPicker(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          title="Line Style"
        >
          <span className="text-xs font-mono tracking-tight" style={{ color: colors.textPrimary }}>
            {LINE_STYLES.find(s => s.value === crosshair.lineStyle)?.icon || '━━━'}
          </span>
          <Arrow color={colors.textMuted} />
        </button>

        {showStylePicker && (
          <div
            className="absolute top-full left-0 mt-2 p-2 rounded-xl shadow-2xl z-50 min-w-[140px]"
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.gridColor}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {LINE_STYLES.map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => {
                  crosshair.setLineStyle(value);
                  setShowStylePicker(false);
                }}
                className="flex items-center justify-between gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                style={{
                  backgroundColor: crosshair.lineStyle === value ? colors.background : 'transparent',
                }}
              >
                <span className="text-xs font-mono" style={{ color: colors.textPrimary }}>{icon}</span>
                <span className="text-xs" style={{ color: colors.textSecondary }}>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Magnet Mode */}
      <div className="relative">
        <button
          onClick={() => {
            setShowMagnetPicker(!showMagnetPicker);
            setShowColorPicker(false);
            setShowWidthPicker(false);
            setShowStylePicker(false);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
          title="Magnet Mode - Snap to prices"
          style={{
            backgroundColor: crosshair.magnetMode !== 'none' ? colors.deltaPositive + '30' : 'transparent',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={crosshair.magnetMode !== 'none' ? colors.deltaPositive : colors.textSecondary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 2v6a6 6 0 0 0 12 0V2" />
            <path d="M6 2H4v4" />
            <path d="M18 2h2v4" />
            <path d="M4 6h2" />
            <path d="M18 6h2" />
          </svg>
          <span className="text-xs" style={{ color: crosshair.magnetMode !== 'none' ? colors.deltaPositive : colors.textSecondary }}>
            {crosshair.magnetMode === 'none' ? 'Off' : crosshair.magnetMode.toUpperCase()}
          </span>
          <Arrow color={colors.textMuted} />
        </button>

        {showMagnetPicker && (
          <div
            className="absolute top-full left-0 mt-2 p-2 rounded-xl shadow-2xl z-50 min-w-[180px]"
            style={{
              backgroundColor: colors.surface,
              border: `1px solid ${colors.gridColor}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            {MAGNET_MODES.map(({ value, label, description }) => (
              <button
                key={value}
                onClick={() => {
                  crosshair.setMagnetMode(value);
                  setShowMagnetPicker(false);
                }}
                className="flex flex-col items-start gap-0.5 w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                style={{
                  backgroundColor: crosshair.magnetMode === value ? colors.background : 'transparent',
                }}
              >
                <span className="text-xs font-medium" style={{ color: crosshair.magnetMode === value ? colors.deltaPositive : colors.textPrimary }}>
                  {label}
                </span>
                <span className="text-[10px]" style={{ color: colors.textMuted }}>
                  {description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider color={colors.gridColor} />

      {/* Toggle Options */}
      <div className="flex items-center gap-1">
        {/* Horizontal Line */}
        <button
          onClick={() => crosshair.setShowHorizontalLine(!crosshair.showHorizontalLine)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors"
          title="Horizontal Line"
          style={{
            backgroundColor: crosshair.showHorizontalLine ? colors.background : 'transparent',
            color: crosshair.showHorizontalLine ? colors.textPrimary : colors.textMuted,
          }}
        >
          <span className="text-sm">─</span>
        </button>

        {/* Vertical Line */}
        <button
          onClick={() => crosshair.setShowVerticalLine(!crosshair.showVerticalLine)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors"
          title="Vertical Line"
          style={{
            backgroundColor: crosshair.showVerticalLine ? colors.background : 'transparent',
            color: crosshair.showVerticalLine ? colors.textPrimary : colors.textMuted,
          }}
        >
          <span className="text-sm">│</span>
        </button>

        {/* Price Label */}
        <button
          onClick={() => crosshair.setShowPriceLabel(!crosshair.showPriceLabel)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-xs"
          title="Price Label"
          style={{
            backgroundColor: crosshair.showPriceLabel ? colors.background : 'transparent',
            color: crosshair.showPriceLabel ? colors.textPrimary : colors.textMuted,
          }}
        >
          $
        </button>

        {/* Time Label */}
        <button
          onClick={() => crosshair.setShowTimeLabel(!crosshair.showTimeLabel)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors text-xs"
          title="Time Label"
          style={{
            backgroundColor: crosshair.showTimeLabel ? colors.background : 'transparent',
            color: crosshair.showTimeLabel ? colors.textPrimary : colors.textMuted,
          }}
        >
          🕐
        </button>
      </div>

      <Divider color={colors.gridColor} />

      {/* Opacity Slider */}
      <div className="flex items-center gap-2 px-2">
        <span className="text-[10px]" style={{ color: colors.textMuted }}>Opacity</span>
        <input
          type="range"
          min={20}
          max={100}
          value={crosshair.opacity * 100}
          onChange={(e) => crosshair.setOpacity(Number(e.target.value) / 100)}
          className="w-16 h-1 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${colors.textPrimary} ${crosshair.opacity * 100}%, ${colors.gridColor} ${crosshair.opacity * 100}%)`,
          }}
        />
        <span className="text-[10px] w-8" style={{ color: colors.textSecondary }}>
          {Math.round(crosshair.opacity * 100)}%
        </span>
      </div>

      <Divider color={colors.gridColor} />

      {/* Reset */}
      <button
        onClick={() => crosshair.resetToDefaults()}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors text-xs"
        title="Reset to Defaults"
        style={{ color: colors.textMuted }}
      >
        ↺
      </button>

      <Divider color={colors.gridColor} />

      {/* Close */}
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        title="Close Settings"
        style={{ color: colors.textMuted }}
      >
        <span className="text-sm">✕</span>
      </button>
    </div>
  );
}

// ============ COMPONENTS ============

function Divider({ color }: { color: string }) {
  return <div className="w-px h-6 mx-1" style={{ backgroundColor: color }} />;
}

function Arrow({ color }: { color: string }) {
  return (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ color }}>
      <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
