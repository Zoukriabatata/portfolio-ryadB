'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  useFootprintSettingsStore,
  COLOR_PRESETS,
  type FootprintColors,
} from '@/stores/useFootprintSettingsStore';
import { useCrosshairStore, type CrosshairLineStyle, type MagnetMode } from '@/stores/useCrosshairStore';

/**
 * FOOTPRINT ADVANCED SETTINGS MODAL
 * Floating draggable window for footprint chart customization
 * - Candle settings (body, border, wick colors)
 * - Delta/Volume colors
 * - Imbalance settings
 * - Layout settings
 * - Feature toggles
 * - Crosshair settings
 */

interface FootprintAdvancedSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
}

type SettingsTab = 'candles' | 'delta' | 'layout' | 'features' | 'crosshair';

// Helper to find the closest standard color to a custom color
function findClosestStandardColor(customColor: string, standardColors: string[]): string {
  const hex = customColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  let closest = standardColors[0];
  let minDist = Infinity;

  standardColors.forEach(color => {
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

// Extended color palette with more variety
const EXTENDED_GREENS = ['#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#4ade80', '#86efac', '#10b981', '#059669', '#047857'];
const EXTENDED_REDS = ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d', '#f87171', '#fca5a5', '#f97316', '#ea580c', '#c2410c'];
const EXTENDED_BLUES = ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#60a5fa', '#93c5fd', '#06b6d4', '#0891b2', '#0e7490', '#155e75'];
const EXTENDED_PURPLES = ['#a855f7', '#9333ea', '#7c3aed', '#6d28d9', '#c084fc', '#d8b4fe', '#ec4899', '#db2777', '#be185d', '#9d174d'];
const STANDARD_GRAYS = ['#ffffff', '#e5e5e5', '#a3a3a3', '#737373', '#525252', '#404040', '#262626', '#171717', '#0a0a0a', '#000000'];

// All colors for quick selection
const ALL_PRESET_COLORS = [...EXTENDED_GREENS, ...EXTENDED_REDS, ...EXTENDED_BLUES, ...EXTENDED_PURPLES];

export default function FootprintAdvancedSettings({
  isOpen,
  onClose,
  initialPosition,
}: FootprintAdvancedSettingsProps) {
  const settings = useFootprintSettingsStore();
  const crosshair = useCrosshairStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('candles');
  const [position, setPosition] = useState(initialPosition || { x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fixed color palettes - no more dynamic gradients
  const bullishPalette = EXTENDED_GREENS;
  const bearishPalette = EXTENDED_REDS;

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
        y: Math.max(0, Math.min(window.innerHeight - 550, e.clientY - dragOffset.y)),
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

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
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
      id: 'delta',
      label: 'Delta',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 4l-4 6h8L8 4z" fill="currentColor" fillOpacity="0.15" />
          <path d="M16 20l4-6h-8l4 6z" />
          <line x1="8" y1="10" x2="8" y2="20" />
          <line x1="16" y1="14" x2="16" y2="4" />
        </svg>
      ),
    },
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
      id: 'layout',
      label: 'Layout',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="10" y1="10" x2="10" y2="21" />
          <rect x="4" y="4" width="5" height="4" rx="1" fill="currentColor" fillOpacity="0.15" />
        </svg>
      ),
    },
    {
      id: 'features',
      label: 'Options',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="4" width="12" height="6" rx="3" />
          <circle cx="12" cy="7" r="2" fill="currentColor" />
          <rect x="9" y="14" width="12" height="6" rx="3" />
          <circle cx="12" cy="17" r="2" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div
      ref={modalRef}
      className="fixed z-[1000] select-none animate-slideInRight"
      style={{
        left: position.x,
        top: position.y,
        width: 400,
      }}
    >
      {/* Modal Container */}
      <div className="bg-[var(--surface)] backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden">
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
            <span className="text-sm font-semibold text-[var(--text-primary)]">Footprint Settings</span>
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
                  ? 'text-[var(--primary)] bg-[var(--primary)]/10 border-b-2 border-[var(--primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]'
                }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content p-4 max-h-[420px] overflow-y-auto">
          {/* Candles Settings */}
          {activeTab === 'candles' && (
            <div className="space-y-5">
              {/* Theme Presets */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Theme Presets</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(COLOR_PRESETS).map(preset => (
                    <button
                      key={preset}
                      onClick={() => settings.setColors(COLOR_PRESETS[preset as keyof typeof COLOR_PRESETS])}
                      className="px-3 py-1.5 rounded-lg text-xs capitalize border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                      style={{
                        backgroundColor: 'rgba(20, 20, 20, 0.8)',
                        color: '#a1a1aa',
                      }}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bullish Candle */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--primary)] mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: settings.colors.candleUpBody }} />
                  Bougie Haussiere
                </h4>

                {/* Body Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Corps</label>
                  <div className="flex flex-wrap gap-1">
                    {bullishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleUpBody: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.candleUpBody === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.candleUpBody}
                      onChange={(e) => settings.setColors({ candleUpBody: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Border Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Bordure</label>
                  <div className="flex flex-wrap gap-1">
                    {bullishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleUpBorder: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.candleUpBorder === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.candleUpBorder}
                      onChange={(e) => settings.setColors({ candleUpBorder: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Wick Color */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Meche</label>
                  <div className="flex flex-wrap gap-1">
                    {bullishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleUpWick: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.candleUpWick === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.candleUpWick}
                      onChange={(e) => settings.setColors({ candleUpWick: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Bearish Candle */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: settings.colors.candleDownBody }} />
                  Bougie Baissiere
                </h4>

                {/* Body Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Corps</label>
                  <div className="flex flex-wrap gap-1">
                    {bearishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleDownBody: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.candleDownBody === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.candleDownBody}
                      onChange={(e) => settings.setColors({ candleDownBody: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Border Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Bordure</label>
                  <div className="flex flex-wrap gap-1">
                    {bearishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleDownBorder: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.candleDownBorder === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.candleDownBorder}
                      onChange={(e) => settings.setColors({ candleDownBorder: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Wick Color */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Meche</label>
                  <div className="flex flex-wrap gap-1">
                    {bearishPalette.map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ candleDownWick: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.candleDownWick === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.candleDownWick}
                      onChange={(e) => settings.setColors({ candleDownWick: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Fond</label>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_GRAYS.slice(5).map(color => (
                    <button
                      key={color}
                      onClick={() => settings.setColors({ background: color })}
                      className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${
                        settings.colors.background === color ? 'border-[var(--primary)] scale-110' : 'border-[var(--border)]'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings.colors.background}
                    onChange={(e) => settings.setColors({ background: e.target.value })}
                    className="w-7 h-7 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Delta Settings */}
          {activeTab === 'delta' && (
            <div className="space-y-5">
              {/* Delta Positive */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--primary)] mb-3">Delta Positif</h4>
                <div className="flex flex-wrap gap-1">
                  {bullishPalette.map(color => (
                    <button
                      key={color}
                      onClick={() => settings.setColors({ deltaPositive: color })}
                      className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                        settings.colors.deltaPositive === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings.colors.deltaPositive}
                    onChange={(e) => settings.setColors({ deltaPositive: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Delta Negative */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-red-400 mb-3">Delta Negatif</h4>
                <div className="flex flex-wrap gap-1">
                  {bearishPalette.map(color => (
                    <button
                      key={color}
                      onClick={() => settings.setColors({ deltaNegative: color })}
                      className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                        settings.colors.deltaNegative === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings.colors.deltaNegative}
                    onChange={(e) => settings.setColors({ deltaNegative: e.target.value })}
                    className="w-6 h-6 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Imbalance Settings */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-amber-400 mb-3">Imbalance</h4>

                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Ratio: {settings.imbalance.ratio}x</label>
                  <input
                    type="range"
                    min={2}
                    max={5}
                    step={0.5}
                    value={settings.imbalance.ratio}
                    onChange={(e) => settings.setImbalance({ ratio: Number(e.target.value) })}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
                    <span>200%</span>
                    <span>300%</span>
                    <span>400%</span>
                    <span>500%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Buy Imbalance</label>
                    <div className="flex gap-1">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: settings.colors.imbalanceBuyBg }}
                      />
                      <input
                        type="color"
                        value={settings.colors.imbalanceBuyBg}
                        onChange={(e) => settings.setColors({ imbalanceBuyBg: e.target.value })}
                        className="flex-1 h-6 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Sell Imbalance</label>
                    <div className="flex gap-1">
                      <div
                        className="w-6 h-6 rounded"
                        style={{ backgroundColor: settings.colors.imbalanceSellBg }}
                      />
                      <input
                        type="color"
                        value={settings.colors.imbalanceSellBg}
                        onChange={(e) => settings.setColors({ imbalanceSellBg: e.target.value })}
                        className="flex-1 h-6 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* POC */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">POC (Point of Control)</label>
                <div className="flex gap-1">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: settings.colors.pocColor }}
                  />
                  <input
                    type="color"
                    value={settings.colors.pocColor}
                    onChange={(e) => settings.setColors({ pocColor: e.target.value })}
                    className="flex-1 h-6 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Current Price Line - Full Customization */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-blue-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <polygon points="21,12 17,8 17,16" fill="currentColor" />
                  </svg>
                  Current Price Line
                </h4>

                {/* Line Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Line Color</label>
                  <div className="flex flex-wrap gap-1">
                    {['#2196f3', '#22c55e', '#ef4444', '#fbbf24', '#a855f7', '#06b6d4', '#f97316', '#ffffff'].map(color => (
                      <button
                        key={color}
                        onClick={() => settings.setColors({ currentPriceColor: color, currentPriceLabelBg: color })}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          settings.colors.currentPriceColor === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.colors.currentPriceColor}
                      onChange={(e) => settings.setColors({ currentPriceColor: e.target.value, currentPriceLabelBg: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Line Width */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                    Line Width: {settings.colors.currentPriceLineWidth || 1}px
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={settings.colors.currentPriceLineWidth || 1}
                    onChange={(e) => settings.setColors({ currentPriceLineWidth: Number(e.target.value) })}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Line Style */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Line Style</label>
                  <div className="flex gap-1.5">
                    {(['solid', 'dashed', 'dotted'] as const).map(style => (
                      <button
                        key={style}
                        onClick={() => settings.setColors({ currentPriceLineStyle: style })}
                        className={`flex-1 py-1.5 px-2 rounded-lg border text-[10px] font-medium transition-all capitalize
                          ${settings.colors.currentPriceLineStyle === style
                            ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border)]'
                          }`}
                      >
                        {style === 'solid' ? 'Solid' : style === 'dashed' ? 'Dashed' : 'Dotted'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Show Price Label Toggle */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] text-[var(--text-muted)]">Show Price Label</span>
                  <button
                    onClick={() => settings.setColors({ currentPriceShowLabel: !settings.colors.currentPriceShowLabel })}
                    className={`w-10 h-5 rounded-full transition-all ${
                      settings.colors.currentPriceShowLabel !== false ? 'bg-blue-500' : 'bg-[var(--surface-elevated)]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                        settings.colors.currentPriceShowLabel !== false ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Label Background (shown only if label enabled) */}
                {settings.colors.currentPriceShowLabel !== false && (
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Label Background</label>
                    <div className="flex gap-1">
                      <div
                        className="w-6 h-6 rounded border border-[var(--border)]"
                        style={{ backgroundColor: settings.colors.currentPriceLabelBg || settings.colors.currentPriceColor }}
                      />
                      <input
                        type="color"
                        value={settings.colors.currentPriceLabelBg || settings.colors.currentPriceColor}
                        onChange={(e) => settings.setColors({ currentPriceLabelBg: e.target.value })}
                        className="flex-1 h-6 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Layout Settings */}
          {activeTab === 'layout' && (
            <div className="space-y-5">
              {/* Row Height */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                  Row Height: {settings.rowHeight}px
                </label>
                <input
                  type="range"
                  min={12}
                  max={28}
                  value={settings.rowHeight}
                  onChange={(e) => settings.setLayout({ rowHeight: Number(e.target.value) })}
                  className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>

              {/* Footprint Width */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                  Footprint Width: {settings.footprintWidth}px
                </label>
                <input
                  type="range"
                  min={80}
                  max={200}
                  value={settings.footprintWidth}
                  onChange={(e) => settings.setLayout({ footprintWidth: Number(e.target.value) })}
                  className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>

              {/* Max Visible Footprints */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                  Visible Candles: {settings.maxVisibleFootprints}
                </label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={settings.maxVisibleFootprints}
                  onChange={(e) => settings.setLayout({ maxVisibleFootprints: Number(e.target.value) })}
                  className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>

              {/* Container Opacity */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                  Container Opacity: {Math.round((settings.colors.footprintContainerOpacity ?? 0.03) * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={(settings.colors.footprintContainerOpacity ?? 0.03) * 100}
                  onChange={(e) => settings.setColors({ footprintContainerOpacity: Number(e.target.value) / 100 })}
                  className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>

              {/* Delta Profile Position */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Delta Profile Position</label>
                <div className="flex gap-2">
                  {(['left', 'right'] as const).map(pos => (
                    <button
                      key={pos}
                      onClick={() => settings.setLayout({ deltaProfilePosition: pos })}
                      className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all capitalize
                        ${settings.deltaProfilePosition === pos
                          ? 'border-[var(--primary)] bg-green-500/20 text-[var(--primary)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border)]'
                        }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Features Settings */}
          {activeTab === 'features' && (
            <div className="space-y-3">
              {Object.entries(settings.features).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
                >
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </h4>
                  </div>
                  <button
                    onClick={() => settings.setFeatures({ [key]: !value })}
                    className={`w-12 h-6 rounded-full transition-all ${
                      value ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                        value ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}

              {/* Passive Liquidity Settings (Simulation) */}
              {settings.features.showPassiveLiquidity && (
                <div className="mt-4 p-4 rounded-lg bg-cyan-900/20 border border-cyan-700/30">
                  <h4 className="text-xs font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3v18h18" />
                      <rect x="7" y="10" width="3" height="8" fill="currentColor" opacity="0.5" />
                      <rect x="14" y="6" width="3" height="12" fill="currentColor" opacity="0.5" />
                    </svg>
                    Passive Liquidity (Simulation)
                  </h4>

                  {/* Enable Toggle */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-[var(--text-muted)]">Enabled</span>
                    <button
                      onClick={() => settings.setPassiveLiquidity({ enabled: !settings.passiveLiquidity.enabled })}
                      className={`w-10 h-5 rounded-full transition-all ${
                        settings.passiveLiquidity.enabled ? 'bg-cyan-500' : 'bg-[var(--surface-elevated)]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                          settings.passiveLiquidity.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Intensity Slider */}
                  <div className="mb-3">
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                      Intensity: {Math.round(settings.passiveLiquidity.intensity * 100)}%
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={settings.passiveLiquidity.intensity * 100}
                      onChange={(e) => settings.setPassiveLiquidity({ intensity: Number(e.target.value) / 100 })}
                      className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>

                  {/* Opacity Slider */}
                  <div className="mb-3">
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                      Opacity: {Math.round(settings.passiveLiquidity.opacity * 100)}%
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={50}
                      value={settings.passiveLiquidity.opacity * 100}
                      onChange={(e) => settings.setPassiveLiquidity({ opacity: Number(e.target.value) / 100 })}
                      className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>

                  {/* Focus Ticks */}
                  <div className="mb-3">
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                      Focus: {settings.passiveLiquidity.focusTicks === 0 ? 'Show All' : `±${settings.passiveLiquidity.focusTicks} ticks`}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={settings.passiveLiquidity.focusTicks}
                      onChange={(e) => settings.setPassiveLiquidity({ focusTicks: Number(e.target.value) })}
                      className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </div>

                  {/* Colors */}
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Bid Color</label>
                      <input
                        type="color"
                        value={settings.passiveLiquidity.bidColor}
                        onChange={(e) => settings.setPassiveLiquidity({ bidColor: e.target.value })}
                        className="w-full h-6 rounded cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-[var(--text-muted)] mb-1">Ask Color</label>
                      <input
                        type="color"
                        value={settings.passiveLiquidity.askColor}
                        onChange={(e) => settings.setPassiveLiquidity({ askColor: e.target.value })}
                        className="w-full h-6 rounded cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Stability Section */}
                  <div className="pt-3 border-t border-cyan-700/30">
                    <h5 className="text-[10px] font-semibold text-cyan-400/80 mb-2 flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      Stability Filter
                    </h5>

                    {/* Stability Level */}
                    <div className="mb-3">
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Stability Level</label>
                      <div className="flex gap-1">
                        {(['low', 'medium', 'high'] as const).map(level => (
                          <button
                            key={level}
                            onClick={() => settings.setPassiveLiquidity({ stabilityLevel: level })}
                            className={`flex-1 py-1.5 px-2 rounded-lg border text-[10px] font-medium transition-all capitalize
                              ${settings.passiveLiquidity.stabilityLevel === level
                                ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border)]'
                              }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-[var(--text-muted)] mt-1">
                        {settings.passiveLiquidity.stabilityLevel === 'low' && 'Shows most liquidity, minimal filtering'}
                        {settings.passiveLiquidity.stabilityLevel === 'medium' && 'Balanced filtering (300ms presence)'}
                        {settings.passiveLiquidity.stabilityLevel === 'high' && 'Only persistent liquidity (500ms+)'}
                      </p>
                    </div>

                    {/* Show Only Persistent Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-[var(--text-muted)]">Show Only Persistent</span>
                        <p className="text-[9px] text-[var(--text-muted)]">Filter out spoofing & micro-adjustments</p>
                      </div>
                      <button
                        onClick={() => settings.setPassiveLiquidity({ showOnlyPersistent: !settings.passiveLiquidity.showOnlyPersistent })}
                        className={`w-10 h-5 rounded-full transition-all ${
                          settings.passiveLiquidity.showOnlyPersistent ? 'bg-cyan-500' : 'bg-[var(--surface-elevated)]'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                            settings.passiveLiquidity.showOnlyPersistent ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Crosshair Settings */}
          {activeTab === 'crosshair' && (
            <div className="space-y-5">
              {/* Crosshair Color */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Apparence
                </h4>

                {/* Color */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Couleur</label>
                  <div className="flex flex-wrap gap-1">
                    {['#6b7280', '#ffffff', '#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#fbbf24'].map(color => (
                      <button
                        key={color}
                        onClick={() => crosshair.setColor(color)}
                        className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                          crosshair.color === color ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={crosshair.color}
                      onChange={(e) => crosshair.setColor(e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Line Width */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                    Epaisseur: {crosshair.lineWidth}px
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    value={crosshair.lineWidth}
                    onChange={(e) => crosshair.setLineWidth(Number(e.target.value))}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>

                {/* Line Style */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Style de ligne</label>
                  <div className="flex gap-1.5">
                    {(['solid', 'dashed', 'dotted'] as CrosshairLineStyle[]).map(style => (
                      <button
                        key={style}
                        onClick={() => crosshair.setLineStyle(style)}
                        className={`flex-1 py-1.5 px-2 rounded-lg border text-[10px] font-medium transition-all capitalize
                          ${crosshair.lineStyle === style
                            ? 'border-[var(--primary)] bg-green-500/20 text-[var(--primary)]'
                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border)]'
                          }`}
                      >
                        {style === 'solid' ? 'Solide' : style === 'dashed' ? 'Tirets' : 'Points'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Opacity */}
                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                    Opacité: {Math.round(crosshair.opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={crosshair.opacity * 100}
                    onChange={(e) => crosshair.setOpacity(Number(e.target.value) / 100)}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>
              </div>

              {/* Magnet Mode */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-amber-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 15l6-6 6 6" />
                    <path d="M6 9l6-6 6 6" />
                  </svg>
                  Mode Magnet
                </h4>
                <div className="flex gap-1.5">
                  {([
                    { id: 'none', label: 'Désactivé' },
                    { id: 'ohlc', label: 'OHLC' },
                    { id: 'close', label: 'Close' },
                  ] as { id: MagnetMode; label: string }[]).map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => crosshair.setMagnetMode(mode.id)}
                      className={`flex-1 py-2 px-2 rounded-lg border text-[10px] font-medium transition-all
                        ${crosshair.magnetMode === mode.id
                          ? 'border-amber-500 bg-amber-500/20 text-amber-400'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border)]'
                        }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visibility Toggles */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">Visibilité</h4>
                <div className="space-y-2">
                  {[
                    { key: 'showHorizontalLine', label: 'Ligne horizontale', get: crosshair.showHorizontalLine, set: crosshair.setShowHorizontalLine },
                    { key: 'showVerticalLine', label: 'Ligne verticale', get: crosshair.showVerticalLine, set: crosshair.setShowVerticalLine },
                    { key: 'showPriceLabel', label: 'Label prix', get: crosshair.showPriceLabel, set: crosshair.setShowPriceLabel },
                    { key: 'showTimeLabel', label: 'Label temps', get: crosshair.showTimeLabel, set: crosshair.setShowTimeLabel },
                  ].map(item => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-[11px] text-[var(--text-muted)]">{item.label}</span>
                      <button
                        onClick={() => item.set(!item.get)}
                        className={`w-10 h-5 rounded-full transition-all ${
                          item.get ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                            item.get ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Label Colors */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">Couleurs des labels</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Fond</label>
                    <div className="flex gap-1">
                      <div
                        className="w-6 h-6 rounded border border-[var(--border)]"
                        style={{ backgroundColor: crosshair.labelBackground }}
                      />
                      <input
                        type="color"
                        value={crosshair.labelBackground}
                        onChange={(e) => crosshair.setLabelBackground(e.target.value)}
                        className="flex-1 h-6 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">Texte</label>
                    <div className="flex gap-1">
                      <div
                        className="w-6 h-6 rounded border border-[var(--border)]"
                        style={{ backgroundColor: crosshair.labelTextColor }}
                      />
                      <input
                        type="color"
                        value={crosshair.labelTextColor}
                        onChange={(e) => crosshair.setLabelTextColor(e.target.value)}
                        className="flex-1 h-6 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Reset Button */}
              <button
                onClick={() => crosshair.resetToDefaults()}
                className="w-full py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] rounded-lg transition-colors"
              >
                Réinitialiser les paramètres du crosshair
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[var(--surface)] border-t border-[var(--border)] flex items-center justify-between">
          <button
            onClick={() => settings.resetToDefaults()}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-[var(--text-primary)] text-xs font-medium rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
