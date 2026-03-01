'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  useFootprintSettingsStore,
  COLOR_PRESETS,
  THEME_LABELS,
  type FootprintColors,
} from '@/stores/useFootprintSettingsStore';
import { useCrosshairStore, type CrosshairLineStyle, type MagnetMode } from '@/stores/useCrosshairStore';
import { InlineColorSwatch } from '@/components/tools/InlineColorSwatch';

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

type SettingsTab = 'candles' | 'delta' | 'layout' | 'features' | 'indicators' | 'crosshair';

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
  const modalRef = useRef<HTMLDivElement>(null);


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
      label: 'Profiles',
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
      id: 'indicators',
      label: 'Indicators',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 17l6-6 4 4 8-8" />
          <circle cx="21" cy="7" r="2" fill="currentColor" fillOpacity="0.4" />
          <line x1="3" y1="21" x2="21" y2="21" />
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
      role="dialog"
      aria-modal="true"
      aria-label="Footprint Settings"
      className="fixed z-[50] select-none animate-slideInRight"
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
            aria-label="Close settings"
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
                  {Object.keys(COLOR_PRESETS).map(preset => {
                    const colors = COLOR_PRESETS[preset as keyof typeof COLOR_PRESETS];
                    return (
                      <button
                        key={preset}
                        onClick={() => settings.setColors(colors)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border hover:border-[var(--primary)] transition-colors"
                        style={{
                          backgroundColor: settings.colors.background === colors.background ? 'var(--surface-elevated)' : 'var(--surface)',
                          border: `1px solid ${settings.colors.background === colors.background ? 'var(--primary)' : 'var(--border)'}`,
                          color: settings.colors.background === colors.background ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        <div className="flex gap-0.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.background, border: '1px solid var(--border-light)' }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.candleUpBody }} />
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.askColor }} />
                        </div>
                        {THEME_LABELS[preset] || preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bullish Candle */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--primary)] mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: settings.colors.candleUpBody }} />
                  Bougie Haussiere
                </h4>

                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Corps</span>
                  <InlineColorSwatch value={settings.colors.candleUpBody} onChange={(c) => settings.setColors({ candleUpBody: c })} />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Bordure</span>
                  <InlineColorSwatch value={settings.colors.candleUpBorder} onChange={(c) => settings.setColors({ candleUpBorder: c })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Meche</span>
                  <InlineColorSwatch value={settings.colors.candleUpWick} onChange={(c) => settings.setColors({ candleUpWick: c })} />
                </div>
              </div>

              {/* Bearish Candle */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: settings.colors.candleDownBody }} />
                  Bougie Baissiere
                </h4>

                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Corps</span>
                  <InlineColorSwatch value={settings.colors.candleDownBody} onChange={(c) => settings.setColors({ candleDownBody: c })} />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Bordure</span>
                  <InlineColorSwatch value={settings.colors.candleDownBorder} onChange={(c) => settings.setColors({ candleDownBorder: c })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Meche</span>
                  <InlineColorSwatch value={settings.colors.candleDownWick} onChange={(c) => settings.setColors({ candleDownWick: c })} />
                </div>
              </div>

              {/* Background Color */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[var(--text-muted)]">Fond</span>
                <InlineColorSwatch value={settings.colors.background} onChange={(c) => settings.setColors({ background: c })} />
              </div>
            </div>
          )}

          {/* Delta Settings */}
          {activeTab === 'delta' && (
            <div className="space-y-5">
              {/* Delta Positive */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--primary)] mb-3">Delta Positif</h4>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Color</span>
                  <InlineColorSwatch value={settings.colors.deltaPositive} onChange={(c) => settings.setColors({ deltaPositive: c })} />
                </div>
              </div>

              {/* Delta Negative */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-red-400 mb-3">Delta Negatif</h4>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Color</span>
                  <InlineColorSwatch value={settings.colors.deltaNegative} onChange={(c) => settings.setColors({ deltaNegative: c })} />
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
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Buy Imbalance</label>
                    <InlineColorSwatch value={settings.colors.imbalanceBuyBg} onChange={(c) => settings.setColors({ imbalanceBuyBg: c })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Sell Imbalance</label>
                    <InlineColorSwatch value={settings.colors.imbalanceSellBg} onChange={(c) => settings.setColors({ imbalanceSellBg: c })} />
                  </div>
                </div>
              </div>

              {/* POC */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-muted)]">POC (Point of Control)</label>
                <InlineColorSwatch value={settings.colors.pocColor} onChange={(c) => settings.setColors({ pocColor: c })} />
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
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[11px] text-[var(--text-muted)]">Line Color</label>
                  <InlineColorSwatch value={settings.colors.currentPriceColor} onChange={(c) => settings.setColors({ currentPriceColor: c, currentPriceLabelBg: c })} />
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
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Label Background</label>
                    <InlineColorSwatch value={settings.colors.currentPriceLabelBg || settings.colors.currentPriceColor} onChange={(c) => settings.setColors({ currentPriceLabelBg: c })} />
                  </div>
                )}
              </div>

              {/* ═══ VOLUME PROFILE SETTINGS ═══ */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-indigo-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="4" height="18" rx="1" />
                    <rect x="10" y="8" width="4" height="13" rx="1" />
                    <rect x="17" y="5" width="4" height="16" rx="1" />
                  </svg>
                  Volume Profile
                </h4>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Value Area</label>
                    <InlineColorSwatch value={settings.features.volumeProfileColor || '#5e7ce2'} onChange={(c) => settings.setFeatures({ volumeProfileColor: c })} size={5} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Outside VA</label>
                    <InlineColorSwatch value={settings.features.volumeProfileOutsideColor || '#3a3f4b'} onChange={(c) => settings.setFeatures({ volumeProfileOutsideColor: c })} size={5} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">POC Bar</label>
                    <InlineColorSwatch value={settings.features.volumeProfilePocColor || '#e2b93b'} onChange={(c) => settings.setFeatures({ volumeProfilePocColor: c })} size={5} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">VAH/VAL Lines</label>
                    <InlineColorSwatch value={settings.features.volumeProfileVahValColor || '#7c85f6'} onChange={(c) => settings.setFeatures({ volumeProfileVahValColor: c })} size={5} />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                    Opacity: {Math.round((settings.features.volumeProfileOpacity ?? 0.7) * 100)}%
                  </label>
                  <input type="range" min={0.1} max={1} step={0.05}
                    value={settings.features.volumeProfileOpacity ?? 0.7}
                    onChange={(e) => settings.setFeatures({ volumeProfileOpacity: Number(e.target.value) })}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                </div>
              </div>

              {/* ═══ DELTA PROFILE SETTINGS ═══ */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l-8 12h16L12 2z" fill="currentColor" fillOpacity="0.15" />
                    <line x1="12" y1="14" x2="12" y2="22" />
                  </svg>
                  Delta Profile
                </h4>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Positive Delta</label>
                    <InlineColorSwatch value={settings.features.deltaProfilePositiveColor || '#22c55e'} onChange={(c) => settings.setFeatures({ deltaProfilePositiveColor: c })} size={5} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Negative Delta</label>
                    <InlineColorSwatch value={settings.features.deltaProfileNegativeColor || '#ef4444'} onChange={(c) => settings.setFeatures({ deltaProfileNegativeColor: c })} size={5} />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                    Opacity: {Math.round((settings.features.deltaProfileOpacity ?? 0.7) * 100)}%
                  </label>
                  <input type="range" min={0.1} max={1} step={0.05}
                    value={settings.features.deltaProfileOpacity ?? 0.7}
                    onChange={(e) => settings.setFeatures({ deltaProfileOpacity: Number(e.target.value) })}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                </div>
              </div>

              {/* ═══ VWAP / TWAP SETTINGS ═══ */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-amber-400 mb-3 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4,18 8,12 12,14 16,8 20,10" />
                  </svg>
                  VWAP / TWAP
                </h4>

                {/* VWAP */}
                <div className="mb-4 pb-3 border-b border-[var(--border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">VWAP</span>
                    <button
                      onClick={() => settings.setFeatures({ showVWAP: !(settings.features.showVWAP !== false) })}
                      className={`w-10 h-5 rounded-full transition-all ${
                        settings.features.showVWAP !== false ? 'bg-amber-500' : 'bg-[var(--surface-elevated)]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                        settings.features.showVWAP !== false ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  {settings.features.showVWAP !== false && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-[var(--text-muted)]">Color</label>
                        <InlineColorSwatch value={settings.features.vwapColor || '#e2b93b'} onChange={(c) => settings.setFeatures({ vwapColor: c })} size={5} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Width: {settings.features.vwapLineWidth || 2.5}px
                        </label>
                        <input type="range" min={1} max={5} step={0.5}
                          value={settings.features.vwapLineWidth || 2.5}
                          onChange={(e) => settings.setFeatures({ vwapLineWidth: Number(e.target.value) })}
                          className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-amber-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-muted)]">Show Label</span>
                        <button
                          onClick={() => settings.setFeatures({ vwapShowLabel: !(settings.features.vwapShowLabel !== false) })}
                          className={`w-10 h-5 rounded-full transition-all ${
                            settings.features.vwapShowLabel !== false ? 'bg-amber-500' : 'bg-[var(--surface-elevated)]'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                            settings.features.vwapShowLabel !== false ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                      {/* VWAP Bands */}
                      <div className="mt-2 pt-2 border-t border-[var(--border)]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] text-[var(--text-muted)]">Std Dev Bands</span>
                          <button
                            onClick={() => settings.setFeatures({ showVWAPBands: !settings.features.showVWAPBands })}
                            className={`w-10 h-5 rounded-full transition-all ${
                              settings.features.showVWAPBands ? 'bg-amber-500' : 'bg-[var(--surface-elevated)]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                              settings.features.showVWAPBands ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                        {settings.features.showVWAPBands && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-[var(--text-muted)]">Bands:</span>
                              {[1, 2, 3].map(n => {
                                const multipliers = settings.features.vwapBandMultipliers || [1, 2];
                                const active = multipliers.includes(n);
                                return (
                                  <button key={n} onClick={() => {
                                    const newMults = active
                                      ? multipliers.filter((m: number) => m !== n)
                                      : [...multipliers, n].sort((a: number, b: number) => a - b);
                                    settings.setFeatures({ vwapBandMultipliers: newMults });
                                  }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                      active ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-[var(--text-muted)] border border-transparent'
                                    }`}
                                  >{n}σ</button>
                                );
                              })}
                            </div>
                            <div>
                              <label className="block text-[10px] text-[var(--text-muted)] mb-1">
                                Fill Opacity: {Math.round((settings.features.vwapBandOpacity ?? 0.06) * 100)}%
                              </label>
                              <input type="range" min={0} max={0.3} step={0.01}
                                value={settings.features.vwapBandOpacity ?? 0.06}
                                onChange={(e) => settings.setFeatures({ vwapBandOpacity: Number(e.target.value) })}
                                className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-amber-500" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* TWAP */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">TWAP</span>
                    <button
                      onClick={() => settings.setFeatures({ showTWAP: !(settings.features.showTWAP !== false) })}
                      className={`w-10 h-5 rounded-full transition-all ${
                        settings.features.showTWAP !== false ? 'bg-blue-500' : 'bg-[var(--surface-elevated)]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                        settings.features.showTWAP !== false ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  {settings.features.showTWAP !== false && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-[var(--text-muted)]">Color</label>
                        <InlineColorSwatch value={settings.features.twapColor || '#5eaeff'} onChange={(c) => settings.setFeatures({ twapColor: c })} size={5} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                          Width: {settings.features.twapLineWidth || 2}px
                        </label>
                        <input type="range" min={1} max={5} step={0.5}
                          value={settings.features.twapLineWidth || 2}
                          onChange={(e) => settings.setFeatures({ twapLineWidth: Number(e.target.value) })}
                          className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-muted)]">Show Label</span>
                        <button
                          onClick={() => settings.setFeatures({ twapShowLabel: !(settings.features.twapShowLabel !== false) })}
                          className={`w-10 h-5 rounded-full transition-all ${
                            settings.features.twapShowLabel !== false ? 'bg-blue-500' : 'bg-[var(--surface-elevated)]'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                            settings.features.twapShowLabel !== false ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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

              {/* Font Settings */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-3">Font</h4>

                {/* Font Family */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">Font Family</label>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { id: 'consolas', label: 'Consolas', value: '"Consolas", "Monaco", "Courier New", monospace' },
                      { id: 'monaco', label: 'Monaco', value: '"Monaco", "Consolas", monospace' },
                      { id: 'menlo', label: 'Menlo', value: '"Menlo", "Consolas", monospace' },
                      { id: 'system', label: 'System', value: 'ui-monospace, monospace' },
                    ].map(font => (
                      <button
                        key={font.id}
                        onClick={() => settings.setFonts({ volumeFont: font.value, deltaFont: font.value, priceFont: font.value })}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all
                          ${settings.fonts.volumeFont.includes(font.id === 'system' ? 'ui-monospace' : font.label)
                            ? 'border-[var(--primary)] bg-green-500/20 text-[var(--primary)]'
                            : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
                          }`}
                        style={{ fontFamily: font.value }}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="mb-3">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1.5">
                    Volume Font Size: {settings.fonts.volumeFontSize}px
                  </label>
                  <input
                    type="range"
                    min={8}
                    max={14}
                    value={settings.fonts.volumeFontSize}
                    onChange={(e) => settings.setFonts({ volumeFontSize: Number(e.target.value) })}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                </div>

                {/* Bold Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)]">Bold Volume Text</span>
                  <button
                    onClick={() => settings.setFonts({ volumeFontBold: !settings.fonts.volumeFontBold })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.fonts.volumeFontBold ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.fonts.volumeFontBold ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Grid Opacity */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                  Grid Opacity: {Math.round((settings.colors.gridOpacity ?? 0.4) * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((settings.colors.gridOpacity ?? 0.4) * 100)}
                  onChange={(e) => settings.setColors({ gridOpacity: Number(e.target.value) / 100 })}
                  className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
            </div>
          )}

          {/* Features Settings */}
          {activeTab === 'indicators' && (
            <div className="space-y-4">
              {/* CVD Oscillator Panel */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">CVD Panel</h4>
                  <button
                    onClick={() => settings.setFeatures({ showCVDPanel: !settings.features.showCVDPanel })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showCVDPanel ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showCVDPanel ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showCVDPanel && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-[var(--text-muted)]">Color</label>
                      <InlineColorSwatch value={settings.features.cvdLineColor || '#22c55e'} onChange={(c) => settings.setFeatures({ cvdLineColor: c })} size={5} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Height: {settings.features.cvdPanelHeight || 70}px
                      </label>
                      <input type="range" min={40} max={120} step={5}
                        value={settings.features.cvdPanelHeight || 70}
                        onChange={(e) => settings.setFeatures({ cvdPanelHeight: Number(e.target.value) })}
                        className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-green-500" />
                    </div>
                  </div>
                )}
              </div>

              {/* TPO / Market Profile */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">TPO / Market Profile</h4>
                  <button
                    onClick={() => settings.setFeatures({ showTPO: !settings.features.showTPO } as any)}
                    className={`w-10 h-5 rounded-full transition-all ${(settings.features as any).showTPO ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${(settings.features as any).showTPO ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {(settings.features as any).showTPO && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)]">Period:</span>
                      {([30, 60] as const).map(p => (
                        <button key={p} onClick={() => settings.setFeatures({ tpoPeriod: p } as any)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                            ((settings.features as any).tpoPeriod || 30) === p
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'text-[var(--text-muted)] border border-transparent'
                          }`}
                        >{p}min</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)]">Mode:</span>
                      {(['letters', 'histogram'] as const).map(m => (
                        <button key={m} onClick={() => settings.setFeatures({ tpoMode: m } as any)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all capitalize ${
                            ((settings.features as any).tpoMode || 'letters') === m
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'text-[var(--text-muted)] border border-transparent'
                          }`}
                        >{m}</button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)]">Position:</span>
                      {(['left', 'right'] as const).map(pos => (
                        <button key={pos} onClick={() => settings.setFeatures({ tpoPosition: pos } as any)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all capitalize ${
                            ((settings.features as any).tpoPosition || 'right') === pos
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                              : 'text-[var(--text-muted)] border border-transparent'
                          }`}
                        >{pos}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Heatmap Cells */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Heatmap Cells</h4>
                  <button
                    onClick={() => settings.setFeatures({ showHeatmapCells: !settings.features.showHeatmapCells })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showHeatmapCells ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showHeatmapCells ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showHeatmapCells && (
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Intensity: {Math.round((settings.features.heatmapIntensity || 0.4) * 100)}%
                    </label>
                    <input
                      type="range" min={10} max={100}
                      value={Math.round((settings.features.heatmapIntensity || 0.4) * 100)}
                      onChange={(e) => settings.setFeatures({ heatmapIntensity: Number(e.target.value) / 100 })}
                      className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Developing POC */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Developing POC</h4>
                  <button
                    onClick={() => settings.setFeatures({ showDevelopingPOC: !settings.features.showDevelopingPOC })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showDevelopingPOC ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showDevelopingPOC ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showDevelopingPOC && (
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Color</label>
                    <InlineColorSwatch value={settings.features.developingPOCColor || '#fbbf24'} onChange={(c) => settings.setFeatures({ developingPOCColor: c })} size={5} />
                  </div>
                )}
              </div>

              {/* Large Trade Highlight */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Large Trades</h4>
                  <button
                    onClick={() => settings.setFeatures({ showLargeTradeHighlight: !settings.features.showLargeTradeHighlight })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showLargeTradeHighlight ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showLargeTradeHighlight ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showLargeTradeHighlight && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                        Multiplier: {(settings.features.largeTradeMultiplier || 2.0).toFixed(1)}x
                      </label>
                      <input
                        type="range" min={10} max={50} step={5}
                        value={Math.round((settings.features.largeTradeMultiplier || 2.0) * 10)}
                        onChange={(e) => settings.setFeatures({ largeTradeMultiplier: Number(e.target.value) / 10 })}
                        className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-yellow-500"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-[var(--text-muted)]">Color</label>
                      <InlineColorSwatch value={settings.features.largeTradeColor || '#ffd700'} onChange={(c) => settings.setFeatures({ largeTradeColor: c })} size={5} />
                    </div>
                  </div>
                )}
              </div>

              {/* Stacked Imbalances */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Stacked Imbalances</h4>
                  <button
                    onClick={() => settings.setFeatures({ showStackedImbalances: !settings.features.showStackedImbalances })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showStackedImbalances ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showStackedImbalances ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showStackedImbalances && (
                  <div>
                    <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                      Min Consecutive: {settings.features.stackedImbalanceMin || 3}
                    </label>
                    <input
                      type="range" min={2} max={10}
                      value={settings.features.stackedImbalanceMin || 3}
                      onChange={(e) => settings.setFeatures({ stackedImbalanceMin: Number(e.target.value) })}
                      className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                )}
              </div>

              {/* Naked POC */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Naked POC</h4>
                  <button
                    onClick={() => settings.setFeatures({ showNakedPOC: !settings.features.showNakedPOC })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showNakedPOC ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showNakedPOC ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showNakedPOC && (
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Color</label>
                    <InlineColorSwatch value={settings.features.nakedPOCColor || '#fbbf24'} onChange={(c) => settings.setFeatures({ nakedPOCColor: c })} size={5} />
                  </div>
                )}
              </div>

              {/* Unfinished Auctions */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Unfinished Auctions</h4>
                  <button
                    onClick={() => settings.setFeatures({ showUnfinishedAuctions: !settings.features.showUnfinishedAuctions })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showUnfinishedAuctions ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showUnfinishedAuctions ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Session Separators */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Session Separators</h4>
                  <button
                    onClick={() => settings.setFeatures({ showSessionSeparators: !settings.features.showSessionSeparators })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showSessionSeparators ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showSessionSeparators ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {settings.features.showSessionSeparators && settings.features.customSessions && (
                  <div className="space-y-2 mt-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {settings.features.customSessions.map((session: any, idx: number) => (
                      <div key={session.id} className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const updated = [...settings.features.customSessions];
                            updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                            settings.setFeatures({ customSessions: updated });
                          }}
                          className={`w-8 h-4 rounded-full transition-all flex-shrink-0 ${
                            session.enabled ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full bg-white shadow transform transition-transform ${
                            session.enabled ? 'translate-x-4' : 'translate-x-0.5'
                          }`} />
                        </button>
                        <span className="text-[10px] text-[var(--text-secondary)] w-14">{session.label}</span>
                        <InlineColorSwatch value={session.color} onChange={(c) => {
                            const updated = [...settings.features.customSessions];
                            updated[idx] = { ...updated[idx], color: c };
                            settings.setFeatures({ customSessions: updated });
                          }} size={5} />
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {String(session.startUTC).padStart(2, '0')}:00-{String(session.endUTC).padStart(2, '0')}:00 UTC
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bid/Ask Spread */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[var(--text-secondary)]">Bid/Ask Spread</h4>
                  <button
                    onClick={() => settings.setFeatures({ showSpread: !settings.features.showSpread })}
                    className={`w-10 h-5 rounded-full transition-all ${settings.features.showSpread ? 'bg-green-500' : 'bg-[var(--surface-elevated)]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${settings.features.showSpread ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {/* Volume Filter */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Volume Filter</h4>
                <div className="mb-2">
                  <label className="block text-[11px] text-[var(--text-muted)] mb-1">
                    Threshold: {settings.features.volumeFilterThreshold || 0}{settings.features.volumeFilterMode === 'relative' ? '%' : ''}
                  </label>
                  <input
                    type="range" min={0} max={settings.features.volumeFilterMode === 'relative' ? 50 : 100}
                    value={settings.features.volumeFilterThreshold || 0}
                    onChange={(e) => settings.setFeatures({ volumeFilterThreshold: Number(e.target.value) })}
                    className="w-full h-2 bg-[var(--surface-elevated)] rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>
                <div className="flex gap-1.5">
                  {(['relative', 'absolute'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => settings.setFeatures({ volumeFilterMode: mode, volumeFilterThreshold: 0 })}
                      className={`flex-1 py-1 px-2 rounded-lg border text-[10px] font-medium transition-all capitalize
                        ${(settings.features.volumeFilterMode || 'relative') === mode
                          ? 'border-orange-500 bg-orange-500/20 text-orange-400'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
                        }`}
                    >
                      {mode === 'relative' ? '% of Max' : 'Absolute'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'features' && (() => {
            const FEATURE_LABELS: Record<string, string> = {
              showGrid: 'Grid Lines',
              showOHLC: 'OHLC Candles',
              showDeltaProfile: 'Delta Profile',
              showPOC: 'Point of Control',
              showImbalances: 'Imbalance Highlights',
              showCurrentPrice: 'Current Price Line',
              showVolumeProfile: 'Volume Profile (VAH/VAL)',
              showDeltaPerLevel: 'Delta Per Level',
              showTotalDelta: 'Total Delta Bar',
              showClusterStatic: 'Cluster Panel (Bottom)',
              showVWAPTWAP: 'VWAP / TWAP',
              showHourMarkers: 'Hour Markers',
              showPassiveLiquidity: 'Passive Liquidity',
            };
            const indicatorKeys = [
              'showHeatmapCells', 'showDevelopingPOC', 'showLargeTradeHighlight',
              'showStackedImbalances', 'showNakedPOC', 'showUnfinishedAuctions',
              'showSpread', 'showSessionSeparators', 'showAbsorptionEvents',
              'showVWAP', 'showTWAP', 'vwapShowLabel', 'twapShowLabel',
              'clusterDisplayMode', 'showCVDPanel', 'showVWAPBands', 'showTPO',
              'aggregationMode', 'tickBarSize', 'volumeBarSize',
            ];
            return (
            <div className="space-y-3">
              {/* Cluster Display Mode Selector */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Cluster Display Mode</h4>
                <div className="grid grid-cols-4 gap-1">
                  {([
                    { value: 'bid-ask', label: 'Bid x Ask' },
                    { value: 'delta', label: 'Delta' },
                    { value: 'volume', label: 'Volume' },
                    { value: 'bid-ask-split', label: 'Bid | Ask' },
                  ] as const).map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => settings.setFeatures({ clusterDisplayMode: mode.value })}
                      className={`px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                        (settings.features.clusterDisplayMode ?? 'bid-ask') === mode.value
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border)]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar Aggregation Mode */}
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Bar Aggregation Mode</h4>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { value: 'time', label: 'Time' },
                    { value: 'tick', label: 'Tick' },
                    { value: 'volume', label: 'Volume' },
                  ] as const).map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => settings.setFeatures({ aggregationMode: mode.value })}
                      className={`px-2 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                        (settings.features.aggregationMode ?? 'time') === mode.value
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border)]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {settings.features.aggregationMode === 'tick' && (
                  <div className="mt-2">
                    <label className="text-[10px] text-[var(--text-muted)] mb-1 block">Trades per bar: {settings.features.tickBarSize}</label>
                    <input
                      type="range"
                      min={50}
                      max={5000}
                      step={50}
                      value={settings.features.tickBarSize}
                      onChange={(e) => settings.setFeatures({ tickBarSize: Number(e.target.value) })}
                      className="w-full h-1 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                )}
                {settings.features.aggregationMode === 'volume' && (
                  <div className="mt-2">
                    <label className="text-[10px] text-[var(--text-muted)] mb-1 block">Volume per bar: {settings.features.volumeBarSize}</label>
                    <input
                      type="range"
                      min={10}
                      max={10000}
                      step={10}
                      value={settings.features.volumeBarSize}
                      onChange={(e) => settings.setFeatures({ volumeBarSize: Number(e.target.value) })}
                      className="w-full h-1 bg-[var(--border)] rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                )}
              </div>

              {Object.entries(settings.features)
                .filter(([key, value]) => {
                  if (typeof value !== 'boolean') return false;
                  return !indicatorKeys.includes(key);
                })
                .map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]"
                >
                  <div>
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">
                      {FEATURE_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
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
                    <div className="flex-1 flex items-center justify-between">
                      <label className="text-[10px] text-[var(--text-muted)]">Bid Color</label>
                      <InlineColorSwatch value={settings.passiveLiquidity.bidColor} onChange={(c) => settings.setPassiveLiquidity({ bidColor: c })} size={5} />
                    </div>
                    <div className="flex-1 flex items-center justify-between">
                      <label className="text-[10px] text-[var(--text-muted)]">Ask Color</label>
                      <InlineColorSwatch value={settings.passiveLiquidity.askColor} onChange={(c) => settings.setPassiveLiquidity({ askColor: c })} size={5} />
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
            );
          })()}

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
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[11px] text-[var(--text-muted)]">Couleur</label>
                  <InlineColorSwatch value={crosshair.color} onChange={(c) => crosshair.setColor(c)} />
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
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Fond</label>
                    <InlineColorSwatch value={crosshair.labelBackground} onChange={(c) => crosshair.setLabelBackground(c)} size={5} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-[var(--text-muted)]">Texte</label>
                    <InlineColorSwatch value={crosshair.labelTextColor} onChange={(c) => crosshair.setLabelTextColor(c)} size={5} />
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => settings.resetToDefaults()}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => {
                const json = settings.exportSettings();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `footprint-settings-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Export
            </button>
            <label className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer">
              Import
              <input type="file" accept=".json" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const success = settings.importSettings(reader.result as string);
                  if (!success) toast.error('Invalid settings file');
                };
                reader.readAsText(file);
                e.target.value = '';
              }} />
            </label>
          </div>
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
